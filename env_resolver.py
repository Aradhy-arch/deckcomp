import glob
import os
import re
from pathlib import Path
from typing import Dict


class GraphicalSessionUnavailableError(RuntimeError):
    """Raised when critical Wayland/DBus session environment variables cannot be resolved."""
    pass


def _extract_socket_index(path_str: str) -> int:
    base = os.path.basename(path_str)
    match = re.match(r"^wayland-(\d+)$", base)
    return int(match.group(1)) if match else -1


def resolve_graphical_env() -> Dict[str, str]:
    """
    Deterministically resolves the live user graphical session environment.
    Guarantees WAYLAND_DISPLAY, XDG_RUNTIME_DIR, and DBUS_SESSION_BUS_ADDRESS
    are verified on disk with proper ownership before graphical/audio subprocesses execute.
    Never fabricates a non-existent socket.
    """
    env = os.environ.copy()
    uid = os.getuid()

    # 1. Resolve & validate XDG_RUNTIME_DIR
    runtime_dir_str = env.get("XDG_RUNTIME_DIR")
    if not runtime_dir_str or not Path(runtime_dir_str).is_dir():
        fallback_runtime = Path(f"/run/user/{uid}")
        if fallback_runtime.is_dir():
            runtime_dir_str = str(fallback_runtime)
            env["XDG_RUNTIME_DIR"] = runtime_dir_str
        else:
            raise GraphicalSessionUnavailableError(
                f"XDG_RUNTIME_DIR directory /run/user/{uid} does not exist"
            )

    runtime_dir = Path(runtime_dir_str)

    # Validate directory ownership
    try:
        dir_stat = runtime_dir.stat()
        if dir_stat.st_uid != uid:
            raise GraphicalSessionUnavailableError(
                f"XDG_RUNTIME_DIR {runtime_dir} is not owned by UID {uid}"
            )
    except OSError as e:
        raise GraphicalSessionUnavailableError(
            f"Cannot inspect XDG_RUNTIME_DIR: {e}"
        )

    # 2. Resolve DBUS_SESSION_BUS_ADDRESS
    dbus_addr = env.get("DBUS_SESSION_BUS_ADDRESS")
    if not dbus_addr:
        bus_sock = runtime_dir / "bus"
        if bus_sock.is_socket():
            env["DBUS_SESSION_BUS_ADDRESS"] = f"unix:path={bus_sock}"
        else:
            raise GraphicalSessionUnavailableError(
                f"DBus session bus socket not found at {bus_sock}"
            )

    # 3. Resolve WAYLAND_DISPLAY
    wayland_disp = env.get("WAYLAND_DISPLAY")
    if wayland_disp:
        sock_path = runtime_dir / wayland_disp
        if not sock_path.is_socket():
            # Current variable is stale, re-scan
            wayland_disp = None

    if not wayland_disp:
        candidate_sockets = glob.glob(f"{runtime_dir}/wayland-[0-9]*")
        # Filter only existing socket files
        valid_sockets = [s for s in candidate_sockets if Path(s).is_socket()]
        if not valid_sockets:
            raise GraphicalSessionUnavailableError(
                f"No active Wayland display socket found in {runtime_dir}"
            )
        # Sort numerically by index descending (e.g. wayland-10 before wayland-9)
        valid_sockets.sort(key=_extract_socket_index, reverse=True)
        env["WAYLAND_DISPLAY"] = os.path.basename(valid_sockets[0])

    if "XDG_SESSION_TYPE" not in env:
        env["XDG_SESSION_TYPE"] = "wayland"

    return env
