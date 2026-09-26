#!/bin/zsh
# Installs Mic Guard, a menu bar app that keeps your Mac's input on your best mic.
#
#   curl -fsSL https://redesignedrobot.github.io/mic-guard/install.sh | zsh
#   curl -fsSL https://redesignedrobot.github.io/mic-guard/install.sh | zsh -s -- --source
#   curl -fsSL https://redesignedrobot.github.io/mic-guard/install.sh | zsh -s -- --uninstall
#
# Default: downloads the latest release and checks its SHA-256.
# --source: clones the repo and compiles it on this Mac (needs the Command Line Tools).
# Installs to /Applications, or ~/Applications if /Applications isn't writable. Never uses sudo.
# Everything runs inside main, so a partly downloaded script does nothing.

main() {
    set -euo pipefail

    local repo=RedesignedRobot/mic-guard
    local app=MicGuard.app

    step() { print -P "%F{green}==>%f $1"; }
    fail() { print -P "%F{red}Error:%f $1" >&2; exit 1; }

    local mode=${1:-release}
    case $mode in
        release|--source|--uninstall) ;;
        *) fail "unknown option $mode. Use --source or --uninstall." ;;
    esac

    [[ $(uname) == Darwin ]] || fail "Mic Guard is a macOS app."
    local major=${$(sw_vers -productVersion)%%.*}
    (( major >= 15 )) || fail "Mic Guard needs macOS 15 or later. This Mac runs $(sw_vers -productVersion)."

    # Replace an existing copy where it is, so there is only ever one Mic Guard.
    local dest=/Applications
    if [[ -d ~/Applications/$app ]]; then
        dest=~/Applications
    elif [[ ! -w /Applications ]]; then
        dest=~/Applications
    fi

    if pgrep -xq MicGuard; then
        step "Quitting the running Mic Guard"
        osascript -e 'quit app id "com.local.MicGuard"' 2>/dev/null || pkill -x MicGuard || true
        sleep 1
    fi

    if [[ $mode == --uninstall ]]; then
        rm -rf /Applications/$app ~/Applications/$app
        defaults delete com.local.MicGuard 2>/dev/null || true
        step "Removed Mic Guard and its settings."
        return
    fi

    local tmp=$(mktemp -d)
    trap "rm -rf '$tmp'" EXIT

    if [[ $mode == --source ]]; then
        xcode-select -p >/dev/null 2>&1 || fail "the Command Line Tools are missing. Run: xcode-select --install"
        step "Cloning $repo"
        git clone --quiet --depth 1 https://github.com/$repo "$tmp/src"
        step "Compiling (this takes a minute)"
        "$tmp/src/build.sh" zip >"$tmp/build.log" 2>&1 || { cat "$tmp/build.log" >&2; fail "the build failed."; }
        mv "$tmp/src/build/$app" "$tmp/$app"
    else
        local url=https://github.com/$repo/releases/latest/download
        step "Downloading the latest release"
        curl -fsSL "$url/MicGuard.zip" -o "$tmp/MicGuard.zip"
        curl -fsSL "$url/MicGuard.zip.sha256" -o "$tmp/MicGuard.zip.sha256"
        local expected actual
        read -r expected _ < "$tmp/MicGuard.zip.sha256"
        shasum -a 256 "$tmp/MicGuard.zip" | read -r actual _
        [[ $expected == $actual ]] || fail "checksum mismatch. The download may be corrupted; try again."
        ditto -x -k "$tmp/MicGuard.zip" "$tmp"
    fi

    codesign --verify --strict "$tmp/$app" || fail "the app's signature doesn't verify."

    mkdir -p "$dest"
    rm -rf "$dest/$app"
    mv "$tmp/$app" "$dest/"
    step "Installed $dest/$app"

    open "$dest/$app"
    step "Mic Guard is running. Look for the mic in your menu bar."
}

main "$@"
