import shutil
from datetime import datetime, timezone
from typing import Any, Dict

from env_resolver import resolve_graphical_env
from subprocess_runner import run_async_subprocess


class PowerService:
    async def lock_session(self) -> Dict[str, Any]:
        """Locks the graphical user session via loginctl lock-session with graphical environment."""
        loginctl = shutil.which("loginctl")
        if not loginctl:
            raise FileNotFoundError("loginctl not found on host PATH")

        env = resolve_graphical_env()
        res = await run_async_subprocess([loginctl, "lock-session"], timeout_sec=3.0, env=env)
        if res.exit_code != 0:
            raise RuntimeError(f"loginctl lock-session failed: {res.stderr}")

        return {
            "status": "locked",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def suspend(self, confirm: bool) -> Dict[str, Any]:
        if not confirm:
            raise ValueError("Explicit server-side confirmation required to suspend host.")

        systemctl = shutil.which("systemctl")
        if not systemctl:
            raise FileNotFoundError("systemctl not found on host PATH")

        res = await run_async_subprocess([systemctl, "suspend"], timeout_sec=3.0)
        if res.exit_code != 0:
            raise RuntimeError(f"systemctl suspend failed: {res.stderr}")

        return {
            "status": "suspending",
        }

    async def reboot(self, confirm: bool) -> Dict[str, Any]:
        if not confirm:
            raise ValueError("Explicit server-side confirmation required to reboot host.")

        systemctl = shutil.which("systemctl")
        if not systemctl:
            raise FileNotFoundError("systemctl not found on host PATH")

        res = await run_async_subprocess([systemctl, "reboot"], timeout_sec=3.0)
        if res.exit_code != 0:
            raise RuntimeError(f"systemctl reboot failed: {res.stderr}")

        return {
            "status": "rebooting",
        }

    async def poweroff(self, confirm: bool) -> Dict[str, Any]:
        if not confirm:
            raise ValueError("Explicit server-side confirmation required to poweroff host.")

        systemctl = shutil.which("systemctl")
        if not systemctl:
            raise FileNotFoundError("systemctl not found on host PATH")

        res = await run_async_subprocess([systemctl, "poweroff"], timeout_sec=3.0)
        if res.exit_code != 0:
            raise RuntimeError(f"systemctl poweroff failed: {res.stderr}")

        return {
            "status": "powering_off",
        }


power_service = PowerService()
