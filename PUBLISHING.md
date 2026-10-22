# DeckComp Publishing & Distribution Guide

This guide walks you through publishing **DeckComp** so anyone in the world can install both the desktop host daemon and the Android companion app.

---

## 1. Publishing to GitHub

### A. Initialize the Git Repository
In `/home/aradhy/companion-server`:
```bash
git init
git add .
git commit -m "feat: initial release of DeckComp Linux host daemon and CLI v1.0.0"
```

### B. Push to GitHub
Create a new public repository on [GitHub](https://github.com/new) named `deckcomp`.
```bash
git branch -M main
git remote add origin https://github.com/<your-username>/deckcomp.git
git push -u origin main
```

### C. Create a GitHub Release
1. Go to your GitHub repository -> **Releases** -> **Draft a new release**.
2. Tag: `v1.0.0`
3. Title: `DeckComp v1.0.0`
4. Attach the following assets to the release:
   - Android APK (e.g., `deckcomp-v1.0.0.apk`)
   - Source code `.tar.gz` (generated automatically by GitHub)

Once published, your users can install the desktop daemon with the single command:
```bash
curl -fsSL https://raw.githubusercontent.com/<your-username>/deckcomp/main/install.sh | bash
```

---

## 2. Publishing to the Arch User Repository (AUR)

DeckComp is tailored for Arch Linux and Wayland. Publishing to the AUR allows all Arch, EndeavourOS, and Manjaro users to install via `yay -S deckcomp`.

### Prerequisites:
1. An account on [aur.archlinux.org](https://aur.archlinux.org/).
2. Your public SSH key (`~/.ssh/id_ed25519.pub`) added to your AUR account settings.

### Steps:
```bash
# 1. Clone the empty AUR repository for deckcomp
git clone ssh://aur@aur.archlinux.org/deckcomp.git /tmp/aur-deckcomp

# 2. Copy the PKGBUILD, .SRCINFO, deckcomp.install, and LICENSE into the AUR repo
cp /home/aradhy/companion-server/PKGBUILD /tmp/aur-deckcomp/
cp /home/aradhy/companion-server/.SRCINFO /tmp/aur-deckcomp/
cp /home/aradhy/companion-server/deckcomp.install /tmp/aur-deckcomp/
cp /home/aradhy/companion-server/LICENSE /tmp/aur-deckcomp/

# 3. Verify PKGBUILD locally
cd /tmp/aur-deckcomp
makepkg -f

# 4. Commit and push to AUR
git add PKGBUILD .SRCINFO deckcomp.install LICENSE
git commit -m "feat: initial release of deckcomp 1.0.0"
git push origin master
```

Now any Arch user can install it via:
```bash
yay -S deckcomp
```

---

## 3. Publishing to PyPI (Python Package Index)

Publishing to PyPI allows installation on any distribution via `pipx install deckcomp` or `pip install deckcomp`.

### Prerequisites:
```bash
python -m pip install --upgrade build twine
```

### Steps:
```bash
cd /home/aradhy/companion-server

# 1. Build source distribution and wheel
python -m build

# 2. Upload to PyPI
twine upload dist/*
```

---

## 4. Distributing the Android APK

1. The Android companion APK is compiled via EAS Build:
   ```bash
   cd /home/aradhy/companion-app
   eas build -p android --profile production
   ```
   Or for local building without an EAS account:
   ```bash
   npx expo run:android --variant release
   ```
2. Upload the `.apk` file to your GitHub Releases page so users can download it directly onto their phone.
3. Users simply install the APK, launch DeckComp, and pair with their workstation!
