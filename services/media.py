import re
import shutil
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from env_resolver import resolve_graphical_env
from subprocess_runner import run_async_subprocess


class MediaService:
    async def get_volume(self) -> Dict[str, Any]:
        """Reads current audio sink volume and mute status via wpctl or pactl."""
        env = resolve_graphical_env()
        wpctl = shutil.which("wpctl")
        if wpctl:
            res = await run_async_subprocess([wpctl, "get-volume", "@DEFAULT_AUDIO_SINK@"], timeout_sec=3.0, env=env)
            if res.exit_code == 0:
                match = re.search(r"Volume:\s+([0-9.]+)", res.stdout)
                level = float(match.group(1)) if match else 0.0
                muted = "[MUTED]" in res.stdout
                return {"level": round(level, 2), "muted": muted}

        pactl = shutil.which("pactl")
        if pactl:
            res = await run_async_subprocess([pactl, "get-sink-volume", "@DEFAULT_SINK@"], timeout_sec=3.0, env=env)
            if res.exit_code == 0:
                match = re.search(r"/\s*(\d+)%", res.stdout)
                level = float(match.group(1)) / 100.0 if match else 0.0
                mute_res = await run_async_subprocess([pactl, "get-sink-mute", "@DEFAULT_SINK@"], timeout_sec=3.0, env=env)
                muted = "yes" in mute_res.stdout.lower()
                return {"level": round(level, 2), "muted": muted}

        return {"level": 0.0, "muted": False}

    async def adjust_volume(
        self,
        direction: str,
        step_percent: int = 5,
        target_volume: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Adjusts master volume according to canonical direction: up, down, mute, set.
        """
        env = resolve_graphical_env()
        wpctl = shutil.which("wpctl")
        pactl = shutil.which("pactl")

        if not wpctl and not pactl:
            raise FileNotFoundError("Neither wpctl nor pactl found on host PATH")

        if direction == "set":
            if target_volume is None:
                raise ValueError("target_volume is required when direction is 'set'")
            target = max(0.0, min(1.0, float(target_volume)))
        else:
            target = None

        if wpctl:
            if direction == "up":
                await run_async_subprocess([wpctl, "set-volume", "--limit", "1.0", "@DEFAULT_AUDIO_SINK@", f"{step_percent}%+"], timeout_sec=3.0, env=env)
            elif direction == "down":
                await run_async_subprocess([wpctl, "set-volume", "@DEFAULT_AUDIO_SINK@", f"{step_percent}%-"], timeout_sec=3.0, env=env)
            elif direction == "mute":
                await run_async_subprocess([wpctl, "set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"], timeout_sec=3.0, env=env)
            elif direction == "set" and target is not None:
                await run_async_subprocess([wpctl, "set-volume", "@DEFAULT_AUDIO_SINK@", f"{target:.2f}"], timeout_sec=3.0, env=env)
        elif pactl:
            if direction == "up":
                await run_async_subprocess([pactl, "set-sink-volume", "@DEFAULT_SINK@", f"+{step_percent}%"], timeout_sec=3.0, env=env)
            elif direction == "down":
                await run_async_subprocess([pactl, "set-sink-volume", "@DEFAULT_SINK@", f"-{step_percent}%"], timeout_sec=3.0, env=env)
            elif direction == "mute":
                await run_async_subprocess([pactl, "set-sink-mute", "@DEFAULT_SINK@", "toggle"], timeout_sec=3.0, env=env)
            elif direction == "set" and target is not None:
                pct = int(target * 100)
                await run_async_subprocess([pactl, "set-sink-volume", "@DEFAULT_SINK@", f"{pct}%"], timeout_sec=3.0, env=env)

        vol_data = await self.get_volume()
        return {
            "volume": vol_data["level"],
            "muted": vol_data["muted"],
        }

    async def get_media_status(self) -> Dict[str, Any]:
        """
        Queries MPRIS metadata and volume status matching the canonical flat contract.
        """
        env = resolve_graphical_env()
        vol_data = await self.get_volume()

        playerctl = shutil.which("playerctl")
        if not playerctl:
            return {
                "player": None,
                "playback_status": "Stopped",
                "title": None,
                "artist": None,
                "album": None,
                "volume": vol_data["level"],
                "muted": vol_data["muted"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Check player status
        status_res = await run_async_subprocess([playerctl, "status"], timeout_sec=3.0, env=env)
        if status_res.exit_code != 0 or not status_res.stdout.strip():
            return {
                "player": None,
                "playback_status": "Stopped",
                "title": None,
                "artist": None,
                "album": None,
                "volume": vol_data["level"],
                "muted": vol_data["muted"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        playback_status = status_res.stdout.strip().splitlines()[0]

        # Get active player name
        player_name_res = await run_async_subprocess([playerctl, "metadata", "--format", "{{playerName}}"], timeout_sec=3.0, env=env)
        player_name = player_name_res.stdout.strip() if player_name_res.exit_code == 0 else "mpris"

        # Get metadata
        meta_format = "{{title}}///{{artist}}///{{album}}"
        meta_res = await run_async_subprocess([playerctl, "metadata", "--format", meta_format], timeout_sec=3.0, env=env)
        title, artist, album = None, None, None

        if meta_res.exit_code == 0 and meta_res.stdout.strip():
            parts = meta_res.stdout.strip().split("///")
            title = parts[0] if len(parts) > 0 and parts[0] else None
            artist = parts[1] if len(parts) > 1 and parts[1] else None
            album = parts[2] if len(parts) > 2 and parts[2] else None

        return {
            "player": player_name,
            "playback_status": playback_status,
            "title": title,
            "artist": artist,
            "album": album,
            "volume": vol_data["level"],
            "muted": vol_data["muted"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def control_playback(self, action: str) -> Dict[str, Any]:
        """Dispatches playback command via playerctl."""
        playerctl = shutil.which("playerctl")
        if not playerctl:
            raise FileNotFoundError("playerctl not found on host PATH")

        env = resolve_graphical_env()
        valid_actions = {"play-pause", "next", "previous", "play", "pause", "stop"}
        if action not in valid_actions:
            raise ValueError(f"Invalid media action: {action}. Must be one of {valid_actions}")

        res = await run_async_subprocess([playerctl, action], timeout_sec=3.0, env=env)
        if res.exit_code != 0:
            if "No players found" in res.stderr:
                raise RuntimeError("No active media player found on host")
            raise RuntimeError(f"playerctl command '{action}' failed: {res.stderr}")

        status_now = await self.get_media_status()
        return {
            "status": "ok",
            "action": action,
            "playback_status": status_now["playback_status"],
        }


media_service = MediaService()
