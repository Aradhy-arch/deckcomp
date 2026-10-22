# Maintainer: Aradhy-Arch <zzgg.andrew.ggzz@gmail.com>
pkgname=deckcomp
pkgver=1.0.0
pkgrel=1
pkgdesc="DeckComp: Companion server & workflow controller for Linux desktop (Wayland/PipeWire) and Android"
arch=('any')
url="https://github.com/Aradhy-arch/deckcomp"
license=('MIT')
depends=(
    'python'
    'python-fastapi'
    'python-uvicorn'
    'python-pydantic'
    'python-multipart'
    'python-aiofiles'
    'wl-clipboard'
    'libnotify'
    'playerctl'
    'pipewire'
)
optdepends=(
    'lavat: Matrix fluid terminal visualizer'
    'cbonsai: Ambient bonsai tree terminal visualizer'
    'dolphin: For KDE Dolphin file-manager right-click send action'
    'thunar: For XFCE Thunar file-manager right-click send action'
)
install=deckcomp.install
source=("$pkgname-$pkgver.tar.gz::$url/archive/v$pkgver.tar.gz")
sha256sums=('e7400c5c3ac030ea46382a239c862bf7da60ddb2f8ccf0d5866219d044dc9db7')

package() {
    # If building locally from repo:
    if [ -f "$startdir/main.py" ]; then
        cd "$startdir"
    elif [ -d "$srcdir/$pkgname-$pkgver" ]; then
        cd "$srcdir/$pkgname-$pkgver"
    fi

    # 1. Install daemon files into /usr/lib/deckcomp
    install -dm755 "$pkgdir/usr/lib/deckcomp"
    install -m644 main.py config.py env_resolver.py subprocess_runner.py requirements.txt "$pkgdir/usr/lib/deckcomp/"
    cp -r services "$pkgdir/usr/lib/deckcomp/"

    # 2. Install executables into /usr/bin
    install -dm755 "$pkgdir/usr/bin"
    install -m755 bin/deckcomp "$pkgdir/usr/bin/deckcomp"
    install -m755 bin/deck-send "$pkgdir/usr/bin/deck-send"

    # 3. Install systemd user service into /usr/lib/systemd/user
    install -dm755 "$pkgdir/usr/lib/systemd/user"
    install -m644 systemd/deckcomp-system.service "$pkgdir/usr/lib/systemd/user/deckcomp.service"

    # 4. Install desktop & file-manager integrations
    install -dm755 "$pkgdir/usr/share/applications"
    install -m644 desktop/deckcomp.desktop "$pkgdir/usr/share/applications/deckcomp.desktop"

    install -dm755 "$pkgdir/usr/share/kio/servicemenus"
    install -m644 desktop/deckcomp-send.desktop "$pkgdir/usr/share/kio/servicemenus/deckcomp-send.desktop"

    install -dm755 "$pkgdir/usr/share/deckcomp"
    install -m644 desktop/deckcomp-thunar.xml "$pkgdir/usr/share/deckcomp/deckcomp-thunar.xml"

    # 5. Install application icon
    install -dm755 "$pkgdir/usr/share/icons/hicolor/512x512/apps"
    install -m644 desktop/deckcomp.png "$pkgdir/usr/share/icons/hicolor/512x512/apps/deckcomp.png"

    # 6. Install license
    if [ -f "LICENSE" ]; then
        install -dm755 "$pkgdir/usr/share/licenses/$pkgname"
        install -m644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
    fi
}
