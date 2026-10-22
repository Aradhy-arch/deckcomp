import shutil
from datetime import datetime, timezone
from typing import Any, Dict

from env_resolver import resolve_graphical_env
from subprocess_runner import run_async_subprocess

MAX_CLIPBOARD_BYTES = 5 * 1024 * 1024  # 5 MB


class ClipboardService:
    async def get_clipboard_text(self) -> Dict[str, Any]:
        """
        Reads desktop clipboard using wl-paste.
        Applies strict timeout and guarantees no clipboard contents are serialized to logs.
        Returns a JSON payload with empty content if clipboard is empty.
        """
        wl_paste = shutil.which("wl-paste")
        if not wl_paste:
            raise FileNotFoundError("wl-paste binary not found on host PATH")

        env = resolve_graphical_env()
        result = await run_async_subprocess(
            [wl_paste, "-t", "text/plain", "-n"],
            timeout_sec=3.0,
            env=env
        )

        now_iso = datetime.now(timezone.utc).isoformat()
        if result.exit_code != 0 or not result.stdout:
            return {
                "content": "",
                "mime_type": "text/plain",
                "length": 0,
                "timestamp": now_iso,
            }

        content = result.stdout[:MAX_CLIPBOARD_BYTES]
        return {
            "content": content,
            "mime_type": "text/plain",
            "length": len(content),
            "timestamp": now_iso,
        }

    async def set_clipboard_text(self, text: str) -> Dict[str, Any]:
        """
        Writes text to desktop clipboard using wl-copy.
        """
        payload_bytes = text.encode("utf-8")
        if len(payload_bytes) > MAX_CLIPBOARD_BYTES:
            raise ValueError(f"Clipboard payload exceeds limit of {MAX_CLIPBOARD_BYTES} bytes")

        wl_copy = shutil.which("wl-copy")
        if not wl_copy:
            raise FileNotFoundError("wl-copy binary not found on host PATH")

        env = resolve_graphical_env()
        result = await run_async_subprocess(
            [wl_copy],
            timeout_sec=3.0,
            input_bytes=payload_bytes,
            env=env
        )

        if result.exit_code != 0:
            raise RuntimeError(f"wl-copy failed with exit code {result.exit_code}: {result.stderr}")

        return {
            "status": "success",
            "bytes_written": len(payload_bytes),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


clipboard_service = ClipboardService()
