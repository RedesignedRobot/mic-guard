#!/bin/zsh
# Compiles AppIcon.icon (edit it in Icon Composer) into the files build.sh ships:
#   Assets.car       Liquid Glass icon for macOS 26 and later
#   AppIcon.icns     flat fallback for macOS 15, every size up to 1024
#   AppIcon-1024.png flat 1024 PNG with the standard margin, for the README and site
# Needs full Xcode 26 or later for actool. Commit the outputs so builds work with the Command Line Tools alone.
set -euo pipefail
cd "${0:A:h}"

out=$(mktemp -d)
trap 'rm -rf $out' EXIT
xcrun actool AppIcon.icon --compile $out --app-icon AppIcon --include-all-app-icons \
    --standalone-icon-behavior all --output-partial-info-plist $out/partial.plist \
    --platform macosx --target-device mac --minimum-deployment-target 15.0 \
    --enable-on-demand-resources NO --development-region en --errors --warnings > /dev/null
cp $out/Assets.car $out/AppIcon.icns .
iconutil -c iconset $out/AppIcon.icns -o $out/AppIcon.iconset
cp $out/AppIcon.iconset/icon_512x512@2x.png AppIcon-1024.png
echo "Wrote Assets.car, AppIcon.icns and AppIcon-1024.png"
