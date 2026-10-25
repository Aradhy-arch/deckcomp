import secrets
import socket
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, field_validator
from starlette.types import ASGIApp, Receive, Scope, Send

from config import ALLOWED_AMBIENT_APPS, API_PREFIX, MAX_SHELL_TIMEOUT, MAX_UPLOAD_BYTES, VERSION, get_or_create_auth_token
from env_resolver import GraphicalSessionUnavailableError
from services.ambient import ambient_service
from services.clipboard import clipboard_service
from services.file_drop import file_drop_service
from services.media import media_service
from services.outbox import outbox_service
from services.pairing import pairing_service
from services.power import power_service
from services.shell import shell_service
from services.telemetry import telemetry_service
from subprocess_runner import SubprocessTimeoutError


# Canonical Error Envelope: { "detail": string, "code": string, "timestamp": string }
def make_error_response(detail: str, code: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": detail,
            "code": code,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


class UploadLimitMiddleware:
    """
    Pre-spool ASGI middleware that strictly enforces MAX_UPLOAD_BYTES before
    Starlette/FastAPI multipart parsers can spool excess files to /tmp.
    """
    def __init__(self, app: ASGIApp, max_bytes: int = MAX_UPLOAD_BYTES):
        self.app = app
        self.max_bytes = max_bytes
        self.max_wire_bytes = max_bytes + 1048576  # 1MB allowance for multipart headers

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("path", "").endswith("/drop") and scope.get("method") == "POST":
            # 1. Fast-path check: Content-Length header
            for name, val in scope.get("headers", []):
                if name.lower() == b"content-length":
                    try:
                        if int(val) > self.max_wire_bytes:
                            response = make_error_response(
                                detail=f"Upload payload exceeds maximum limit of {self.max_bytes} bytes",
                                code="HTTP_413",
                                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            )
                            await response(scope, receive, send)
                            return
                    except (ValueError, TypeError):
                        pass

            # 2. Streaming body byte counter to defend against chunked/missing Content-Length
            received_bytes = 0

            async def counting_receive():
                nonlocal received_bytes
                message = await receive()
                if message["type"] == "http.request":
                    body = message.get("body", b"")
                    received_bytes += len(body)
                    if received_bytes > self.max_wire_bytes:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"Upload stream exceeded maximum limit of {self.max_bytes} bytes",
                        )
                return message

            try:
                await self.app(scope, counting_receive, send)
            except HTTPException as exc:
                if exc.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE:
                    response = make_error_response(
                        detail=str(exc.detail),
                        code="HTTP_413",
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    )
                    await response(scope, receive, send)
                else:
                    raise
            return

        await self.app(scope, receive, send)


app = FastAPI(
    title="DeckComp Host Daemon",
    version=VERSION,
    description="Zero-bloat headless companion daemon for Arch Linux on Wayland.",
    docs_url=None,
    redoc_url=None,
)

# Register Upload Limit Middleware first (intercepts body stream pre-spool)
app.add_middleware(UploadLimitMiddleware, max_bytes=MAX_UPLOAD_BYTES)

# Open CORS configuration for frictionless mobile LAN communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- EXCEPTION HANDLERS ---------------- #

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    headers = getattr(exc, "headers", None)
    response = make_error_response(
        detail=str(exc.detail),
        code=f"HTTP_{exc.status_code}",
        status_code=exc.status_code,
    )
    if headers:
        for k, v in headers.items():
            response.headers[k] = v
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return make_error_response(
        detail="Invalid request payload or parameters",
        code="VALIDATION_ERROR",
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    )


