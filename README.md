# DeckComp Desktop Daemon & CLI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Linux%20(Wayland%2FPipeWire)-blue.svg)](#)
[![Android Companion](https://img.shields.io/badge/Companion-Android%20App-green.svg)](#)

**DeckComp** is a high-performance, lightweight host daemon and workstation controller for Linux desktops (Arch, Fedora, Debian/Ubuntu). It connects seamlessly with the **DeckComp Android companion app** over local Wi-Fi, turning your phone into an interactive hardware control deck, clipboard bridge, and file drop hub.

---

## Features

- **🚀 Two-Way Instant File Drops**:
  - **Phone to PC**: Drop files from Android directly into `~/Downloads` on your PC.
  - **PC to Phone**: Drop files from terminal (`deck-send <file>`) or **right-click any file** in KDE Dolphin or GNOME Nautilus.
- **📋 Wayland Clipboard Sync**:
  - Cryptographically synchronized bidirectional clipboard via native `wl-clipboard` (`wl-copy` / `wl-paste`).
- **🎵 MPRIS Media Controller**:
  - Play/pause, track navigation, volume control, and metadata polling via `playerctl`.
- **🔊 PipeWire Audio Control**:
  - Instant sink volume attenuation and mute toggles via `wpctl`.
- **✨ Ambient Terminal Visualizers**:
  - Spawn matrix fluid visualizers (`lavat`) or bonsai trees (`cbonsai`) on your workstation right from your phone.
- **🔐 Secure PIN Pairing**:
  - KDE Connect-style 6-digit PIN desktop notification pairing with rate-limiting and persistent token authorization.
- **🛡️ Sandboxed Systemd User Service**:
  - Automatically runs on graphical login with strict path sandboxing.

---

## ⚡ Quick Start: One-Command Installation

You can install the entire DeckComp workflow with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/deckcomp/deckcomp/main/install.sh | bash
```

Or if you have cloned the repository:

```bash
git clone https://github.com/deckcomp/deckcomp.git
cd deckcomp
./install.sh
```

### What the installer does automatically:
1. Detects your distribution (Arch `pacman`, Debian/Ubuntu `apt`, or Fedora `dnf`) and verifies required system tools (`wl-clipboard`, `libnotify`, `playerctl`, `pipewire`).
2. Installs the host daemon to `~/.local/share/deckcomp/` with an isolated Python virtual environment.
3. Links the unified CLI `deckcomp` and quick-drop alias `deck-send` into `~/.local/bin/`.
4. Installs file manager right-click integrations for KDE Dolphin and GNOME Nautilus.
5. Installs, enables, and starts the background `deckcomp.service` via `systemctl --user`.

---

## 📦 Arch Linux (AUR) Installation

For Arch Linux users, DeckComp includes native `PKGBUILD` and `.SRCINFO` specifications:

```bash
# Using yay:
yay -S deckcomp

# Or using paru:
paru -S deckcomp

# Or building manually:
cd companion-server
makepkg -si
```

Enable and start the service:
```bash
systemctl --user enable --now deckcomp.service
```

---

## 📱 Mobile Pairing Guide

1. Launch **DeckComp** on your Android phone.
2. Tap **Pair New PC**.
3. If your workstation is on the same local Wi-Fi, it will appear in auto-discovery. Tap your PC (or enter your PC's LAN IP).
4. A desktop notification will pop up on your computer displaying a **6-digit pairing PIN**.
5. Enter the PIN on your phone.
6. **Done!** Your phone is now securely paired with persistent token authorization.

> **Tip:** You can check host pairing endpoints and instructions anytime in terminal by running:
> ```bash
> deckcomp pair
> ```

---

## 💻 CLI Reference (`deckcomp`)

DeckComp includes a comprehensive workstation manager:

| Command | Description |
| :--- | :--- |
| `deckcomp status` | Displays daemon health, local LAN endpoints, paired phones, and outbox count |
| `deckcomp pair` | Displays local IP addresses and pairing walkthrough |
| `deckcomp send <file>` | Stages a file on your PC for your phone to download (`deck-send` alias) |
| `deckcomp outbox` | Lists files currently waiting in the host outbox |
| `deckcomp outbox --clear` | Clears all staged files from the host outbox |
| `deckcomp devices` | Lists all paired mobile devices and their IDs |
| `deckcomp unpair <device_id>` | Revokes access for a specific paired phone |
| `deckcomp doctor` | Runs self-diagnostics for Wayland, audio, and visualizer binaries |
| `deckcomp start` | Starts the background systemd service |
| `deckcomp stop` | Stops the background systemd service |
| `deckcomp restart` | Restarts the background systemd service |
| `deckcomp logs` | Follows real-time daemon logs via `journalctl` |
| `deckcomp token` | Shows the host master authentication token |

---

## 📂 Desktop Context Menu (Right-Click File Drops)

DeckComp automatically integrates with popular Linux file managers:

- **KDE Dolphin**: Right-click any file -> **DeckComp** -> **Send to Phone (DeckComp)**.
- **GNOME Nautilus / Nemo / Caja**: Right-click any file -> **Scripts** -> **Send to Phone (DeckComp)**.

Staged files immediately become available for download in the **File Drop** tab of your mobile app!

---

## 🧪 Self-Diagnostics (`deckcomp doctor`)

Verify that your desktop environment is fully configured:

```bash
deckcomp doctor
```

Example output:
```
==> DeckComp Workstation Doctor Diagnostic

  [OK] Wayland Display Socket: wayland-0
  [OK] wl-copy / wl-paste     -> /usr/bin/wl-paste
  [OK] notify-send            -> /usr/bin/notify-send
  [OK] playerctl              -> /usr/bin/playerctl
  [OK] wpctl                  -> /usr/bin/wpctl
  [OK] lavat                  -> /usr/bin/lavat
  [OK] cbonsai                -> /usr/bin/cbonsai

  [OK] Localhost Daemon: HTTP 200 OK (v1.0.0)
```

---

## 🗑️ Uninstallation

To cleanly remove DeckComp:

```bash
./uninstall.sh

# Or to also purge pairing credentials and configurations:
./uninstall.sh --purge
```

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
