import shutil
import subprocess
from typing import Any, Dict, List, Optional

from config import ALLOWED_AMBIENT_APPS, SUPPORTED_TERMINALS
from env_resolver import resolve_graphical_env


class AmbientService:
    def get_detected_terminal(self) -> Optional[str]:
        for term in SUPPORTED_TERMINALS:
            if shutil.which(term):
                return term
        return None

    def get_options(self) -> Dict[str, Any]:
        detected_term = self.get_detected_terminal()
        available_apps = [app for app in ALLOWED_AMBIENT_APPS if shutil.which(app)]
        return {
            "available_apps": available_apps,
            "detected_terminal": detected_term or "none",
        }

    def spawn(self, app: str, terminal: Optional[str] = None) -> Dict[str, Any]:
        """
        Launches an eye-candy visualizer inside an installed terminal.
        Detaches completely using start_new_session=True and DEVNULL streams,
        returning the PID immediately without waiting on the child process.
        """
        if app not in ALLOWED_AMBIENT_APPS:
            raise ValueError(f"Application '{app}' is not in allowed ambient apps: {ALLOWED_AMBIENT_APPS}")

        app_bin = shutil.which(app)
        if not app_bin:
            raise FileNotFoundError(f"Visualizer application '{app}' is not installed on host PATH")

        # Choose terminal
        chosen_term = terminal or self.get_detected_terminal()
        if not chosen_term or chosen_term not in SUPPORTED_TERMINALS:
            raise ValueError(f"Terminal '{chosen_term}' is not supported. Must be one of {SUPPORTED_TERMINALS}")

        term_bin = shutil.which(chosen_term)
        if not term_bin:
            raise FileNotFoundError(f"Terminal emulator '{chosen_term}' is not installed on host PATH")

        env = resolve_graphical_env()

        # Build clean command list
        cmd: List[str] = [term_bin, "-e", app_bin]

        # Spawn detached process in independent session
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            close_fds=True,
            env=env
        )

        return {
            "status": "spawned",
            "app": app,
            "pid": proc.pid,
        }


ambient_service = AmbientService()
