# Android app (Trusted Web Activity)

Iron Notes on Android is the same web app in a Trusted Web Activity, built with Bubblewrap like Iron
Log: package **`io.github.quoterg.ironnotes`**, opening **https://iron-notes.pages.dev/** full screen
(Chrome or another TWA-capable browser does the rendering, so the app stays as fast and small as the
site, and updates with every deploy — no new build needed for app changes).

The generated project is in `android/` (from `android/twa-manifest.json`); a new build is only needed
when the manifest changes (name, colours, icons, shortcuts, version). Never commit keys or builds
(`.gitignore` covers them).

## One-time: the upload key (owner)

The key never leaves the owner's machine; keep a backup — losing it means a new Play listing.

```sh
cd android
keytool -genkeypair -v -keystore android.keystore -alias ironnotes -keyalg RSA -keysize 2048 -validity 10000
keytool -list -v -keystore android.keystore -alias ironnotes   # copy the SHA256 line
```

Put the SHA-256 fingerprint in `android/twa-manifest.json`:

```json
"fingerprints": [{ "name": "upload key", "value": "AB:CD:…" }]
```

## Build (owner)

```sh
cd android
bubblewrap update --skipVersionUpgrade   # after any change to twa-manifest.json
bubblewrap build                         # asks for the keystore and key passwords
```

Outputs: `app-release-signed.apk` (install directly) and `app-release-bundle.aab` (Google Play). For a
new store release, raise `appVersionCode` (and `appVersionName`) in the manifest first.

To check the project without signing (as CI or a session can):

```sh
cd android
JAVA_HOME=~/.bubblewrap/jdk/jdk-17.0.11+9 ANDROID_HOME=~/.bubblewrap/android_sdk ./gradlew assembleRelease
```

## Digital Asset Links (owner runs, then deploy)

The site must vouch for the app, or the app shows a browser bar:

```sh
pnpm assetlinks   # writes public/.well-known/assetlinks.json from the manifest's fingerprints
```

Commit it and let it deploy (CI → Cloudflare Pages), then verify:

```
https://iron-notes.pages.dev/.well-known/assetlinks.json
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://iron-notes.pages.dev&relation=delegate_permission/common.handle_all_urls
```

With **Play App Signing**, Play re-signs the app with its own key: add Play's app-signing SHA-256
(Play Console → Test and release → App integrity) as a second fingerprint, run `pnpm assetlinks` again,
deploy.

## Store listing (Google Play)

- **Name:** Iron Notes – training log
- **Short description (≤ 80):** Workout log with effective reps, Dorian HIT and Lyle modes. Free, offline.
- **Full description:**
  - Log sets, reps and weights fast; records, 1RM, graphs, history, calendar, routines and saved workouts.
  - Two evidence-based training modes: Dorian Yates' HIT (to failure, double progression to 12 reps, then
    more weight) and Lyle McDonald's effective reps (reps in reserve, 6-week cycles with a run-up).
  - Effective reps per muscle against your mode's goal; targets for every set with the reason.
  - Feedback that finds the cause (a long gap, a cut, one exercise, real fatigue) before suggesting a fix.
  - Ready-made programs: Dorian's 4-day split and Lyle's upper/lower; or your own with training weekdays.
  - Body measurements, plate and warm-up calculators, rest timer, FitNotes CSV import.
  - No account, no ads, no tracking: everything stays on your phone; export any time. Fast on older
    phones, works offline. Open source.
- **Category:** Health & Fitness. **Content rating:** Everyone / PEGI 3 (no user content, no location,
  no purchases). **Target audience:** 18+.

## Data safety form

**No data collected, no data shared.** Iron Notes has no server, no account, no analytics and makes no
third-party requests: everything the user logs stays in the browser storage on the device. The only
network traffic is loading the app itself from Cloudflare Pages (hosting, which Play doesn't count as
collection). Data is deleted by "Delete all data" in Settings or by uninstalling.

- Data encrypted in transit: yes (HTTPS for the app files).
- Users can request deletion: yes, in the app (Settings → Delete all data).

## Checklist

- [x] Project generated and builds (unsigned) — `android/`
- [x] `pnpm assetlinks` and this guide
- [x] Owner: upload key, fingerprint in the manifest, `bubblewrap build` (2026-11-05)
- [x] APK 1.0.0 on GitHub Releases: https://github.com/Quoterg/iron-notes/releases/tag/v1.0.0
- [x] `assetlinks.json` deployed and verified by Google's Digital Asset Links API (2026-11-05)
- [x] APK 1.0.1 (code 2) on GitHub Releases: https://github.com/Quoterg/iron-notes/releases/tag/v1.0.1
- [ ] Owner (optional): Google Play listing with Play App Signing (one-time developer fee), then add
      Play's fingerprint
