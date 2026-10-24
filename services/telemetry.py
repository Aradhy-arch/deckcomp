import glob
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


class TelemetryService:
    def __init__(self):
        self._cached_client_telemetry: Optional[Dict[str, Any]] = None

    def read_host_telemetry(self) -> Dict[str, Any]:
        """
        Reads battery and AC power status directly from Linux sysfs (/sys/class/power_supply/).
        Handles missing battery paths (desktops, VM, BAT0/BAT1) gracefully without throwing errors.
        """
        battery_data: Dict[str, Any] = {
            "present": False,
            "percent": None,
            "status": "No Battery",
            "power_supply_name": None,
        }

        # Check /sys/class/power_supply/BAT*
        bat_dirs = sorted(glob.glob("/sys/class/power_supply/BAT*"))
        if bat_dirs:
            bat_path = Path(bat_dirs[0])
            battery_data["power_supply_name"] = bat_path.name

            # Read present flag
            present_file = bat_path / "present"
            if present_file.exists():
                try:
                    battery_data["present"] = bool(int(present_file.read_text().strip()))
                except (ValueError, OSError):
                    battery_data["present"] = True
            else:
                battery_data["present"] = True

            # Read capacity percentage
            cap_file = bat_path / "capacity"
            if cap_file.exists():
                try:
                    battery_data["percent"] = int(cap_file.read_text().strip())
                except (ValueError, OSError):
                    battery_data["percent"] = None

            # Read status string
            status_file = bat_path / "status"
            if status_file.exists():
                try:
                    battery_data["status"] = status_file.read_text().strip()
                except OSError:
                    battery_data["status"] = "Unknown"

        # Check AC status: /sys/class/power_supply/AC* or /sys/class/power_supply/ACAD*
        ac_connected = False
        ac_dirs = sorted(glob.glob("/sys/class/power_supply/AC*"))
        for ac_dir in ac_dirs:
            online_file = Path(ac_dir) / "online"
            if online_file.exists():
                try:
                    if int(online_file.read_text().strip()) == 1:
                        ac_connected = True
                        break
                except (ValueError, OSError):
                    pass

        # Detect device type (laptop vs desktop PC)
        device_type = "desktop"
        if bat_dirs and battery_data.get("present"):
            device_type = "laptop"
        else:
            chassis_file = Path("/sys/class/dmi/id/chassis_type")
            if chassis_file.exists():
                try:
                    c_type = int(chassis_file.read_text().strip())
                    # DMI chassis types: 8=Portable, 9=Laptop, 10=Notebook, 11=Hand Held, 12=Docking, 14=Sub Notebook, 30=Tablet, 31=Convertible, 32=Detachable
                    if c_type in {8, 9, 10, 11, 12, 14, 30, 31, 32}:
                        device_type = "laptop"
                    else:
                        device_type = "desktop"
                except (ValueError, OSError):
                    pass

        # Uptime
        uptime_seconds = 0.0
        uptime_file = Path("/proc/uptime")
        if uptime_file.exists():
            try:
                uptime_seconds = float(uptime_file.read_text().split()[0])
            except (IndexError, ValueError, OSError):
                uptime_seconds = 0.0

        return {
            "device_type": device_type,
            "battery": battery_data,
            "ac_connected": ac_connected,
            "uptime_seconds": uptime_seconds,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def record_client_telemetry(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Saves client telemetry received from Android device."""
        now_iso = datetime.now(timezone.utc).isoformat()
        record = {
            "battery_level": data.get("battery_level"),
            "battery_state": data.get("battery_state"),
            "device_name": data.get("device_name", "Android Client"),
            "received_at": now_iso,
        }
        self._cached_client_telemetry = record
        return {
            "status": "acknowledged",
            "timestamp": now_iso,
        }

    def get_latest_client_telemetry(self) -> Optional[Dict[str, Any]]:
        return self._cached_client_telemetry


telemetry_service = TelemetryService()
