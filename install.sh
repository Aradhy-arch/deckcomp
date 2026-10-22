#!/usr/bin/env bash
# ==============================================================================
# DeckComp Desktop Host Installer
# One-command installer for DeckComp daemon, CLI tools, and desktop integrations.
# ==============================================================================

set -eo pipefail

# Catppuccin Mocha Color Scheme for polished terminal output
CLR_RESET="\033[0m"
CLR_BOLD="\033[1m"
CLR_MAUVE="\033[38;2;203;166;247m"
CLR_BLUE="\033[38;2;137;180;250m"
CLR_GREEN="\033[38;2;166;227;161m"
CLR_YELLOW="\033[38;2;249;226;175m"
CLR_RED="\033[38;2;243;139;168m"
CLR_SUBTEXT="\033[38;2;166;173;200m"

info()    { echo -e "${CLR_BLUE}==>${CLR_RESET} ${CLR_BOLD}$1${CLR_RESET}"; }
success() { echo -e "${CLR_GREEN}✓${CLR_RESET} $1"; }
warn()    { echo -e "${CLR_YELLOW}⚠${CLR_RESET} $1"; }
error()   { echo -e "${CLR_RED}✗${CLR_RESET} $1" >&2; }

print_banner() {
    cat << "EOF"
  ____            _     ____                      
 |  _ \  ___  ___| | __/ ___|___  _ __ ___  _ __  
 | | | |/ _ \/ __| |/ / |   / _ \| '_ ` _ \| '_ \ 
 | |_| |  __/ (__|   <| |__| (_) | | | | | | |_) |
 |____/ \___|\___|_|\_\\____\___/|_| |_| |_| .__/ 
                                           |_|    
EOF
    echo -e "${CLR_MAUVE}DeckComp Desktop Host Installer${CLR_RESET} - Linux Companion Daemon"
    echo -e "${CLR_SUBTEXT}Two-way file drops, clipboard sync, media deck, and workstation control${CLR_RESET}"
    echo
}

# Defaults
INSTALL_DIR="${HOME}/.local/share/deckcomp"
BIN_DIR="${HOME}/.local/bin"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
AUTO_YES=false
INSTALL_DEPS=true
ENABLE_SERVICE=true
REPO_URL="https://github.com/Aradhy-Arch/deckcomp.git"

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -y|--yes|--non-interactive)
            AUTO_YES=true
            shift
            ;;
        --no-deps)
            INSTALL_DEPS=false
            shift
            ;;
        --no-service)
            ENABLE_SERVICE=false
            shift
            ;;
        --prefix)
            INSTALL_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: ./install.sh [OPTIONS]"
            echo
            echo "Options:"
            echo "  -y, --yes             Non-interactive mode (auto-accept all prompts)"
            echo "  --no-deps             Skip system package manager dependency installation"
            echo "  --no-service          Do not enable or start systemd user service"
            echo "  --prefix <dir>        Custom target directory (default: ~/.local/share/deckcomp)"
            echo "  -h, --help            Show this help message"
            exit 0
            ;;
        *)
            error "Unknown argument: $1"
            echo "Run './install.sh --help' for usage."
            exit 1
            ;;
    esac
done

print_banner

# Step 1: Detect Source Directory
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

TMP_DIR=""
cleanup() {
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi
}
trap cleanup EXIT

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/main.py" ]; then
    SOURCE_DIR="$SCRIPT_DIR"
    info "Installing from local source: $SOURCE_DIR"
else
    info "Installing from remote repository..."
    if ! command -v git &>/dev/null; then
        error "git is required to fetch DeckComp. Please install git or run from a cloned repo."
        exit 1
    fi
    TMP_DIR="$(mktemp -d /tmp/deckcomp-install-XXXXXX)"
    git clone --depth 1 "$REPO_URL" "$TMP_DIR"
    SOURCE_DIR="$TMP_DIR"
fi