@app.exception_handler(GraphicalSessionUnavailableError)
async def graphical_session_error_handler(request: Request, exc: GraphicalSessionUnavailableError):
    return make_error_response(
        detail=str(exc),
        code="GRAPHICAL_SESSION_UNAVAILABLE",
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@app.exception_handler(FileNotFoundError)
async def file_not_found_error_handler(request: Request, exc: FileNotFoundError):
    return make_error_response(
        detail=str(exc),
        code="NOT_FOUND",
        status_code=status.HTTP_404_NOT_FOUND,
    )


@app.exception_handler(PermissionError)
async def permission_error_handler(request: Request, exc: PermissionError):
    return make_error_response(
        detail=str(exc),
        code="PERMISSION_DENIED",
        status_code=status.HTTP_403_FORBIDDEN,
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return make_error_response(
        detail=str(exc),
        code="INVALID_ARGUMENT",
        status_code=status.HTTP_400_BAD_REQUEST,
    )


@app.exception_handler(SubprocessTimeoutError)
async def subprocess_timeout_error_handler(request: Request, exc: SubprocessTimeoutError):
    return make_error_response(
        detail=exc.message,
        code="SUBPROCESS_TIMEOUT",
        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return make_error_response(
        detail="An internal server error occurred while processing the request",
        code="INTERNAL_SERVER_ERROR",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


# ---------------- AUTHENTICATION DEPENDENCY ---------------- #

async def get_authenticated_client(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """
    Enforces paired-device authentication or host master token authorization.
    Accepts:
      - Authorization: Bearer <token> header
      - token=<token> query parameter (for media/file download streaming)
    """
    raw_token: Optional[str] = None
    if authorization and authorization.lower().startswith("bearer "):
        raw_token = authorization[7:].strip()
    elif token and token.strip():
        raw_token = token.strip()

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a valid paired bearer token in Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Verify against paired mobile devices
    device_info = pairing_service.verify_token(raw_token)
    if device_info:
        return device_info

    # 2. Verify against host master token (from ~/.config/deckcomp/token)
    master_token = get_or_create_auth_token()
    if secrets.compare_digest(raw_token, master_token):
        return {"device_id": "master_host", "device_name": "Host Master Console"}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication token. Device may be unpaired or token expired.",
        headers={"WWW-Authenticate": "Bearer"},
    )


# ---------------- DATA MODELS ---------------- #

class ClientTelemetryModel(BaseModel):
    battery_level: float = Field(..., ge=0.0, le=1.0)
    battery_state: str = Field(..., max_length=64)
    device_name: str = Field(default="Android Device", max_length=128)


class ClipboardPushModel(BaseModel):
    content: str = Field(..., max_length=5 * 1024 * 1024)


class MediaControlModel(BaseModel):
    action: str = Field(...)

    @field_validator("action")
    def validate_action(cls, v: str) -> str:
        valid = {"play-pause", "next", "previous", "play", "pause", "stop"}
        if v not in valid:
            raise ValueError(f"action must be one of {valid}")
        return v


class AudioVolumeModel(BaseModel):
    direction: str = Field(...)
    step_percent: int = Field(default=5, ge=1, le=50)
    target_volume: Optional[float] = Field(default=None, ge=0.0, le=1.0)

    @field_validator("direction")
    def validate_direction(cls, v: str) -> str:
        valid = {"up", "down", "mute", "set"}
        if v not in valid:
            raise ValueError(f"direction must be one of {valid}")
        return v


class PowerActionModel(BaseModel):
    confirm: bool = Field(...)

    @field_validator("confirm")
    def validate_confirm(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Explicit server-side confirmation (confirm=True) is required.")
        return v


class AmbientSpawnModel(BaseModel):
    app: str = Field(...)
    terminal: Optional[str] = Field(default=None)

    @field_validator("app")
    def validate_app(cls, v: str) -> str:
        if v not in ALLOWED_AMBIENT_APPS:
            raise ValueError(f"app must be one of {ALLOWED_AMBIENT_APPS}")
        return v


class ShellExecModel(BaseModel):
    command: str = Field(..., min_length=1, max_length=4096)
    timeout_seconds: Optional[int] = Field(default=15, ge=1, le=int(MAX_SHELL_TIMEOUT))
    working_directory: Optional[str] = Field(default=None, max_length=1024)


class PairInitiateModel(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=128)
    device_name: str = Field(default="Android Device", max_length=128)


class PairVerifyModel(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=128)
    code: str = Field(..., min_length=4, max_length=10)
    device_name: Optional[str] = Field(default=None, max_length=128)


class ShareStageModel(BaseModel):
    path: str = Field(..., min_length=1, max_length=4096)


# ---------------- PUBLIC BOOTSTRAP ROUTES ---------------- #

# 1. Health check (Unauthenticated LAN discovery ping)
@app.get(f"{API_PREFIX}/health")
async def health_check():
    """Health ping to verify host connectivity and session readiness."""
    return {
        "status": "ok",
        "hostname": socket.gethostname(),
        "version": VERSION,
        "session_type": "wayland",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# 2. Device Pairing Bootstrap (Unauthenticated with hard rate-limits)
@app.post(f"{API_PREFIX}/pair/initiate", status_code=status.HTTP_200_OK)
async def initiate_pairing(payload: PairInitiateModel):
    """Generates 6-digit PIN and displays critical notification on Arch Linux desktop."""
    return pairing_service.initiate_pairing(
        device_id=payload.device_id,
        device_name=payload.device_name,
    )


@app.post(f"{API_PREFIX}/pair/verify", status_code=status.HTTP_200_OK)
async def verify_pairing(payload: PairVerifyModel):
    """
    Verifies 6-digit PIN and issues a cryptographically random bearer token.
    Enforces maximum 5 attempts before code invalidation.
    """
    return pairing_service.verify_pairing(
        device_id=payload.device_id,
        code=payload.code,
        device_name=payload.device_name,
    )


# ---------------- PROTECTED ROUTES (AUTHENTICATION REQUIRED) ---------------- #

# 3. Telemetry
@app.get(f"{API_PREFIX}/telemetry/host")
async def get_host_telemetry(_client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Reads workstation battery, charge state, AC connection, and uptime."""
    return telemetry_service.read_host_telemetry()


@app.post(f"{API_PREFIX}/telemetry/client")
async def record_client_telemetry(payload: ClientTelemetryModel, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Receives mobile battery reading and status."""
    return telemetry_service.record_client_telemetry(payload.model_dump())


# 4. Two-Way Clipboard
@app.get(f"{API_PREFIX}/clipboard")
async def get_clipboard(_client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Reads current desktop text clipboard via wl-paste."""
    return await clipboard_service.get_clipboard_text()


@app.post(f"{API_PREFIX}/clipboard")
async def set_clipboard(payload: ClipboardPushModel, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Writes string to desktop Wayland clipboard via wl-copy."""
    return await clipboard_service.set_clipboard_text(payload.content)


# 5. Media & Audio Deck
@app.get(f"{API_PREFIX}/media/status")
async def get_media_status(_client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Queries current MPRIS playback metadata and PipeWire master volume."""
    return await media_service.get_media_status()


@app.post(f"{API_PREFIX}/media/control")
async def control_media(payload: MediaControlModel, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Controls MPRIS playback (play-pause, next, previous, play, pause, stop)."""
    return await media_service.control_playback(payload.action)


@app.post(f"{API_PREFIX}/audio/volume")
async def adjust_volume(payload: AudioVolumeModel, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Attenuates audio volume (up, down, mute, set)."""
    return await media_service.adjust_volume(
        direction=payload.direction,
        step_percent=payload.step_percent,
        target_volume=payload.target_volume,
    )


# 6. Session & Power
@app.post(f"{API_PREFIX}/session/lock")
async def lock_session(_client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Immediately triggers loginctl lock-session."""
    return await power_service.lock_session()


@app.post(f"{API_PREFIX}/power/suspend", status_code=status.HTTP_202_ACCEPTED)
async def suspend_host(payload: PowerActionModel, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Triggers systemctl suspend after strict confirmation verification."""
    return await power_service.suspend(confirm=payload.confirm)


@app.post(f"{API_PREFIX}/power/reboot", status_code=status.HTTP_202_ACCEPTED)
async def reboot_host(payload: PowerActionModel, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Triggers systemctl reboot after strict confirmation verification."""
    return await power_service.reboot(confirm=payload.confirm)


@app.post(f"{API_PREFIX}/power/poweroff", status_code=status.HTTP_202_ACCEPTED)
async def poweroff_host(payload: PowerActionModel, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Triggers systemctl poweroff after strict confirmation verification."""
    return await power_service.poweroff(confirm=payload.confirm)


# 7. Ambient Spawner
@app.get(f"{API_PREFIX}/ambient/options")
async def get_ambient_options(_client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Lists available CLI eye-candy visualizers and detected terminals."""
    return ambient_service.get_options()


@app.post(f"{API_PREFIX}/ambient/spawn", status_code=status.HTTP_202_ACCEPTED)
async def spawn_ambient(payload: AmbientSpawnModel, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Spawns detached terminal visualizer (lavat, cbonsai) without blocking server."""
    return ambient_service.spawn(
        app=payload.app,
        terminal=payload.terminal,
    )


# 8. Remote Shell Console
@app.post(f"{API_PREFIX}/shell/exec")
async def execute_shell_command(payload: ShellExecModel, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Executes arbitrary bash command on host with timeout and memory protection."""
    return await shell_service.execute_command(
        command=payload.command,
        timeout_seconds=payload.timeout_seconds,
        working_directory=payload.working_directory,
    )


# 9. Direct File Drop (Authenticated & Pre-Spool Protected)
@app.post(f"{API_PREFIX}/drop", status_code=status.HTTP_201_CREATED)
async def drop_file(
    file: UploadFile = File(...),
    filename: Optional[str] = Form(None),
    _client: Dict[str, Any] = Depends(get_authenticated_client),
):
    """
    Direct multipart file drop saving to ~/Downloads.
    Pre-spool body size checked by UploadLimitMiddleware.
    """
    return await file_drop_service.save_upload(file, override_filename=filename)


# 10. Pairing Status & Revocation
@app.get(f"{API_PREFIX}/pair/status/{{device_id}}")
async def get_pairing_status(device_id: str, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Checks whether the requesting device is active and paired."""
    is_paired = pairing_service.is_device_paired(device_id)
    return {
        "device_id": device_id,
        "is_paired": is_paired,
        "hostname": socket.gethostname(),
    }


@app.delete(f"{API_PREFIX}/pair/{{device_id}}")
async def unpair_device(device_id: str, client: Dict[str, Any] = Depends(get_authenticated_client)):
    """
    Revokes device token and removes pairing.
    A device can revoke its own credentials; master host can revoke any device.
    """
    if client.get("device_id") != "master_host" and client.get("device_id") != device_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot unpair another device's credentials.",
        )
    removed = pairing_service.unpair_device(device_id)
    return {"status": "unpaired" if removed else "not_found", "device_id": device_id}


# 11. Host-to-Mobile File Sharing (Outbox)
@app.post(f"{API_PREFIX}/share/stage", status_code=status.HTTP_201_CREATED)
async def stage_file_for_sharing(payload: ShareStageModel, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Stages a local file on the Arch Linux host for mobile retrieval."""
    return outbox_service.stage_file(payload.path)


@app.get(f"{API_PREFIX}/share/pending")
async def list_pending_shares(_client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Lists files waiting on the host to be downloaded by the phone."""
    return outbox_service.list_pending()


@app.get(f"{API_PREFIX}/share/download/{{file_id}}")
async def download_shared_file(file_id: str, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Downloads a staged file from the host outbox to the mobile device."""
    dest_path, original_filename = outbox_service.get_file_info(file_id)
    return FileResponse(
        path=dest_path,
        filename=original_filename,
        media_type="application/octet-stream",
    )


@app.delete(f"{API_PREFIX}/share/{{file_id}}")
async def acknowledge_downloaded_file(file_id: str, _client: Dict[str, Any] = Depends(get_authenticated_client)):
    """Removes a file from the host outbox after successful phone download."""
    removed = outbox_service.remove_file(file_id)
    return {"status": "removed" if removed else "not_found", "file_id": file_id}
