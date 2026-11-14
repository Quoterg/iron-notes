# Native Android app (Phase 4)

The owner asked (2026-11-11) to try a native rewrite for speed, without the app ever going offline.
This is the plan. The web app (PWA + TWA) stays the product until the native app has reached parity
and the owner has used it side by side.

## What a native app actually buys Iron Notes

The proposal came from an architecture review of Iron Log. Some of it doesn't apply to Iron Notes:

| Claim | For Iron Notes |
|---|---|
| mmap'd food database, SIMD search | No big read-only database or search here. Doesn't apply. |
| Drops a 1 MB barcode wasm | Iron Notes has none (QR scan already uses the built-in detector). |
| SQLite vs IndexedDB | Real but small: startup reads are a few ms on our sizes. |
| Cold start: TWA boots Chrome first | **Real.** The biggest win, when Chrome isn't already running. |
| "< 60 ms cold start", "< 1 frame input-to-photon" | Not realistic for any Android app on an old phone. A Compose app with a baseline profile is typically 300–600 ms cold on a low-end phone. Measure, don't trust numbers. |
| Exact OS alarms / notifications | **Real.** Fixes the rest timer with the screen off (REST-TIMER.md) for good. |
| Health Connect | **Real**, later: body weight in, workouts out. |

Also native-only: home-screen widget (today's targets), a lock-screen/ongoing rest-timer
notification with +15 s / Skip buttons, haptics, and no browser address bar edge cases.

So: worth doing for cold start, the rest timer, and Health Connect — and, with the core in Rust, an
iPhone app later that shares the logic, database and backups. Speed claims are verified by
measurement (N0) before and after.

## Architecture (owner's choice 2026-11-11: Rust core + native UI, iPhone later)

```
 Android: Kotlin + Jetpack Compose          iPhone (later): Swift + SwiftUI
 UI, notifications, exact alarms,           UI, notifications, HealthKit
 file picker, Health Connect, widgets
               \                            /
                UniFFI bindings (generated)
                              |
     Rust core (native/core-rs, crate iron_core)
     - training logic: 1RM, records, effective reps, targets (Dorian, Lyle),
       volume and goals, cycles, feedback, plates, load types, units
     - storage: SQLite (rusqlite, bundled, WAL), schema + migrations
     - backup JSON in/out (the web app's format), CSV / FitNotes / Iron Log imports
     - sync merge rules (later)
```

- **Everything that isn't screen or OS lives in Rust**, so the iPhone app is only a new UI on top of
  the same core: same logic, same database file, same backups.
- **UI: Kotlin + Jetpack Compose** (foundation only, no Material — as on the web: no component
  libraries), single activity, minSdk 24 (Android 7) for old phones.
- **Bindings: UniFFI** generates the Kotlin (and later Swift) API from the Rust code. The API is
  coarse — "today's log with targets", "save this set" — so a screen makes one or two calls, not one
  per set.
- **One native library per CPU type** (arm64, 32-bit ARM for old phones; x86_64 for the emulator only with
  `-PrustAbis=x86_64`),
  built with `cargo-ndk` from Gradle. Release builds use `opt-level = "z"`, LTO, one codegen unit,
  stripped; panics unwind, so a bug in the core becomes a Kotlin exception rather than a crash.
  GitHub releases get **one APK per CPU type** (and a universal one), so each phone downloads only its
  own library. N1a sizes: the core is 389 KB (arm64) / 268 KB (32-bit ARM), JNA (which UniFFI's
  Kotlin uses) 166 KB / 116 KB.
- Kotlin bindings are generated at build time (`build/generated/uniffi`, package
  `io.github.quoterg.ironnotes.core`), from a host build of the core — the Android libraries are
  stripped, which removes the metadata UniFFI reads. Swift bindings come from the same crate later
  (`staticlib`, module `IronCore`).
- Weights in kg, distances in km, time in seconds — as on the web; converted only for display.

### Keeping the apps the same

- **Golden fixtures:** the TypeScript tests export inputs and expected outputs as JSON
  (`native/core-rs/tests/golden/`), and the Rust tests run the same cases. One source of truth for the
  training logic; a change on either side that disagrees fails CI.
- **Backup format:** the native app reads and writes the web app's backup JSON (same schema version),
  so data moves both ways at any time.
- **Strings:** generated from `src/lib/i18n.ts` + `src/lib/lang/sv.ts` into Android `strings.xml`
  (later iOS `Localizable.strings`), so wording stays in one place.

### Budgets (hard gates, like the web app's)

- Release APK per CPU type ≤ 6 MB, universal ≤ 9 MB (R8 + resource shrinking + stripped Rust), no
  Play Services.
- Cold start ≤ 500 ms on the owner's phone (`adb shell am start -W`, median of 10), with a baseline profile.
- No analytics, no network permission until sync needs it; data stays on the device.

## Build and measure

```sh
cd native
echo "sdk.dir=$HOME/.bubblewrap/android_sdk" > local.properties   # any Android SDK with platform 36
export JAVA_HOME=$HOME/.bubblewrap/jdk/jdk-17.0.11+9               # a JDK 17 (not just a JRE)
# Once: Rust (rustup.rs) + Android targets, cargo-ndk, and NDK r28c
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo install cargo-ndk --version 4.1.2 --locked
sdkmanager --sdk_root=$HOME/.bubblewrap/android_sdk "ndk;28.2.13676358"

cargo test --manifest-path core-rs/Cargo.toml   # Rust core, incl. the golden fixtures
./gradlew :app:assembleNextDebug     # app/build/outputs/apk/next/debug/app-next-<cpu>-debug.apk — install with adb
./gradlew :app:assembleRelease -PdebugSignedStable   # both flavours, shrunk, debug-signed: size check only
./scripts/check-size.sh              # per-CPU release APKs ≤ 6 MB, universal ≤ 9 MB
./scripts/coldstart.sh io.github.quoterg.ironnotes.next   # phone over USB; median of 10 cold starts
```

Versions are pinned to what works with Android Gradle plugin 8.11 and SDK 36 (Compose BOM 2025.12,
Activity 1.11); the newest Compose needs plugin 9.1 and SDK 37 — a deliberate upgrade later.

After changing logic in `src/lib` that has golden cases: `UPDATE_GOLDEN=1 pnpm test golden`, then port
the change to `native/core-rs` until `cargo test` passes again (CI runs both).

## Never offline: how the switch happens

1. **The website keeps running** at iron-notes.pages.dev throughout — and after: it stays the app
   for desktop, iPhone and anyone without the APK. Web fixes continue as normal.
2. **The current APK (TWA 1.0.1) stays** in GitHub Releases and on the phone.
3. **The native app installs beside it** as a separate app, *Iron Notes Next*
   (`io.github.quoterg.ironnotes.next`), so both can be used at the same time. Data is copied in with
   a backup file (Settings → Backup on the web, open the file with Iron Notes Next).
4. **Cut-over, only at parity** and after the owner has used it for real: the native app is released
   under the TWA's own package `io.github.quoterg.ironnotes`, signed with the same upload key and a
   higher version code, so it installs as an update over the TWA. The TWA's data lives in Chrome
   (the website's storage), which the native app can't read — so before that release the web app gets
   a **"Move to the Android app"** button that hands its backup to the native app in one tap. The data
   also stays in Chrome, so nothing is lost if a step is skipped.
5. The TWA build stays in the repo (`android/`) until the native app has been the release for a while.

## Release (N11 cut-over, the owner signs)

The app has two build flavours (`native/app/build.gradle.kts`):

| Flavour  | Package                            | Name              | Version code | Use                         |
|----------|------------------------------------|-------------------|--------------|-----------------------------|
| `next`   | `io.github.quoterg.ironnotes.next` | Iron Notes Next   | 1            | beta, installs beside the TWA |
| `stable` | `io.github.quoterg.ironnotes`      | Iron Notes        | 100          | the cut-over: updates the TWA (code 2) |

Both keep the code namespace `io.github.quoterg.ironnotes.next` (so the activity is
`io.github.quoterg.ironnotes.next.MainActivity` in both, and the manifest's `.MainActivity` resolves to it) —
don't rename it per flavour. CI builds both with the debug key (only to check the size budget). Anywhere
else, a `stable` release build **fails without the upload key** (a debug-signed one can't update the TWA
and would block later updates); for a local size check only, pass `-PdebugSignedStable`. An update over the TWA needs the
**same key that signed the TWA**: `android/android.keystore`, alias `ironnotes` (docs/ANDROID.md).

1. Once, create `native/keystore.properties`. It is gitignored, so never commit it.
   `storeFile` is relative to `native/`.
   ```properties
   storeFile=../android/android.keystore
   storePassword=…
   keyAlias=ironnotes
   keyPassword=…
   ```
2. Build and check the signer. It must be the TWA's SHA-256 (`66:CB:16:…`, the one in
   `public/.well-known/assetlinks.json`):
   ```sh
   cd native
   ./gradlew :app:assembleStableRelease        # app/build/outputs/apk/stable/release/
   $ANDROID_HOME/build-tools/36.1.0/apksigner verify --print-certs \
     app/build/outputs/apk/stable/release/app-stable-arm64-v8a-release.apk | grep SHA-256
   ```
   For Google Play, use `./gradlew :app:bundleStableRelease` (an `.aab` file) instead.
3. Publish a GitHub release `v2.0.0` with `app-stable-arm64-v8a-release.apk` (most phones),
   `app-stable-armeabi-v7a-release.apk` (old 32-bit phones) and `app-stable-universal-release.apk`.
   For the next native release, raise `versionCode` and `versionName` in the `stable` flavour.
4. On the phone, install the APK over the TWA. Android shows it as an update. Then move the data:
   open iron-notes.pages.dev in Chrome (the TWA's data is Chrome's), go to Settings →
   **Move to the Android app**, and choose **Iron Notes**. You can do this before or after the
   update. The data also stays in Chrome, so nothing is lost if a step is skipped. If the beta data
   in Iron Notes Next is newer, use Export there and open the file with Iron Notes instead. Then
   uninstall Iron Notes Next.
5. Keep a backup of `android/android.keystore` and its passwords. Without that key, no future
   release can update the app.

## Milestones

Each is one PR, reviewed like the web milestones. CI builds the native app and runs its tests on every
PR that touches `native/`.

- [x] **N0 Plan & shell** — this document; `native/` Gradle project (app + core modules) installable as
  *Iron Notes Next*, Iron Log's colours (Hologram night / Daylight day) on a first screen; CI job
  (build, unit tests, lint, APK size); cold-start measurement script for the TWA and the native app.
  Release APK 717 KB.
- [x] **N1a Rust core & bridge** — `native/core-rs` crate with UniFFI, built per CPU type by Gradle
  (cargo-ndk, NDK r28c), Kotlin bindings generated at build time; replaces the Kotlin `core` module;
  units + 1RM ported with the golden-fixture harness; the first screen shows a value computed in Rust;
  per-CPU APKs; CI installs Rust; library size measured. Release APKs 1.1–1.3 MB per CPU type
  (universal 2.8 MB); the shrunk build runs on Android 7.0 (emulator, cold start ~535 ms there
  without a baseline profile and with software graphics — phone numbers come from coldstart.sh).
- [x] **N1b Logic port** — records, effective reps, targets (Dorian, Lyle run-up/push, lighter week),
  volume and goals, cycles, feedback, plates, load types; golden fixtures from the TypeScript tests
  (src/lib/golden-*.test.ts → native/core-rs/tests/golden/, ~7,600 cases).
- [x] **N2 Storage & backup (Rust)** — SQLite schema (rusqlite, bundled, WAL), the web backup JSON in
  and out (round-trip tested with a real web backup), starter library. Also: the `IronCore` UniFFI object,
  web strings generated into assets/strings.json. APKs 2.6–3.1 MB per CPU type.
- [x] **N3 Day log & logging** — the main screen: days, swipe, add exercise, log sets for all types,
  steppers, records toast, comments; rest timer as an exact alarm + notification. (Day tools, targets and
  routines' planned sets come with N5/N6.)
- [x] **N4 Exercise screen** — history, graph (Canvas), records (targets and readiness move to N6).
- [x] **N5 Calendar, routines, saved workouts, programs** (+ day tools: copy, reorder, supersets, share, delete).
- [x] **N6 Training modes** — Dorian, Lyle cycles, lighter week, feedback, day plan (targets, effort, readiness, warm-ups, plates, effective reps on the logging screen).
- [x] **N7 Muscles, body map, statistics, review.**
- [x] **N8 Settings & the rest** — themes, language (strings generated), units, plates, load types,
  body measurements, imports (FitNotes CSV, Iron Log), summary image share.
- [x] **N9 Parity sweep** — every web e2e spec checked against the native app; baseline profile;
  budgets met.
- [x] **N10 Move data** — web "Move to the Android app" button + native receive; side-by-side beta.
- [x] **N11 Cut-over** — release under `io.github.quoterg.ironnotes` over the TWA: prepared (`stable`
  flavour, signing, steps in "Release"); the owner signs and publishes v2.0.0.
- Later: device sync in the native app (the M21 protocol), Health Connect, home-screen widget, and the
  **iPhone app** (SwiftUI on the same Rust core; building it needs a Mac with Xcode).
