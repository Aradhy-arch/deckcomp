#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="deck-companion.service"
USER_SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

echo "Creating systemd user directory: $USER_SYSTEMD_DIR"
mkdir -p "$USER_SYSTEMD_DIR"

echo "Installing $SERVICE_NAME..."
cp "$SCRIPT_DIR/systemd/$SERVICE_NAME" "$USER_SYSTEMD_DIR/$SERVICE_NAME"

echo "Reloading systemd user daemon..."
systemctl --user daemon-reload

echo "Enabling and starting $SERVICE_NAME..."
systemctl --user enable --now "$SERVICE_NAME"

echo "Status:"
systemctl --user status "$SERVICE_NAME" --no-pager
