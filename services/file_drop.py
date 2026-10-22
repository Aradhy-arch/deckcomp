import asyncio
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import HTTPException, UploadFile

from config import DOWNLOADS_DIR, MAX_UPLOAD_BYTES
from env_resolver import resolve_graphical_env
from subprocess_runner import run_async_subprocess


class FileDropService:
    def sanitize_filename(self, raw_filename: str) -> str:
        """
        Derives safe filename from client input.
        Rejects empty, '.', '..', NUL bytes, and path separators.
        """
        if not raw_filename:
            return "drop.bin"

        base = Path(raw_filename).name

        if base in {".", "..", ""}:
            return "drop.bin"

        cleaned = re.sub(r'[\x00-\x1f\x7f/\\:\0]', '', base).strip()
        if not cleaned or cleaned in {".", ".."}:
            return "drop.bin"

        return cleaned[:200]

    async def save_upload(self, upload_file: UploadFile, override_filename: Optional[str] = None) -> Dict[str, Any]:
        """
        Streams uploaded file in 1MB chunks to a temporary file.
        Cleans up temporary file in finally block under any exception or cancellation.
        Installs file via atomic no-clobber reservation loop.
        """
        dest_dir = DOWNLOADS_DIR
        dest_dir.mkdir(parents=True, exist_ok=True)

        original_filename = override_filename or upload_file.filename or "drop.bin"
        safe_name = self.sanitize_filename(original_filename)

        # Temporary file path with UUID
        temp_filename = f".tmp_{uuid.uuid4().hex}_{safe_name}"
        temp_path = dest_dir / temp_filename

        total_bytes = 0
        chunk_size = 1024 * 1024  # 1 MB chunk
        temp_file_installed = False

        try:
            with open(temp_path, "xb") as temp_file:
                while True:
                    chunk = await upload_file.read(chunk_size)
                    if not chunk:
                        break
                    total_bytes += len(chunk)
                    if total_bytes > MAX_UPLOAD_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=f"Upload payload exceeds maximum limit of {MAX_UPLOAD_BYTES} bytes"
                        )
                    temp_file.write(chunk)
                temp_file.flush()
                os.fsync(temp_file.fileno())

            # Collision resolution: test candidate names with atomic hard-link
            stem = Path(safe_name).stem
            ext = Path(safe_name).suffix
            final_name = safe_name
            final_path = dest_dir / final_name
            counter = 1

            while True:
                try:
                    os.link(temp_path, final_path)
                    temp_file_installed = True
                    break
                except FileExistsError:
                    final_name = f"{stem} ({counter}){ext}"
                    final_path = dest_dir / final_name
                    counter += 1

        finally:
            # Guarantees temp file cleanup on success, failure, or task cancellation
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)
            await upload_file.close()

        # Format human-readable size
        if total_bytes < 1024 * 1024:
            size_str = f"{total_bytes / 1024:.1f} KB"
        else:
            size_str = f"{total_bytes / (1024 * 1024):.1f} MB"

        # Safe notification dispatch with bounded wait
        notification_dispatched = False
        notify_bin = shutil.which("notify-send")
        if notify_bin:
            try:
                env = resolve_graphical_env()
                notification_msg = f"Saved {final_name} ({size_str}) to ~/Downloads"
                await run_async_subprocess(
                    [notify_bin, "-a", "DeckComp", "-i", "document-save", "File Received", notification_msg],
                    timeout_sec=3.0,
                    env=env
                )
                notification_dispatched = True
            except Exception:
                notification_dispatched = False

        # Strictly sanitize original_filename for the response envelope
        safe_original = re.sub(r'[\x00-\x1f\x7f]', '', original_filename).strip()[:200] or "drop.bin"

        return {
            "status": "saved",
            "original_filename": safe_original,
            "saved_filename": final_name,
            "path": f"Downloads/{final_name}",
            "size_bytes": total_bytes,
            "notification_dispatched": notification_dispatched,
        }


file_drop_service = FileDropService()
