import hashlib
import json
import logging
import os
import secrets
import shutil
import stat
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import CONFIG_DIR
from env_resolver import resolve_graphical_env

logger = logging.getLogger("deckcomp.pairing")

PAIRED_DEVICES_FILE = CONFIG_DIR / "paired_devices.json"
PAIRING_CODE_TTL_SEC = 120.0  # 2 minutes expiry
MAX_VERIFY_ATTEMPTS = 5


class PairingService:
    def __init__(self):
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(CONFIG_DIR, 0o700)
        except OSError:
            pass
        self._pending: Dict[str, Dict[str, Any]] = {}  # device_id -> {code, device_name, expires_at}
        self._verify_attempts: Dict[str, int] = {}     # device_id -> count of failed attempts
        self._initiate_history: Dict[str, List[float]] = {}  # device_id -> timestamps of requests

    def _load_paired(self) -> Dict[str, Dict[str, Any]]:
        if PAIRED_DEVICES_FILE.exists():
            try:
                st = os.stat(PAIRED_DEVICES_FILE, follow_symlinks=False)
                if stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid():
                    if (st.st_mode & 0o077) != 0:
                        os.chmod(PAIRED_DEVICES_FILE, 0o600)
                    return json.loads(PAIRED_DEVICES_FILE.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"Could not load paired devices file: {e}")
        return {}

    def _save_paired(self, data: Dict[str, Dict[str, Any]]) -> None:
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            temp_file = CONFIG_DIR / f".tmp_paired_{secrets.token_hex(8)}"
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
            fd = os.open(temp_file, flags, 0o600)
            with open(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
                f.flush()
                os.fsync(fd)
            os.replace(temp_file, PAIRED_DEVICES_FILE)
        except Exception as e:
            logger.error(f"Failed to persist paired devices atomically: {e}")
            raise

    def _cleanup_expired(self) -> None:
        now = time.time()
        expired = [dev_id for dev_id, val in self._pending.items() if val["expires_at"] < now]
        for dev_id in expired:
            del self._pending[dev_id]
            self._verify_attempts.pop(dev_id, None)

    def _dispatch_desktop_notification(self, title: str, message: str, urgency: str = "normal") -> None:
        notify_bin = shutil.which("notify-send")
        if not notify_bin:
            logger.info(f"Desktop notification: {title} - {message}")
            return

        try:
            env = resolve_graphical_env()
            subprocess.Popen(
                [
                    notify_bin,
                    "-u", urgency,
                    "-a", "DeckComp",
                    "-i", "network-wireless",
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
            logger.warning(f"Failed to dispatch notify-send: {e}")

    def initiate_pairing(self, device_id: str, device_name: str) -> Dict[str, Any]:
        """
        Generates a 6-digit random code, displays a critical desktop notification on Wayland/X11,
        and saves pending pairing with a 2-minute expiration window.
        Rate-limited: maximum 3 requests per 60 seconds per device_id, min 5 seconds interval.
        """
        self._cleanup_expired()

        if not device_id or not device_id.strip():
            raise ValueError("device_id cannot be empty")

        now = time.time()
        history = [t for t in self._initiate_history.get(device_id, []) if now - t < 60.0]
        if history:
            if now - history[-1] < 5.0:
                raise ValueError("Please wait at least 5 seconds between pairing requests.")
            if len(history) >= 3:
                raise ValueError("Too many pairing attempts. Please wait 60 seconds before requesting again.")
        history.append(now)
        self._initiate_history[device_id] = history

        safe_name = device_name.strip() if device_name else "Unknown Device"
        # Generate cryptographically secure 6-digit PIN
        code = f"{secrets.randbelow(1000000):06d}"
        expires_at = now + PAIRING_CODE_TTL_SEC

        self._pending[device_id] = {
            "code": code,
            "device_name": safe_name,
            "expires_at": expires_at,
        }
        self._verify_attempts[device_id] = 0

        # Dispatch Desktop Notification on the Arch host (DO NOT log plaintext PIN)
        notif_body = (
            f"Device: {safe_name}\n"
            f"Pairing Code: {code}\n"
            f"Enter this 6-digit code on your phone (expires in 2 mins)."
        )
        self._dispatch_desktop_notification("DeckComp Pairing Request", notif_body, urgency="critical")
        logger.info(f"Pairing initiated for device '{safe_name}' (ID: {device_id}). Code dispatched to host display.")

        return {
            "status": "pending",
            "device_id": device_id,
            "device_name": safe_name,
            "expires_in": int(PAIRING_CODE_TTL_SEC),
        }

    def verify_pairing(self, device_id: str, code: str, device_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Verifies the 6-digit code submitted by the phone with timing-safe comparison.
        Caps attempts to MAX_VERIFY_ATTEMPTS (5) before invalidating the pairing request.
        Generates and returns a high-entropy 32-byte bearer token for subsequent authenticated API requests.
        """
        self._cleanup_expired()

        pending = self._pending.get(device_id)
        if not pending:
            raise ValueError("No active pairing request found for this device or code expired. Please request a new code.")

        attempts = self._verify_attempts.get(device_id, 0)
        if attempts >= MAX_VERIFY_ATTEMPTS:
            del self._pending[device_id]
            self._verify_attempts.pop(device_id, None)
            raise ValueError("Maximum pairing attempts exceeded. Code has been revoked for security.")

        # Timing-safe constant-time string comparison
        submitted_code = code.strip()
        if not secrets.compare_digest(pending["code"], submitted_code):
            attempts += 1
            self._verify_attempts[device_id] = attempts
            if attempts >= MAX_VERIFY_ATTEMPTS:
                del self._pending[device_id]
                self._verify_attempts.pop(device_id, None)
                raise ValueError("Incorrect code. Maximum attempts exceeded; pairing code revoked.")
            remaining = MAX_VERIFY_ATTEMPTS - attempts
            raise ValueError(f"Incorrect pairing code. {remaining} attempt(s) remaining.")

        # Pairing successful: clean up pending state
        del self._pending[device_id]
        self._verify_attempts.pop(device_id, None)

        # Issue cryptographically random 32-byte (64 hex chars) bearer token
        raw_token = secrets.token_hex(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

        paired = self._load_paired()
        final_name = device_name or pending["device_name"]
        paired[device_id] = {
            "device_name": final_name,
            "token_hash": token_hash,
            "paired_at": time.time(),
        }
        self._save_paired(paired)

        self._dispatch_desktop_notification(
            "DeckComp Device Paired",
            f"Device '{final_name}' successfully paired and authenticated!",
            urgency="normal"
        )
        logger.info(f"Device '{final_name}' ({device_id}) successfully verified and saved with bearer credential.")

        return {
            "status": "paired",
            "device_id": device_id,
            "device_name": final_name,
            "token": raw_token,
            "timestamp": time.time(),
        }

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Constant-time verification of a client bearer token against stored device hashes.
        Returns device metadata dict if valid, None otherwise.
        """
        if not token or not token.strip():
            return None

        candidate_hash = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
        paired = self._load_paired()

        for dev_id, info in paired.items():
            stored_hash = info.get("token_hash", "")
            if stored_hash and secrets.compare_digest(stored_hash, candidate_hash):
                return {
                    "device_id": dev_id,
                    "device_name": info.get("device_name", "Paired Device"),
                    "paired_at": info.get("paired_at", 0),
                }

        return None

    def is_device_paired(self, device_id: str) -> bool:
        paired = self._load_paired()
        return device_id in paired

    def list_paired(self) -> List[Dict[str, Any]]:
        paired = self._load_paired()
        return [
            {
                "device_id": k,
                "device_name": v.get("device_name", "Unknown"),
                "paired_at": v.get("paired_at", 0),
            }
            for k, v in paired.items()
        ]

    def unpair_device(self, device_id: str) -> bool:
        paired = self._load_paired()
        if device_id in paired:
            name = paired[device_id].get("device_name", device_id)
            del paired[device_id]
            self._save_paired(paired)
            self._dispatch_desktop_notification(
                "DeckComp Device Unpaired",
                f"Device '{name}' was removed and its credentials revoked.",
            )
            logger.info(f"Device '{device_id}' revoked and unpaired.")
            return True
        return False


pairing_service = PairingService()
