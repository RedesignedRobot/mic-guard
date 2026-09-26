#!/bin/zsh
# Builds Mic Guard for Apple Silicon and Intel, installs it to ~/Applications and opens it.
#   ./build.sh       build and install
#   ./build.sh zip   build only, and write build/MicGuard.zip plus its checksum for a release
# Signs ad-hoc unless SIGNING_IDENTITY names a certificate from `security find-identity -p codesigning`.
set -euo pipefail
cd "${0:A:h}"

APP=build/MicGuard.app

rm -rf build
mkdir -p $APP/Contents/MacOS $APP/Contents/Resources
cp Info.plist $APP/Contents/
# Icon outputs are prebuilt by Resources/compile-icon.sh, which needs full Xcode.
cp Resources/AppIcon.icns Resources/Assets.car $APP/Contents/Resources/
for arch in arm64 x86_64; do
    swiftc -O -swift-version 6 -parse-as-library -target $arch-apple-macos15 \
        Sources/*.swift -o build/MicGuard-$arch
done
lipo -create build/MicGuard-arm64 build/MicGuard-x86_64 -output $APP/Contents/MacOS/MicGuard
rm build/MicGuard-arm64 build/MicGuard-x86_64
codesign --force --options runtime --sign "${SIGNING_IDENTITY:--}" $APP

if [[ "${1:-}" == zip ]]; then
    ditto -c -k --keepParent $APP build/MicGuard.zip
    (cd build && shasum -a 256 MicGuard.zip > MicGuard.zip.sha256)
    echo "Wrote build/MicGuard.zip and its .sha256"
    exit 0
fi

pkill -x MicGuard || true
rm -rf ~/Applications/MicGuard.app
mkdir -p ~/Applications
mv $APP ~/Applications/
open ~/Applications/MicGuard.app
echo "Installed ~/Applications/MicGuard.app"
