# Roadmap

Goal: an open-source, local-first training log with everything FitNotes (Android) offers, in Iron
Log's design, fast on old low/mid-range phones (see [ARCHITECTURE.md](ARCHITECTURE.md)). Then
go further: training tracked by **effective reps per muscle group** and other evidence-based tools.

One milestone ≈ one session. If a milestone turns out larger, split it (`M5a`, `M5b`) here and do
the first part. Mark done with `[x]` and the PR/commit. Status lives in [PROGRESS.md](../PROGRESS.md).

## Phase 1 — FitNotes parity

- [x] **M1 Foundation** — Vite + Preact + signals PWA with Iron Log's look (Hologram night /
  Daylight day, Auto/Day/Night), strict CSP, offline service worker, size budget (initial JS ≤ 30 KB
  gzip, CSS ≤ 8 KB). IndexedDB storage. Starter exercise library (8 categories, ~55 exercises).
  Training log per day (‹ › and swipe between days, Today). Add exercise: categories → exercises,
  search. Log sets for all 10 exercise types (weight/reps/distance/time combinations) with +/−
  steppers, Save/Clear, select a set → Update/Delete. Last workout's sets shown. Personal-record
  trophies (rep-max rule) and "new record" toast. Set comments, workout comment. Rest timer
  (auto-start after a set, ±15 s, sound + vibration). Create/edit/delete exercises (type, weight
  step, rest time, notes) and categories (name, colour). Settings: kg/lb, km/mi/m, theme, timer,
  mark-sets-complete. JSON backup export/restore. Vitest + Playwright (Moto G4, 4× CPU) + Lighthouse.
- [x] **M2 CI & hosting** — GitHub repo `Quoterg/iron-notes` (private for now), Actions CI (same gates
  as Iron Log). Hosting: **Cloudflare Pages** (owner's choice; own `*.pages.dev` origin — never move
  it later, data is per origin). Deploy only after CI passes on `main`. Real security headers
  (`_headers`: CSP incl. `frame-ancestors 'none'`, nosniff, caching). Needs the owner's Cloudflare
  secrets (see PROGRESS.md).
