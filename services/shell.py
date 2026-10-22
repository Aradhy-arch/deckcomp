import os
import shutil
from typing import Any, Dict, Optional

from config import DEFAULT_SHELL_TIMEOUT, MAX_SHELL_TIMEOUT
from env_resolver import resolve_graphical_env
from subprocess_runner import run_async_subprocess


class ShellService:
    async def execute_command(
        self,
        command: str,
        timeout_seconds: Optional[int] = None,
        working_directory: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes a command safely through bash with bounded execution time,
        non-blocking process-group tree cancellation, and memory-bounded output capture.
        """
        if not command or not command.strip():
            raise ValueError("Command cannot be empty")

        if len(command) > 4096:
            raise ValueError("Command length exceeds maximum allowable 4096 characters")

        # Validate timeout strictly (reject rather than clamp)
        timeout = float(timeout_seconds) if timeout_seconds is not None else DEFAULT_SHELL_TIMEOUT
        if timeout < 1.0 or timeout > MAX_SHELL_TIMEOUT:
            raise ValueError(f"timeout_seconds must be between 1 and {int(MAX_SHELL_TIMEOUT)}")

        # Validate working directory
        cwd = None
        if working_directory:
            expanded = os.path.expanduser(working_directory)
            if os.path.isdir(expanded):
                cwd = expanded
            else:
                raise ValueError(f"Specified working_directory '{working_directory}' does not exist")

        bash_bin = shutil.which("bash") or "/usr/bin/bash"
        env = resolve_graphical_env()

        # Execute using exec with bash -c in new process group
        result = await run_async_subprocess(
            [bash_bin, "-c", command],
            timeout_sec=timeout,
            env=env,
            cwd=cwd,
            new_process_group=True
        )

        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
            "duration_ms": result.duration_ms,
            "timed_out": result.timed_out,
        }


shell_service = ShellService()
