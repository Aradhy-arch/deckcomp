# 🐧 DeckComp

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Linux%20(Wayland)-blue.svg)](#)
[![Android](https://img.shields.io/badge/Client-Android-green.svg)](#)

A zero-bloat, lightweight Linux host daemon and CLI bridge built for the **DeckComp Android companion app** 📱. Turn your phone into an interactive hardware control deck, clipboard bridge, and file drop utility over local Wi-Fi ⚡.

---

## ✨ Highlights

* 🚀 **Bidirectional File Drop:** Push files directly to `~/Downloads` on your PC, or send files to your phone via CLI (`deck-send`) or right-click file manager menus.
* 📋 **Wayland Clipboard Sync:** Low-latency clipboard synchronization using native `wl-clipboard` (`wl-copy` / `wl-paste`).
* 🎵 **Media & Audio Control:** Control MPRIS media via `playerctl` and PipeWire sink volume via `wpctl`.
* 🔐 **Instant PIN Pairing:** Frictionless 6-digit desktop PIN verification with persistent token authorization.
* 🛡️ **Systemd Native:** Runs as a sandboxed, low-overhead background `systemd --user` service.

---

## ⚡ Installation

### 🚀 Quick Install (Automated)

Run the install script to verify dependencies, configure the isolated environment, install CLI tools, set up file manager actions, and start the systemd service:

```bash
curl -fsSL https://raw.githubusercontent.com/deckcomp/deckcomp/main/install.sh | bash
```

<details>
<summary>🛠️ Manual / Git Installation</summary>

```bash
git clone --depth=1 https://github.com/deckcomp/deckcomp.git
cd deckcomp
./install.sh
```

**What the installer handles automatically:**
1. 🔍 Checks dependencies (`wl-clipboard`, `libnotify`, `playerctl`, `pipewire`) across Arch, Fedora, and Debian/Ubuntu.
2. 📦 Deploys the daemon to `~/.local/share/deckcomp/` in an isolated virtual environment.
3. 🔗 Symlinks `deckcomp` and `deck-send` into `~/.local/bin/`.
4. 📂 Adds right-click context menu actions to KDE Dolphin and GNOME Nautilus.
5. ⚙️ Enables and starts the `deckcomp.service` user unit.

</details>

> 📦 *Arch Linux (AUR package) coming soon!*

---

## 📱 Quick Pairing

1. 📥 Download the **DeckComp APK** from the [Releases](https://github.com/deckcomp/deckcomp/releases) page and install it.
2. 📲 Launch **DeckComp** on your Android device and tap **Pair New PC**.
3. 🔔 A desktop notification will pop up on your computer showing a **6-digit PIN**.
4. 🔑 Enter the PIN on your phone to complete pairing.

> 💡 **Tip:** You can check host pairing endpoints and instructions anytime in terminal:
> ```bash
> deckcomp pair
> ```

---

## 💻 CLI Reference

DeckComp includes a unified command (`deckcomp`) and a quick-drop alias (`deck-send`).

### 🎮 Core Commands

| Command | Description |
| :--- | :--- |
| `deckcomp status` | 📊 Show daemon health, local endpoints, and paired devices |
| `deckcomp pair` | 🤝 Show local IP addresses and pairing helper |
| `deck-send <file>` | 📤 Stage a file for download on your phone (`deckcomp send <file>`) |
| `deckcomp doctor` | 🩺 Run system diagnostics for Wayland, audio, and visualizer tools |

<details>
<summary>⚙️ View Service & Device Management Commands</summary>

### 📁 File & Device Management

| Command | Description |
| :--- | :--- |
| `deckcomp outbox` | 📋 List staged files waiting for transfer |
| `deckcomp outbox --clear` | 🧹 Clear all staged outbox files |
| `deckcomp devices` | 📱 List paired device IDs |
| `deckcomp unpair <id>` | 🚫 Revoke access for a paired device |
| `deckcomp token` | 🔑 Print master authorization token |

### 🔄 Systemd Controls

| Command | Description |
| :--- | :--- |
| `deckcomp start` | ▶️ Start the background service |
| `deckcomp stop` | ⏹️ Stop the background service |
| `deckcomp restart` | 🔁 Restart the background service |
| `deckcomp logs` | 📜 Tail daemon logs (`journalctl --user -u deckcomp -f`) |

</details>

---

## 🔌 Integrations & Diagnostics

### 🖱️ Right-Click File Drops

DeckComp integrates natively with popular Linux file managers:

* 🐬 **KDE Dolphin:** Right-click $\rightarrow$ **DeckComp** $\rightarrow$ **Send to Phone (DeckComp)**
* 📁 **GNOME Nautilus / Nemo / Caja:** Right-click $\rightarrow$ **Scripts** $\rightarrow$ **Send to Phone (DeckComp)**

Staged files show up instantly in the **File Drop** tab of your mobile app!

---

### 🧪 System Diagnostics (`deckcomp doctor`)

Verify that your desktop environment and system utilities are ready:

```bash
deckcomp doctor
```

```text
==> DeckComp Workstation Doctor Diagnostic
  [OK] Wayland Display Socket: wayland-0
  [OK] wl-copy / wl-paste     -> /usr/bin/wl-paste
  [OK] notify-send            -> /usr/bin/notify-send
  [OK] playerctl              -> /usr/bin/playerctl
  [OK] wpctl                  -> /usr/bin/wpctl
  [OK] Localhost Daemon:      -> HTTP 200 OK (v1.0.0)
```

---

## 🗑️ Uninstallation

To remove DeckComp cleanly:

```bash
./uninstall.sh

# To purge configuration files and pairing keys as well:
./uninstall.sh --purge
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
