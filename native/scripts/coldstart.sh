#!/usr/bin/env sh
# Cold start of an installed app, median of N runs: ./coldstart.sh [package] [runs]
#   ./coldstart.sh io.github.quoterg.ironnotes.next    # native app
#   ./coldstart.sh io.github.quoterg.ironnotes         # the TWA (see the note below)
# Needs adb and a phone with USB debugging. Each run force-stops the app first. To also make Chrome
# start cold for the TWA (the worst case), pass COLD_CHROME=1.
#
# Note: for the TWA, `am start -W` only times its launcher activity handing over to Chrome — not the
# page being ready. For a fair TWA number, screen-record a launch (adb shell screenrecord) and count
# frames from the tap to the day log showing; do the same for the native app once to compare.
set -eu
pkg=${1:-io.github.quoterg.ironnotes.next}
runs=${2:-10}
act=$(adb shell cmd package resolve-activity --brief "$pkg" | tail -n 1 | tr -d '\r')
[ -n "$act" ] || { echo "not installed: $pkg" >&2; exit 1; }
times=""
i=0
while [ "$i" -lt "$runs" ]; do
  adb shell am force-stop "$pkg"
  [ "${COLD_CHROME:-0}" = 1 ] && adb shell am force-stop com.android.chrome
  sleep 1
  t=$(adb shell am start -W -n "$act" | tr -d '\r' | awk -F': ' '/TotalTime/ {print $2}')
  echo "run $((i + 1)): ${t} ms"
  times="$times $t"
  i=$((i + 1))
  sleep 2
done
echo "$times" | tr ' ' '\n' | grep . | sort -n | awk '{a[NR]=$1} END {m = NR % 2 ? a[(NR+1)/2] : (a[NR/2] + a[NR/2+1]) / 2; print "median: " m " ms (" NR " runs)"}'
