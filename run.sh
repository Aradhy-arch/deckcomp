#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Activate virtual environment if present
if [ -d "$SCRIPT_DIR/venv" ]; then
    source "$SCRIPT_DIR/venv/bin/activate"
fi

HOST="${DECK_HOST:-0.0.0.0}"
PORT="${DECK_PORT:-8088}"

# Inform operator about authentication token location
TOKEN_FILE="$HOME/.config/deckcomp/token"
if [ ! -f "$TOKEN_FILE" ]; then
    TOKEN_FILE="$HOME/.config/deckcompanion/token"
fi
if [ -f "$TOKEN_FILE" ]; then
    echo "DeckComp auth token loaded from $TOKEN_FILE"
fi

echo "Starting DeckComp Host Daemon on http://$HOST:$PORT..."
exec uvicorn main:app --host "$HOST" --port "$PORT" --log-level info
