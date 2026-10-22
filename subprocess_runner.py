import asyncio
import os
import signal
import time
from typing import List, Optional

from config import MAX_CONCURRENT_SUBPROCESSES, MAX_STREAM_CAPTURE_BYTES

_concurrency_semaphore = asyncio.Semaphore(MAX_CONCURRENT_SUBPROCESSES)


class SubprocessTimeoutError(Exception):
    """Raised when an asynchronous subprocess exceeds its configured timeout."""
    def __init__(self, message: str, duration_ms: int):
        super().__init__(message)
        self.message = message
        self.duration_ms = duration_ms


class SubprocessResult:
    def __init__(self, stdout: str, stderr: str, exit_code: int, duration_ms: int, timed_out: bool = False):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_code = exit_code
        self.duration_ms = duration_ms
        self.timed_out = timed_out

    def to_dict(self):
        return {
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "duration_ms": self.duration_ms,
            "timed_out": self.timed_out,
        }


async def _drain_stream_bounded(stream: Optional[asyncio.StreamReader], max_bytes: int) -> str:
    """
    Reads a stream incrementally, capturing at most max_bytes while continuing
    to drain all subsequent output to prevent the child process from blocking
    on a saturated OS pipe buffer.
    """
    if stream is None:
        return ""

    captured_chunks = []
    total_captured = 0

    while True:
        chunk = await stream.read(4096)
        if not chunk:
            break
        if total_captured < max_bytes:
            allowed = max_bytes - total_captured
            slice_to_keep = chunk[:allowed]
            captured_chunks.append(slice_to_keep)
            total_captured += len(slice_to_keep)
        # Remainder is intentionally drained and discarded

    return b"".join(captured_chunks).decode("utf-8", errors="replace")


async def run_async_subprocess(
    argv: List[str],
    timeout_sec: float = 3.0,
    input_bytes: Optional[bytes] = None,
    env: Optional[dict] = None,
    cwd: Optional[str] = None,
    new_process_group: bool = True
) -> SubprocessResult:
    """
    Executes a process asynchronously with strict concurrency control,
    memory-bounded stream reading, and complete process tree termination on timeout.
    """
    start_time = time.monotonic()

    async with _concurrency_semaphore:
        stdin_pipe = asyncio.subprocess.PIPE if input_bytes is not None else None

        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdin=stdin_pipe,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            cwd=cwd,
            start_new_session=new_process_group
        )

        stdout_task = None
        stderr_task = None

        try:
            if input_bytes and proc.stdin:
                proc.stdin.write(input_bytes)
                await proc.stdin.drain()
                proc.stdin.close()

            # Schedule incremental draining tasks
            stdout_task = asyncio.create_task(
                _drain_stream_bounded(proc.stdout, MAX_STREAM_CAPTURE_BYTES)
            )
            stderr_task = asyncio.create_task(
                _drain_stream_bounded(proc.stderr, MAX_STREAM_CAPTURE_BYTES)
            )

            # Wait for process exit and streams to finish draining under timeout
            await asyncio.wait_for(
                asyncio.gather(proc.wait(), stdout_task, stderr_task),
                timeout=timeout_sec
            )

            stdout_str = stdout_task.result() if stdout_task.done() else ""
            stderr_str = stderr_task.result() if stderr_task.done() else ""
            duration_ms = int((time.monotonic() - start_time) * 1000)

            return SubprocessResult(
                stdout=stdout_str,
                stderr=stderr_str,
                exit_code=proc.returncode if proc.returncode is not None else 0,
                duration_ms=duration_ms,
                timed_out=False
            )

        except (asyncio.TimeoutError, asyncio.CancelledError) as err:
            is_timeout = isinstance(err, asyncio.TimeoutError)

            # Kill entire process group to ensure descendants do not outlive parent
            try:
                pgid = os.getpgid(proc.pid)
                os.killpg(pgid, signal.SIGTERM)
                # Wait up to 1 second for graceful termination
                for _ in range(10):
                    if proc.returncode is not None:
                        break
                    await asyncio.sleep(0.1)
                if proc.returncode is None:
                    os.killpg(pgid, signal.SIGKILL)
                await proc.wait()
            except (ProcessLookupError, PermissionError, OSError):
                pass

            # Cancel draining tasks
            if stdout_task and not stdout_task.done():
                stdout_task.cancel()
            if stderr_task and not stderr_task.done():
                stderr_task.cancel()

            duration_ms = int((time.monotonic() - start_time) * 1000)

            if is_timeout:
                return SubprocessResult(
                    stdout="",
                    stderr=f"Command execution timed out after {timeout_sec:.1f} seconds.",
                    exit_code=124,
                    duration_ms=duration_ms,
                    timed_out=True
                )
            raise
