import json
import logging
import os
import re
import secrets
import shutil
import stat
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from config import CONFIG_DIR, OUTBOX_DIR, OUTBOX_INDEX_FILE
from env_resolver import resolve_graphical_env

logger = logging.getLogger("deckcomp.outbox")

# Strict alphanumeric/hyphen/underscore file ID format
FILE_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\-]+$")

# Sensitive directory names that cannot be staged
FORBIDDEN_DIR_PARTS = {
    ".ssh",
    ".gnupg",
    ".config/deckcompanion",
    ".config/deckcomp",
    ".local/share/deckcompanion",
    ".local/share/deckcomp",
}


class OutboxService:
    def __init__(self):
        OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(OUTBOX_DIR, 0o700)
        except OSError:
            pass
        self._lock = threading.Lock()

    def _load_index_locked(self) -> Dict[str, Dict[str, Any]]:
        if OUTBOX_INDEX_FILE.exists():
            try:
                st = os.stat(OUTBOX_INDEX_FILE, follow_symlinks=False)
                if stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid():
                    if (st.st_mode & 0o077) != 0:
                        os.chmod(OUTBOX_INDEX_FILE, 0o600)
                    return json.loads(OUTBOX_INDEX_FILE.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"Failed to read outbox index: {e}")
        return {}

    def _save_index_locked(self, data: Dict[str, Dict[str, Any]]) -> None:
        temp_file = OUTBOX_DIR / f".tmp_index_{secrets.token_hex(8)}"
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(temp_file, flags, 0o600)
        try:
            with open(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
                f.flush()
                os.fsync(fd)
            os.replace(temp_file, OUTBOX_INDEX_FILE)

            # Fsync the parent directory to guarantee atomic directory entry persistence
            dir_fd = os.open(OUTBOX_DIR, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except Exception as e:
            if temp_file.exists():
                temp_file.unlink(missing_ok=True)
            logger.error(f"Failed to atomically persist outbox index: {e}")
            raise

    def _is_safe_path(self, path: Path) -> bool:
        """
        Verifies that the target path is inside the user's home directory and not within sensitive secret directories.
        """
        try:
            resolved = path.resolve(strict=True)
            user_home = Path.home().resolve()
            # Must be within user's home directory
            resolved.relative_to(user_home)

            # Check for forbidden sensitive directories
            path_str = str(resolved)
            for forbidden in FORBIDDEN_DIR_PARTS:
                if f"/{forbidden}/" in f"/{path_str}/" or path_str.endswith(f"/{forbidden}"):
                    return False

            return True
        except (ValueError, FileNotFoundError, RuntimeError):
            return False

    def _dispatch_notification(self, title: str, message: str) -> None:
        notify_bin = shutil.which("notify-send")
        if not notify_bin:
            return
        try:
            env = resolve_graphical_env()
            subprocess.Popen(
                [
                    notify_bin,
                    "-u", "normal",
                    "-a", "DeckComp",
                    "-i", "document-send",
                    title,
                    message,
                ],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
                close_fds=True,
                env=env,
            )
        except Exception as e:
            logger.warning(f"notify-send failed: {e}")

    def stage_file(self, file_path_str: str) -> Dict[str, Any]:
        """
        Stages a local file on the Arch host for mobile client retrieval.
        Creates a hardlink (or copy) inside OUTBOX_DIR with strict path validation and atomic indexing.
        """
        if not file_path_str or not file_path_str.strip():
            raise ValueError("File path cannot be empty")

        src_path = Path(os.path.expanduser(file_path_str.strip())).resolve()
        if not src_path.exists():
            raise FileNotFoundError(f"File '{src_path}' does not exist on host filesystem")
        if not src_path.is_file():
            raise ValueError(f"Path '{src_path}' is not a regular file")

        if not self._is_safe_path(src_path):
            raise PermissionError(f"Access denied: Staging files from '{src_path}' is restricted for security.")

        file_size = src_path.stat().st_size
        filename = re.sub(r'[\x00-\x1f\x7f/\\:\0]', '', src_path.name).strip()[:200] or "shared.bin"
        file_id = f"{int(time.time())}_{secrets.token_hex(6)}"

        dest_file = OUTBOX_DIR / f"{file_id}_{filename}"

        with self._lock:
            # Hardlink first, fallback to copy
            try:
                os.link(src_path, dest_file)
            except OSError:
                shutil.copy2(src_path, dest_file)

            try:
                os.chmod(dest_file, 0o600)
            except OSError:
                pass

            item = {
                "id": file_id,
                "filename": filename,
                "size_bytes": file_size,
                "staged_at": time.time(),
                "stored_name": dest_file.name,
            }

            try:
                index = self._load_index_locked()
                index[file_id] = item
                self._save_index_locked(index)
            except Exception:
                # Clean up partial staged file on index failure
                if dest_file.exists():
                    dest_file.unlink(missing_ok=True)
                raise

        size_kb = max(1, file_size // 1024)
        size_str = f"{size_kb} KB" if size_kb < 1024 else f"{size_kb / 1024:.1f} MB"
        self._dispatch_notification(
            "DeckComp • Sending to Phone",
            f"Staged '{filename}' ({size_str}) waiting for phone transfer.",
        )
        logger.info(f"Staged file '{filename}' with ID {file_id}")
        return {
            "id": file_id,
            "filename": filename,
            "size_bytes": file_size,
            "staged_at": item["staged_at"],
        }

    def list_pending(self) -> List[Dict[str, Any]]:
        with self._lock:
            index = self._load_index_locked()
            results = []
            cleaned = False

            for file_id, item in list(index.items()):
                file_on_disk = OUTBOX_DIR / item["stored_name"]
                if file_on_disk.exists():
                    results.append({
                        "id": item["id"],
                        "filename": item["filename"],
                        "size_bytes": item["size_bytes"],
                        "staged_at": item["staged_at"],
                    })
                else:
                    del index[file_id]
                    cleaned = True

            if cleaned:
                try:
                    self._save_index_locked(index)
                except Exception:
                    pass

        results.sort(key=lambda x: x.get("staged_at", 0), reverse=True)
        return results

    def get_file_info(self, file_id: str) -> Tuple[Path, str]:
        if not FILE_ID_REGEX.match(file_id):
            raise ValueError("Invalid file ID format")

        with self._lock:
            index = self._load_index_locked()
            item = index.get(file_id)
            if not item:
                raise FileNotFoundError(f"File with ID '{file_id}' not found in outbox")

            dest_file = OUTBOX_DIR / item["stored_name"]
            if not dest_file.exists():
                del index[file_id]
                try:
                    self._save_index_locked(index)
                except Exception:
                    pass
                raise FileNotFoundError(f"File '{item['filename']}' is no longer on host storage")

            return dest_file, item["filename"]

    def remove_file(self, file_id: str) -> bool:
        if not FILE_ID_REGEX.match(file_id):
            return False

        with self._lock:
            index = self._load_index_locked()
            item = index.get(file_id)
            if not item:
                return False

            dest_file = OUTBOX_DIR / item["stored_name"]
            if dest_file.exists():
                try:
                    dest_file.unlink()
                except OSError:
                    pass

            del index[file_id]
            try:
                self._save_index_locked(index)
            except Exception:
                pass

        self._dispatch_notification(
            "DeckComp • Transfer Complete",
            f"Phone received '{item.get('filename', 'file')}'.",
        )
        logger.info(f"Removed staged file {file_id} from outbox.")
        return True


outbox_service = OutboxService()
