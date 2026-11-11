#!/usr/bin/env sh
# Size budget for the native app (docs/NATIVE.md): every shrunk per-CPU release APK ≤ 6 MB; the
# universal one (all CPU types) ≤ 9 MB.
set -eu
dir=${1:-app/build/outputs/apk/release}
fail=0
found=0
for apk in "$dir"/*.apk; do
  [ -e "$apk" ] || continue
  found=1
  # Any APK not named "universal" is a per-CPU split and gets the 6 MB budget.
  case "$apk" in *universal*) limit=$((9 * 1024 * 1024)) ;; *) limit=$((6 * 1024 * 1024)) ;; esac
  size=$(wc -c < "$apk")
  status=ok
  [ "$size" -le "$limit" ] || { status="OVER BUDGET"; fail=1; }
  echo "$(basename "$apk"): $((size / 1024)) KB (budget $((limit / 1024)) KB) $status"
done
[ "$found" = 1 ] || { echo "no APKs in $dir" >&2; exit 1; }
exit "$fail"
