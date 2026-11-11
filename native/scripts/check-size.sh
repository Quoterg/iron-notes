#!/usr/bin/env sh
# Size budget for the native app (docs/NATIVE.md): the shrunk release APK must stay ≤ 6 MB.
set -eu
apk=${1:-app/build/outputs/apk/release/app-release.apk}
limit=$((6 * 1024 * 1024))
size=$(wc -c < "$apk")
echo "release APK: $((size / 1024)) KB (budget $((limit / 1024)) KB)"
[ "$size" -le "$limit" ] || { echo "over budget" >&2; exit 1; }
