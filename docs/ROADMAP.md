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
- [x] **M6 Supersets / groups** — Group exercises in a workout (coloured bar); the rest timer runs
  after the last exercise of a round; jump to the next exercise of the group after saving.
- [x] **M6b Lean start** — Keep first paint lean as features grow: later screens' strings in a lazy
  chunk (like Iron Log's `strings-later`), the day log's tools (copy/reorder/superset/share/delete) as a
  lazy component. Target: initial JS back under ~17 KB.
- [x] **M7 Body tracker** — Body weight, body fat %, measurements (waist, chest, arms, thighs, neck,
  custom metrics); entries per date, chart with trend line, latest value list.
- [ ] **M8 Analysis** — Period picker (week, month, 3 m, year, all, custom): workouts, sets, reps,
  volume, time; breakdown per category (sets / volume); workouts per week chart; most frequent
  exercises; per-exercise progress summary.
- [ ] **M9 Data** — CSV export (FitNotes-compatible columns), **FitNotes CSV import** (move your
  history over), "storage is persistent" status, delete all data.
- [ ] **M10 Tools & polish** — 1RM calculator (% table), plate calculator (bar + available plates),
  warm-up calculator, keep screen on while logging (Wake Lock), favourite / recent exercises in the
  picker, per-exercise default sets, What's new.
- [ ] **M11 Languages** — Swedish UI (lazy language pack, as Iron Log), then others on request.
- [ ] **M12 Android app** — TWA with Bubblewrap (like Iron Log), after hosting is settled.

## Phase 2 — Training modes and effective reps (design: [TRAINING-MODES.md](TRAINING-MODES.md), to settle with the owner first)

- [ ] **M13 Muscle map** — Muscle groups per exercise (primary 1.0, secondary 0.5); starter library
  mapped; editable per exercise.
- [ ] **M14 Training modes & effort input** — Settings: Standard · Failure-HIT (Dorian Yates) · RIR-HIT
  (Lyle McDonald). Failure-HIT: warm-up/working sets, forced reps, negatives, rest-pause, drop sets.
  RIR-HIT: RIR chips per set, remembered per exercise.
- [ ] **M15 Effective reps per muscle group** — Effective reps per set (`min(reps, 5 − RIR)` + reps
  beyond failure), per muscle per session and week vs the mode's goal (Failure-HIT ~20, RIR-HIT
  20–40); chips on the day log, Muscles tab with weekly bars and history.
- [ ] **M16 HIT templates & progression** — Dorian-style 4-day split and Lyle-style routines as
  starting routines; warm-up weight suggestions (50 % / 75 %); double progression hints; "trained
  too soon" hint.
- [ ] **M17 Device sync** — Device-to-device sync like Iron Log (QR + direct encrypted WebRTC, no
  server, no account).
