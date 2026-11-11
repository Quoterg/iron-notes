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
- **One native library per CPU type** (arm64, 32-bit ARM for old phones, x86_64 for the emulator),
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
./gradlew :app:assembleDebug         # app/build/outputs/apk/debug/app-<cpu>-debug.apk — install with adb
./gradlew :app:assembleRelease       # shrunk, debug-signed: for the size budget only
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
- [ ] **N1b Logic port** — records, effective reps, targets (Dorian, Lyle run-up/push, lighter week),
  volume and goals, cycles, feedback, plates, load types; golden fixtures from the TypeScript tests.
- [ ] **N2 Storage & backup (Rust)** — SQLite schema (rusqlite, bundled, WAL), the web backup JSON in
  and out (round-trip tested with a real web backup), starter library.
- [ ] **N3 Day log & logging** — the main screen: days, swipe, add exercise, log sets for all types,
  steppers, records toast, comments; rest timer as an exact alarm + ongoing notification.
- [ ] **N4 Exercise screen** — history, graph (Canvas), records, targets and readiness.
- [ ] **N5 Calendar, routines, saved workouts, programs.**
- [ ] **N6 Training modes** — Dorian, Lyle cycles, lighter week, feedback, day plan.
- [ ] **N7 Muscles, body map, statistics, review.**
- [ ] **N8 Settings & the rest** — themes, language (strings generated), units, plates, load types,
  body measurements, imports (FitNotes CSV, Iron Log), summary image share.
- [ ] **N9 Parity sweep** — every web e2e spec checked against the native app; baseline profile;
  budgets met.
- [ ] **N10 Move data** — web "Move to the Android app" button + native receive; side-by-side beta.
- [ ] **N11 Cut-over** — release under `io.github.quoterg.ironnotes` over the TWA (owner signs).
- Later: device sync in the native app (the M21 protocol), Health Connect, home-screen widget, and the
  **iPhone app** (SwiftUI on the same Rust core; building it needs a Mac with Xcode).
