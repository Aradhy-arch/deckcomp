"""
DeckComp CLI & Daemon entrypoints for pip / pipx installed packages.
"""
import importlib.util
import os
import sys
from pathlib import Path


def _load_bin_script(name: str):
    bin_path = Path(__file__).parent / "bin" / name
    if not bin_path.exists():
        # Fallback to installed data locations
        bin_path = Path(sys.prefix) / "lib" / "deckcomp" / "bin" / name
    spec = importlib.util.spec_from_file_location(name, bin_path)
    if spec and spec.loader:
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    raise ImportError(f"Cannot load {name} from {bin_path}")


def cli_main():
    mod = _load_bin_script("deckcomp")
    mod.main()


def send_main():
    mod = _load_bin_script("deck-send")
    mod.main()


def daemon_main():
    import uvicorn
    host = os.environ.get("DECK_HOST", "0.0.0.0")
    port = int(os.environ.get("DECK_PORT", "8088"))
    uvicorn.run("main:app", host=host, port=port, log_level="info")


if __name__ == "__main__":
    cli_main()
