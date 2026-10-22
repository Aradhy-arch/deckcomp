#!/usr/bin/env bash
# ==============================================================================
# DeckComp Desktop Host Uninstaller
# Cleanly stops and removes DeckComp daemon, CLI tools, and integrations.
# ==============================================================================

set -eo pipefail

CLR_RESET="\033[0m"
CLR_BOLD="\033[1m"
CLR_MAUVE="\033[38;2;203;166;247m"
CLR_BLUE="\033[38;2;137;180;250m"
CLR_GREEN="\033[38;2;166;227;161m"
CLR_YELLOW="\033[38;2;249;226;175m"
CLR_RED="\033[38;2;243;139;168m"

info()    { echo -e "${CLR_BLUE}==>${CLR_RESET} ${CLR_BOLD}$1${CLR_RESET}"; }
success() { echo -e "${CLR_GREEN}✓${CLR_RESET} $1"; }
warn()    { echo -e "${CLR_YELLOW}⚠${CLR_RESET} $1"; }

INSTALL_DIR="${HOME}/.local/share/deckcomp"
BIN_DIR="${HOME}/.local/bin"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
AUTO_YES=false
PURGE_DATA=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -y|--yes|--non-interactive)
            AUTO_YES=true
            shift
            ;;
        --purge)
            PURGE_DATA=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./uninstall.sh [OPTIONS]"
            echo
            echo "Options:"
            echo "  -y, --yes      Non-interactive mode (auto-accept defaults)"
            echo "  --purge        Also delete pairing tokens, paired devices, and config directories"
            echo "  -h, --help     Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

echo -e "${CLR_MAUVE}DeckComp Desktop Host Uninstaller${CLR_RESET}"
echo

# 1. Stop and disable systemd service
info "Stopping and disabling background services..."
systemctl --user stop deckcomp.service deck-companion.service 2>/dev/null || true
systemctl --user disable deckcomp.service deck-companion.service 2>/dev/null || true

# 2. Remove systemd service files
rm -f "$SYSTEMD_USER_DIR/deckcomp.service" "$SYSTEMD_USER_DIR/deck-companion.service"
systemctl --user daemon-reload 2>/dev/null || true
success "Systemd user services removed."

# 3. Remove CLI symlinks
info "Removing CLI executables from $BIN_DIR..."
rm -f "$BIN_DIR/deckcomp" "$BIN_DIR/deck-send"
success "CLI commands removed."

# 4. Remove desktop and file-manager integrations
info "Removing desktop and file manager integrations..."
rm -f "$HOME/.local/share/applications/deckcomp.desktop"
rm -f "$HOME/.local/share/kio/servicemenus/deckcomp-send.desktop"
rm -f "$HOME/.local/share/nautilus/scripts/Send to Phone (DeckComp)"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
success "Desktop actions removed."

# 5. Remove daemon installation directory
if [ -d "$INSTALL_DIR" ]; then
    info "Removing installation directory $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR"
    success "Installation files removed."
fi

# 6. Purge configuration and paired devices if requested
if [ "$PURGE_DATA" = false ] && [ "$AUTO_YES" = false ]; then
    echo
    read -rp "Would you like to purge pairing credentials and configurations (~/.config/deckcomp)? [y/N] " res
    case "$res" in
        [yY][eE][sS]|[yY])
            PURGE_DATA=true
            ;;
        *)
            PURGE_DATA=false
            ;;
    esac
fi

if [ "$PURGE_DATA" = true ]; then
    info "Purging configurations and pairing credentials..."
    rm -rf "$HOME/.config/deckcomp" "$HOME/.config/deckcompanion"
    rm -rf "$HOME/.local/share/deckcompanion"
    success "Credentials and configuration purged."
else
    info "Preserved pairing credentials in ~/.config/deckcomp."
fi

echo
success "DeckComp has been successfully uninstalled from your workstation."