- [x] **M3 Exercise history, graphs & records** — Exercise screen tabs: Track | History | Graph |
  Records. History: every workout of the exercise, newest first, tap to open that day. Graph (tiny
  hand-written SVG, like Iron Log's LineChart): estimated 1RM, max weight, max reps, workout volume,
  workout reps, max/total distance, max/total time, best pace; ranges 1 m / 3 m / 6 m / 1 y / all;
  tap a point for its value and date. Records: estimated 1RM (Epley/Brzycki setting), rep-max table
  (1–15 reps, date, actual reps), best per field for other types.
- [x] **M4 Calendar** — Month view, coloured dots per category trained, tap a day to open it, jump
  to today, week starts Monday/Sunday setting; workout count per month.
- [x] **M5a Workout tools** — Copy a workout (or some of its exercises) from another day; reorder
  exercises in a day; delete a whole workout; share a workout as text. Stored per-exercise records
  (DB v2) so opening a day doesn't read each exercise's whole history.
- [x] **M5b Routines** — Named routines with days, exercises per day with planned sets
  (reps/weight/time), log a routine day into the shown date (planned sets unticked, ticked off as done).
- [x] **M5c Saved workouts** — Save a logged day as a workout (sets × reps, supersets; no weights) into a
  folder (a routine); add a whole workout to a day from the top of "Add exercise" (also found by
  search). Weights come from the exercise's last workout set by set, so pyramids keep their shape.
  A workout's superset becomes a new group on the day; an exercise already in another superset that day
  stays in that one (the workout's superset is then split for that exercise).
- [x] **M5d Smart targets** — superseded by Phase 2: progression per mode is M16 (Dorian) and M17 (Lyle).
- [x] **M6 Supersets / groups** — Group exercises in a workout (coloured bar); the rest timer runs
  after the last exercise of a round; jump to the next exercise of the group after saving.
- [x] **M6b Lean start** — Keep first paint lean as features grow: later screens' strings in a lazy
  chunk (like Iron Log's `strings-later`), the day log's tools (copy/reorder/superset/share/delete) as a
  lazy component. Target: initial JS back under ~17 KB.
- [x] **M7 Body tracker** — Body weight, body fat %, measurements (waist, chest, arms, thighs, neck,
  custom metrics); entries per date, chart with trend line, latest value list.
- [x] **M8 Analysis** — Period picker (week, month, 3 m, year, all, custom): workouts, sets, reps,
  volume, time; breakdown per category (sets / volume); workouts per week chart; most frequent
  exercises; per-exercise progress summary.
- [x] **M9 Data** — CSV export (FitNotes-compatible columns), **FitNotes CSV import** (move your
  history over), "storage is persistent" status, delete all data.
- [x] **M10a Calculators** — 1RM calculator with a % table, plate calculator (own bar and plate set
  per unit), warm-up sets rounded to loadable weights; opened from the logging screen (weight prefilled)
  or Settings. Keep the screen on while logging (Wake Lock, setting).
- [x] **M10b Picker & polish** — Favourite (★) and recent exercises at the top of the picker; What's new
  after an update. (Per-exercise default sets dropped: routines plan sets, exercises keep rest/step.)
- [x] **M11 Languages** — Swedish UI (lazy language pack, as Iron Log), then others on request.
- [x] **M12a Android project** — TWA with Bubblewrap like Iron Log: `android/` generated from
  `android/twa-manifest.json` (package `io.github.quoterg.ironnotes`, host iron-notes.pages.dev, minSdk 24),
  builds unsigned; `pnpm assetlinks` writes `/.well-known/assetlinks.json` from the fingerprints; build,
  store listing and data-safety answers in [ANDROID.md](ANDROID.md).
- [ ] **M12b Android release (owner)** — upload key, fingerprint in the manifest, `bubblewrap build`,
  deploy assetlinks.json and verify; optional Google Play listing with Play App Signing.

## Phase 2 — Better than RP Hypertrophy: two training modes on effective reps

Goal and design: [TRAINING-MODES.md](TRAINING-MODES.md). Fast on old phones stays a hard rule: every
calculation is local, incremental and lazy (no screen waits on history).

- [x] **M13 Muscle map** — Muscle groups per exercise (primary and secondary; how much a secondary
  muscle counts is decided with the modes); starter library mapped; editable per exercise.
- [x] **M14 Modes & effort input** — Settings: Standard · Dorian HIT · Lyle effective reps. Dorian: warm-up
  vs working set, one "reps after failure" counter (forced, rest-pause, drop). Lyle: RIR chips per set (chosen
  every set, never prefilled). Effective reps per set (load-based: heavy sets count every rep; Standard mode estimates from e1RM)
  computed and shown.
- [x] **M15 Effective reps per muscle** — Per muscle per session and week vs the mode's goal (Dorian ≈20,
  Lyle 20–40), chips on the day log, a Muscles screen with weekly bars and history.
- [x] **M16 Dorian progression** — Dynamic double progression per set (up to 12 reps, then that set's
  weight up; no rep target after a weight increase — a routine's own reps per set still apply),
  targets on planned sets and the logging screen with the reason; warm-up suggestions
  (50 % / 75 %); "trained again too soon" hint (< ~5 days).
- [x] **M17 Lyle progression** — Cycles of 6 weeks by default (Lyle's own 8 selectable): run-up weeks (80–85 %, 90–95 % of the best for the
  rep range), then add weight when the first set hits the top of the range with ≥ 1 RIR; the next run-up is the
  recovery; exercise/rep-range changes only between cycles.
- [x] **M18 Mesocycles** — A cycle on the calendar (week n of N), length changeable mid-cycle, deload/light
  week when due or on request; saved workouts as the cycle's sessions.
- [x] **M19 Feedback & readiness** — Performance and consistency measured from the log, diet phase (setting +
  body-weight trend), one readiness tap per muscle before its first set, joint-pain flag. Cause first,
  then each mode's lever (Lyle: sets within 20–40, early run-up; Dorian: reorder the split, lighter
  week); swaps start from the new exercise's own history. Every suggestion shows its reason.
  Missed sessions or long gaps lower the next targets; fast recovery allows more.
- [x] **M20 Programs** — Dorian 4-day split and Lyle upper/lower (GBR-style) ready to start; a builder that
  makes a program from saved workouts and a weekly schedule.
- [ ] **M21 Device sync** — Device-to-device sync like Iron Log (QR + direct encrypted WebRTC, no server,
  no account).

## Phase 3 — Gym-floor flow, deeper coaching & ecosystem polish

Every milestone stays strictly within the performance budget (initial JS ≤ 30 KB gzip, CSS ≤ 8 KB
gzip): lazy screens, pure tested helpers in `src/lib/*.ts`, zero external UI/chart dependencies.

**Build order (owner, 2026-11-05):** M25 → M24 → M27 → M29 → M28 → M30 → M23 → M26, then M21 device
sync last (it has to carry every field the milestones before it add).

- [x] **M22 Fast gym flow** — Done in PR #29: tap a "Last time" set to copy it into the form (effort shown;
  Lyle mode never prefills RIR; Undo), search by category and primary/secondary muscle in every loaded
  language, Calculators get the set's reps (1–15), Statistics "Most trained exercises" open the exercise.
- [x] **M25 Load types: dumbbells, body weight + load, assisted** — Per-exercise load type: total
  (barbell/machine), per hand (dumbbells: volume × 2; 1RM and records per hand), body weight + added
  load (latest Body-screen weight on or before the day; without one, the added load only, with a hint),
  assisted (body weight − assistance). Volume, e1RM, records, graphs, Standard-mode RIR estimates and
  feedback use the real load; targets keep stepping the entered number. Starter dumbbell and body-weight
  exercises switch only where the user hasn't edited them; reps-only Dips/Pull Up/Chin Up/Push Up gain
  an optional added load (old sets = + 0 kg).
- [x] **M24 Plate badges & loadable targets** — Optional "Round targets to my plates" setting:
  progression targets (Dorian, Lyle run-up/push, lighter week, gaps) and warm-up chips snap to the
  closest weight loadable with the configured bar and plates (`settings.plates`), with the per-side
  plates under the target.
- [x] **M27 Cycle & block review** — When a Lyle cycle (or a 4–8 week block) ends: start vs end e1RM per
  exercise, average weekly effective reps per muscle, readiness/soreness history, and one-tap swap
  suggestions for stalled or joint-pain-flagged exercises before the next cycle.
- [x] **M29 Swedish starter library & decimal comma** — Stable keys for starter exercises and categories
  so they can show Swedish names without breaking program templates or FitNotes imports; display-only
  decimal comma (`82,5 kg`) in Swedish, `.` kept in CSV exports and inputs.
- [x] **M28 Rest timer in the background & category defaults** — A web page can't reliably schedule an
  alert while the phone sleeps (timers are stopped; Notification Triggers was abandoned), so: first a
  spike of the options (a notification shown as the timer starts, TWA notification delegation, a small
  native Android part), then the one that works without a server; plus per-category default rest times.
  Done: opt-in notification from the page when rest ends while hidden; spike and native fallback in
  [REST-TIMER.md](REST-TIMER.md) (owner's phone test decides whether the native part is needed).
- [x] **M30 Iron Log bridge (backup import)** — Import body weight (and energy trend, if present) from an
  Iron Log backup file to drive the diet phase and recovery feedback. The two apps live on different
  origins and can't read each other's storage; live sync waits for M21 on both sides.
- [x] **M23 Muscle body map & drill-down** — Hand-written SVG front/back figure on the Muscles screen,
  coloured by this week's effective-rep status; tap a region or bar for the exercises that contributed,
  and pick an exercise for an under-trained muscle in one tap.
- [ ] **M26 Session duration & workout summary** — Workout span from the first to the last set; duration,
  effective reps, PRs and muscle-goal hits in a shareable summary (text + self-contained SVG).