# Step 2: System Dependency Check & Installation
if [ "$INSTALL_DEPS" = true ]; then
    info "Checking system package dependencies..."
    
    MISSING_PKGS=()
    PKG_MGR=""

    if command -v pacman &>/dev/null; then
        PKG_MGR="pacman"
        ARCH_PKGS=("python" "python-pip" "wl-clipboard" "libnotify" "playerctl" "pipewire")
        for pkg in "${ARCH_PKGS[@]}"; do
            if ! pacman -Q "$pkg" &>/dev/null; then
                MISSING_PKGS+=("$pkg")
            fi
        done
    elif command -v apt-get &>/dev/null; then
        PKG_MGR="apt"
        DEB_PKGS=("python3" "python3-pip" "python3-venv" "wl-clipboard" "libnotify-bin" "playerctl" "pipewire")
        for pkg in "${DEB_PKGS[@]}"; do
            if ! dpkg -s "$pkg" &>/dev/null; then
                MISSING_PKGS+=("$pkg")
            fi
        done
    elif command -v dnf &>/dev/null; then
        PKG_MGR="dnf"
        RPM_PKGS=("python3" "python3-pip" "wl-clipboard" "libnotify" "playerctl" "pipewire")
        for pkg in "${RPM_PKGS[@]}"; do
            if ! rpm -q "$pkg" &>/dev/null; then
                MISSING_PKGS+=("$pkg")
            fi
        done
    else
        warn "Could not identify standard package manager (pacman/apt/dnf). Skipping automatic package installation."
    fi

    if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
        warn "Missing system packages: ${MISSING_PKGS[*]}"
        DO_INSTALL=false
        if [ "$AUTO_YES" = true ]; then
            DO_INSTALL=true
        else
            read -rp "Would you like to install missing system packages with sudo? [Y/n] " response
            case "$response" in
                [yY][eE][sS]|[yY]|"")
                    DO_INSTALL=true
                    ;;
                *)
                    DO_INSTALL=false
                    ;;
            esac
        fi

        if [ "$DO_INSTALL" = true ]; then
            case "$PKG_MGR" in
                pacman)
                    sudo pacman -S --needed --noconfirm "${MISSING_PKGS[@]}"
                    ;;
                apt)
                    sudo apt-get update && sudo apt-get install -y "${MISSING_PKGS[@]}"
                    ;;
                dnf)
                    sudo dnf install -y "${MISSING_PKGS[@]}"
                    ;;
            esac
            success "System packages installed."
        else
            warn "Skipped system packages. Ensure Wayland/clipboard/media tools are installed for full functionality."
        fi
    else
        success "All required system tools (Python, wl-clipboard, libnotify, playerctl, PipeWire) are present."
    fi
fi

# Step 3: Install Core Files to ~/.local/share/deckcomp
info "Deploying DeckComp daemon to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

# Copy essential runtime files
cp -r "$SOURCE_DIR/main.py" \
      "$SOURCE_DIR/config.py" \
      "$SOURCE_DIR/env_resolver.py" \
      "$SOURCE_DIR/subprocess_runner.py" \
      "$SOURCE_DIR/requirements.txt" \
      "$SOURCE_DIR/services" \
      "$SOURCE_DIR/bin" \
      "$SOURCE_DIR/systemd" \
      "$INSTALL_DIR/"

if [ -d "$SOURCE_DIR/desktop" ]; then
    cp -r "$SOURCE_DIR/desktop" "$INSTALL_DIR/"
fi

# Make binaries executable
chmod +x "$INSTALL_DIR/bin/deckcomp" "$INSTALL_DIR/bin/deck-send"
success "Files copied to $INSTALL_DIR."

# Step 4: Python Virtual Environment Setup
info "Setting up isolated Python virtual environment..."
VENV_DIR="$INSTALL_DIR/venv"

# If local source has an existing initialized venv, bootstrap from it
if [ -d "$SOURCE_DIR/venv" ] && [ ! -f "$VENV_DIR/bin/uvicorn" ]; then
    info "Bootstrapping environment from local source packages..."
    rm -rf "$VENV_DIR"
    python3 -m venv "$VENV_DIR"
    if [ -d "$SOURCE_DIR/venv/lib" ]; then
        cp -r "$SOURCE_DIR/venv/lib" "$VENV_DIR/"
    fi
    for bin_tool in uvicorn fastapi; do
        if [ -f "$SOURCE_DIR/venv/bin/$bin_tool" ]; then
            cp "$SOURCE_DIR/venv/bin/$bin_tool" "$VENV_DIR/bin/"
            sed -i "s|^#!.*python.*|#!$VENV_DIR/bin/python3|" "$VENV_DIR/bin/$bin_tool" 2>/dev/null || true
        fi
    done
fi

if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi

if [ ! -f "$VENV_DIR/bin/uvicorn" ]; then
    info "Installing Python dependencies (fastapi, uvicorn, pydantic, aiofiles)..."
    "$VENV_DIR/bin/pip" install --upgrade pip --quiet 2>/dev/null || true
    "$VENV_DIR/bin/pip" install -r "$INSTALL_DIR/requirements.txt" --quiet
