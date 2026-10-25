import os
import secrets
import shutil
import stat
from pathlib import Path

VERSION = "1.0.0"

# Network binding: default to 0.0.0.0 to allow LAN companion connections.
DEFAULT_HOST = os.environ.get("DECK_HOST", "0.0.0.0")
DEFAULT_PORT = int(os.environ.get("DECK_PORT", "8088"))
API_PREFIX = "/api/v1"

# Storage limits and paths
DOWNLOADS_DIR = Path(os.environ.get("DECK_DOWNLOADS_DIR", Path.home() / "Downloads")).resolve()
MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB limit for Warpinator-grade file transfer

# Subprocess timeouts (seconds)
FAST_CMD_TIMEOUT = 3.0
DEFAULT_SHELL_TIMEOUT = 15.0
MAX_SHELL_TIMEOUT = 60.0
MAX_STREAM_CAPTURE_BYTES = 65536  # 64 KiB max capture per stream
MAX_CONCURRENT_SUBPROCESSES = 5

# Allowed executables and terminals for ambient visualizers
ALLOWED_AMBIENT_APPS = {"lavat"}
if shutil.which("cbonsai"):
    ALLOWED_AMBIENT_APPS.add("cbonsai")
SUPPORTED_TERMINALS = ["kitty", "alacritty", "foot"]

# Authentication Token & Security
LEGACY_CONFIG_DIR = Path.home() / ".config" / "deckcompanion"
PRIMARY_CONFIG_DIR = Path.home() / ".config" / "deckcomp"

# Migrate legacy config directory if present and primary does not exist yet
if not PRIMARY_CONFIG_DIR.exists() and LEGACY_CONFIG_DIR.exists():
    try:
        PRIMARY_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        os.chmod(PRIMARY_CONFIG_DIR, 0o700)
        for item in LEGACY_CONFIG_DIR.iterdir():
            dest = PRIMARY_CONFIG_DIR / item.name
            if not dest.exists() and item.is_file():
                shutil.copy2(item, dest)
    except Exception:
        pass

CONFIG_DIR = PRIMARY_CONFIG_DIR if PRIMARY_CONFIG_DIR.exists() else LEGACY_CONFIG_DIR
TOKEN_FILE = CONFIG_DIR / "token"
PAIRED_DEVICES_FILE = CONFIG_DIR / "paired_devices.json"

# Outbox Staging Path
LEGACY_OUTBOX_DIR = Path.home() / ".local" / "share" / "deckcompanion" / "outbox"
PRIMARY_OUTBOX_DIR = Path.home() / ".local" / "share" / "deckcomp" / "outbox"

if not PRIMARY_OUTBOX_DIR.exists() and LEGACY_OUTBOX_DIR.exists():
    try:
        PRIMARY_OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
        os.chmod(PRIMARY_OUTBOX_DIR, 0o700)
        for item in LEGACY_OUTBOX_DIR.iterdir():
            dest = PRIMARY_OUTBOX_DIR / item.name
            if not dest.exists() and item.is_file():
                shutil.copy2(item, dest)
    except Exception:
        pass

OUTBOX_DIR = PRIMARY_OUTBOX_DIR if PRIMARY_OUTBOX_DIR.exists() else LEGACY_OUTBOX_DIR
OUTBOX_INDEX_FILE = OUTBOX_DIR / "index.json"


def get_or_create_auth_token() -> str:
    """
    Retrieves the master authentication token from DECK_AUTH_TOKEN env var
    or persistent ~/.config/deckcomp/token file (mode 0600).
    Auto-generates a high-entropy 32-byte hex token if none exists.
    Verifies owner and restrictive permissions on existing token files.
    """
    env_token = os.environ.get("DECK_AUTH_TOKEN")
    if env_token and env_token.strip():
        return env_token.strip()

    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(CONFIG_DIR, 0o700)

    if TOKEN_FILE.exists():
        try:
            st = os.stat(TOKEN_FILE, follow_symlinks=False)
            # Ensure it is a regular file owned by the current user
            if stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid():
                # Enforce 0600 permissions if not already set
                if (st.st_mode & 0o077) != 0:
                    os.chmod(TOKEN_FILE, 0o600)
                stored = TOKEN_FILE.read_text(encoding="utf-8").strip()
                if stored:
                    return stored
        except OSError:
            pass

    # Generate new token and write atomically with secure 0600 permissions
    new_token = secrets.token_hex(32)
    temp_token_file = CONFIG_DIR / f".tmp_token_{secrets.token_hex(8)}"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(temp_token_file, flags, 0o600)
    with open(fd, "w", encoding="utf-8") as f:
        f.write(new_token + "\n")
        f.flush()
        os.fsync(fd)

    os.replace(temp_token_file, TOKEN_FILE)
    return new_token