fi
success "Python environment prepared."

# Step 5: Install CLI Utilities into ~/.local/bin
info "Linking CLI utilities (deckcomp, deck-send) to $BIN_DIR..."
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/bin/deckcomp" "$BIN_DIR/deckcomp"
ln -sf "$INSTALL_DIR/bin/deck-send" "$BIN_DIR/deck-send"
success "CLI commands 'deckcomp' and 'deck-send' installed."

# Verify PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    warn "$BIN_DIR is not in your current PATH."
    ADD_PATH=false
    if [ "$AUTO_YES" = true ]; then
        ADD_PATH=true
    else
        read -rp "Add $BIN_DIR to your shell profile (~/.bashrc / ~/.zshrc)? [Y/n] " res
        case "$res" in
            [yY][eE][sS]|[yY]|"") ADD_PATH=true ;;
            *) ADD_PATH=false ;;
        esac
    fi

    if [ "$ADD_PATH" = true ]; then
        PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
        if [ -f "$HOME/.bashrc" ] && ! grep -q ".local/bin" "$HOME/.bashrc"; then
            echo "$PATH_LINE" >> "$HOME/.bashrc"
        fi
        if [ -f "$HOME/.zshrc" ] && ! grep -q ".local/bin" "$HOME/.zshrc"; then
            echo "$PATH_LINE" >> "$HOME/.zshrc"
        fi
        success "Added $BIN_DIR to shell profiles. Run 'source ~/.bashrc' or restart your terminal."
    fi
fi

# Step 6: Install Desktop & File Manager Context Actions
info "Installing desktop & file-manager integrations..."

# 1. Application menu launcher
mkdir -p "$HOME/.local/share/applications"
if [ -f "$INSTALL_DIR/desktop/deckcomp.desktop" ]; then
    cp "$INSTALL_DIR/desktop/deckcomp.desktop" "$HOME/.local/share/applications/"
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi

# 2. KDE Dolphin Context Menu
mkdir -p "$HOME/.local/share/kio/servicemenus"
if [ -f "$INSTALL_DIR/desktop/deckcomp-send.desktop" ]; then
    cp "$INSTALL_DIR/desktop/deckcomp-send.desktop" "$HOME/.local/share/kio/servicemenus/"
fi

# 3. GNOME Nautilus / Nemo Context Script
mkdir -p "$HOME/.local/share/nautilus/scripts"
if [ -f "$INSTALL_DIR/desktop/deckcomp-send.sh" ]; then
    cp "$INSTALL_DIR/desktop/deckcomp-send.sh" "$HOME/.local/share/nautilus/scripts/Send to Phone (DeckComp)"
    chmod +x "$HOME/.local/share/nautilus/scripts/Send to Phone (DeckComp)"
fi

# 4. XFCE Thunar Custom Action
THUNAR_DIR="$HOME/.config/Thunar"
THUNAR_UCA="$THUNAR_DIR/uca.xml"
if [ -d "$THUNAR_DIR" ] || which thunar >/dev/null 2>&1; then
    mkdir -p "$THUNAR_DIR"
    python3 - << 'PYEOF' 2>/dev/null || true
import xml.etree.ElementTree as ET
from pathlib import Path

uca_path = Path.home() / ".config" / "Thunar" / "uca.xml"
if not uca_path.exists():
    root = ET.Element("actions")
    tree = ET.ElementTree(root)
else:
    try:
        tree = ET.parse(uca_path)
        root = tree.getroot()
    except Exception:
        root = ET.Element("actions")
        tree = ET.ElementTree(root)

exists = False
for act in root.findall("action"):
    cmd = act.find("command")
    if cmd is not None and "deck-send" in (cmd.text or ""):
        exists = True
        break

if not exists:
    action = ET.SubElement(root, "action")
    ET.SubElement(action, "icon").text = "deckcomp"
    ET.SubElement(action, "name").text = "Send to Phone (DeckComp)"
    ET.SubElement(action, "submenu").text = ""
    ET.SubElement(action, "unique-id").text = "deckcomp-send-action-1"
    ET.SubElement(action, "command").text = "deck-send %F"
    ET.SubElement(action, "description").text = "Send selected file(s) to phone via DeckComp"
    ET.SubElement(action, "range").text = "*"
    ET.SubElement(action, "patterns").text = "*"
    ET.SubElement(action, "audio-files")
    ET.SubElement(action, "image-files")
    ET.SubElement(action, "other-files")
    ET.SubElement(action, "text-files")
    ET.SubElement(action, "video-files")
    
    ET.indent(tree, space="\t", level=0)
    tree.write(uca_path, encoding="utf-8", xml_declaration=True)
PYEOF
fi

# 5. Desktop application icon
mkdir -p "$HOME/.local/share/icons/hicolor/512x512/apps"
if [ -f "$INSTALL_DIR/desktop/deckcomp.png" ]; then
    cp "$INSTALL_DIR/desktop/deckcomp.png" "$HOME/.local/share/icons/hicolor/512x512/apps/deckcomp.png"
fi

success "Desktop and file drop context actions configured."

# Step 7: Systemd User Service Setup
if [ "$ENABLE_SERVICE" = true ]; then
    info "Installing systemd user service..."
    mkdir -p "$SYSTEMD_USER_DIR"
    cp "$INSTALL_DIR/systemd/deckcomp.service" "$SYSTEMD_USER_DIR/deckcomp.service"

    # Stop legacy service if active
    systemctl --user stop deck-companion.service 2>/dev/null || true
    systemctl --user disable deck-companion.service 2>/dev/null || true

    if systemctl --user daemon-reload 2>/dev/null; then
        systemctl --user enable --now deckcomp.service 2>/dev/null || true
        success "DeckComp background service enabled and started."

        # Step 8: Health Check Verification
        info "Verifying daemon health..."
        HEALTHY=false
        for i in {1..10}; do
            if curl -fs "http://127.0.0.1:8088/api/v1/health" &>/dev/null; then
                HEALTHY=true
                break
            fi
            sleep 0.5
        done

        if [ "$HEALTHY" = true ]; then
            success "DeckComp daemon is active and responding on port 8088."
        else
            warn "Daemon service started, but health endpoint is still initializing."
            echo "  Run 'deckcomp status' or 'deckcomp logs' to monitor."
        fi
    else
        warn "systemd user session is not currently running (e.g., container or headless session)."
        echo "  The service is installed and will automatically activate upon graphical desktop login."
        echo "  To start the server immediately in the foreground: ~/.local/share/deckcomp/venv/bin/uvicorn main:app --app-dir ~/.local/share/deckcomp"
    fi
fi

# Step 9: Summary & Pairing Guide
echo
echo -e "${CLR_MAUVE}================================================================${CLR_RESET}"
echo -e "${CLR_BOLD}${CLR_GREEN} DeckComp Desktop Host Installed Successfully!${CLR_RESET}"
echo -e "${CLR_MAUVE}================================================================${CLR_RESET}"
echo
echo -e " ${CLR_BOLD}Quick Start:${CLR_RESET}"
echo -e "   1. Open the ${CLR_MAUVE}DeckComp${CLR_RESET} app on your Android phone."
echo -e "   2. Tap ${CLR_BOLD}'Pair New PC'${CLR_RESET}."
echo -e "   3. Your PC will display a 6-digit PIN notification."
echo -e "   4. Enter the PIN on your phone to establish encrypted pairing."
echo
echo -e " ${CLR_BOLD}CLI Commands:${CLR_RESET}"
echo -e "   ${CLR_BLUE}deckcomp status${CLR_RESET}      View daemon health, endpoints, and paired phones"
echo -e "   ${CLR_BLUE}deckcomp send <file>${CLR_RESET}  Stage a file for your phone to download"
echo -e "   ${CLR_BLUE}deck-send <file>${CLR_RESET}      Fast file drop alias"
echo -e "   ${CLR_BLUE}deckcomp doctor${CLR_RESET}      Diagnostic check for Wayland, audio, and visualizers"
echo -e "   ${CLR_BLUE}deckcomp logs${CLR_RESET}        Follow live daemon logs"
echo -e "   ${CLR_BLUE}deckcomp stop${CLR_RESET}        Stop background service"
echo -e "   ${CLR_BLUE}deckcomp restart${CLR_RESET}     Restart background service"
echo
echo -e " ${CLR_BOLD}File Drops from Desktop:${CLR_RESET}"
echo -e "   • Right-click any file in KDE Dolphin or Nautilus -> ${CLR_GREEN}Send to Phone (DeckComp)${CLR_RESET}"
echo -e "   • Or drop via terminal: ${CLR_BLUE}deck-send document.pdf${CLR_RESET}"
echo
