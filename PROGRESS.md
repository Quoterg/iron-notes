# Progress

## Next up

- **Merging:** the "Iron Notes milestone review" routine reviews every milestone PR; fix its Blockers and
  Should-fix items (CLAUDE.md step 0), and the reviewer merges. Never merge yourself.
- Live: https://iron-notes.pages.dev (Cloudflare Pages, deployed after CI on main; secrets set by the owner).
- **Brainstorm** docs/TRAINING-MODES.md (questions at the end) before M13–M16.
- Next build milestone: **M11 Languages** (Swedish), or Phase 2 once the HIT questions are answered.
- Perf note: initial JS 19.9 KB; `db.ts` helpers used only by lazy screens could move to a lazy module.
- Deferred perf (PR #11 review): duplicate keys for a FitNotes import come from reading all sets; a key-only
  cursor pass and an indexOf-based CSV parser would help only past ~50k sets / multi-MB files.
- Local folder is still `~/Projects/train-log`; rename to `~/Projects/iron-notes` later.

## 2026-10-22 — M13 Muscle map

- 15 muscle groups (chest, front/side/rear delts, lats/upper back, traps, lower back, biceps, triceps,
  forearms, quads, hamstrings, glutes, calves, abs). Each exercise: primary (target) and secondary
  (helping) muscles. How much a secondary muscle counts is a Phase 2 decision (owner's question 2).
- Starter library mapped; existing installs get the same mapping once by exercise name (never over an
  exercise that already has muscles). Editor: tap a muscle to cycle none → primary → secondary.
  Exercise screen shows "Chest (+ Front delts, Triceps)". Validated in backups.
- Checks: 113 unit tests, 17 e2e, initial JS 20.0 KB.

## 2026-10-22 — M10b Picker & polish

- Picker: ★ on every exercise row; Favourites and Recent (last 8 exercises logged, one bounded reverse walk
  of the date index) at the top of the start view.
- What's new: `src/changelog.ts`; after an update the entries newer than the last one this device saw are
  shown once; a first install just records the latest (nothing was missed).
- Checks: 109 unit tests, 16 e2e (new: favourites/recent; what's new once after an update, never on a
  first install), initial JS 19.9 KB.

## 2026-10-22 — M10a Calculators

- Calculators (exercise screen → Calculators with the weight prefilled, or Settings): estimated 1RM with a
  % table for 1–12 reps (Epley/Brzycki setting); plates per side drawn as blocks, with what can't be loaded;
  warm-up sets (bar, ~40/60/80 %) rounded down to what the plates can load.
- Own bar and plate sizes per unit (Settings stores them with their unit; kg and lb defaults otherwise),
  validated in backups.
- Keep the screen on while an exercise is open (Wake Lock; setting; re-taken when the app returns).
- `lib/tools.ts` (tested); the Tools sheet is a lazy chunk.
- Checks: 107 unit tests, 14 e2e (new calculators flow), initial JS 19.2 KB.

## 2026-10-22 — M9 Data

- **FitNotes CSV import** (Settings → Your data): FitNotes' columns (Date, Exercise, Category, Weight,
  Weight Unit, Reps, Distance, Distance Unit, Time, Comment — taken from a FitNotes CSV parser, since
  FitNotes documents none) and the older "Weight (kgs)" header form; kgs/lbs, km/mi/m/ft/yd, h:mm:ss.
  Exercises/categories matched by name, new ones created with a type inferred from the columns used.
  A summary to confirm first; sets already stored are skipped (re-importing is safe); one transaction.
- **CSV export** in the same layout, in the user's units (round-trips with the importer, tested).
- Storage status ("persistent" or "may be cleared") with "Keep my data" (`navigator.storage.persist`).
- **Delete all data**: a backup downloads first; then a first start again (starter library, measures).
- Checks: 101 unit tests, 13 e2e (new: import, re-import, export, delete all), initial JS 19.1 KB.

## 2026-10-22 — M8 Analysis

- Statistics (Calendar → Statistics): week / month / 3 months / year / all / custom range. Totals
  (workouts, sets, reps, volume, time, distance), workouts per week (hand-written SVG bars, average),
  categories by sets or volume (bars in category colours), most trained exercises with the best
  estimated 1RM and its change from the period's first to last workout day.
- One index-range read of the period's sets; `lib/analysis.ts` summarises in one pass (tested), skipping
  planned sets and sets of deleted exercises.
- Bug fix: switching day showed the previous day's buttons until the new day loaded, so a quick tap could
  land on what replaced them (found by a screenshot script hitting "Copy a previous workout"). The log
  now shows nothing until the shown day's sets are loaded (`dayLoaded`).
- Checks: 94 unit tests, 12 e2e (new statistics flow), initial JS 18.9 KB, Lighthouse 100/100/100.

## 2026-10-22 — M7 Body tracker

- Body tab: body weight, body fat, waist, chest, arms, thighs, neck (seeded once; deleting them keeps
  them deleted) and the user's own measures (weight / percent / length / number). Each shows its latest
  value, the change since the entry before and its date.
- Measure screen: add a value for any date (decimal comma ok; the last entry of a date counts), graph
  with a 7-entry trailing trend for body weight (the chart gained an optional trend line), entries list
  (30 at a time) with delete, rename, delete the measure with its entries.
- Units follow the setting: kg/lb, cm/in (with lb), %.
- DB v4: `metrics` and `body` (index `metric`) stores; lazy `body-state.ts`; included in backups
  (optional, validated per row).
- Checks: 88 unit tests, 11 e2e (new body flow), initial JS 18.9 KB (+0.4: the Body tab label and lazy view).

## 2026-10-21 — M6b Lean start

- Later screens' strings are a lazy chunk (`lib/strings-later.ts`, 1.9 KB) loaded with any lazy screen
  (`lazy.tsx`); `i18n.test.ts` fails if first-paint code uses a string that isn't in the core table.
- Workout operations (copy, reorder, supersets, delete, routines) moved from `state.ts` to a lazy
  `workout.ts`; the log loads it on the first tap (it's also prefetched with the screens that use it).
- The day's tools bar is a quiet lazy part (`DayTools.tsx`; `lazyView(…, { quiet: true })` renders
  nothing until loaded).
- Initial JS 20.9 → 18.3 KB gzip. Lighthouse 100/100/100.

## 2026-10-21 — M6 Supersets

- Day tools → "Superset": pick exercises, "Make superset" pulls them together at the first one's place;
  grouped cards get a coloured edge and label; "Ungroup" (a group with one member left dissolves).
  Reorder moves a superset as one unit.
- Exercise screen: a rotation bar of the superset's exercises; Save goes on to the next exercise
  without a rest timer, the round's last one starts the timer and returns to the first.
- Data: optional `group` id on the sets (all sets of an exercise on that day); new sets inherit it;
  copies keep it; validated in backups. Pure helpers in `lib/groups.ts` (tested).
- Checks: 66 unit tests, 9 e2e (new superset flow). Initial JS 20.9 KB → M6b to slim it.

## 2026-10-21 — M5b Routines

- Routines tab: routines with days; each day lists exercises with a plan (sets × reps, optional
  weight/distance/time for all sets), reorder/remove exercises, rename/reorder/delete days.
- "Log to <day>": the day's exercises become **planned sets** (`done: false`) after anything already
  logged; open weights come from the exercise's last done set. Planned sets show greyed with a tick box,
  "Save" fills the next planned set (marks it done), and they're left out of records, history, graphs and
  "last time" until done.
- DB v3 `routines` store (loaded only when the Routines tab opens); routines included in backups
  (optional field: older backups still restore; validated per row).
- Checks: 59 unit tests, 8 e2e (new: routine build → log → fill), initial JS 19.3 KB.

## 2026-10-21 — M5a Workout tools

- Copy a previous workout (or chosen exercises) into the shown day: recent workout dates from one
  `prevunique` key cursor, their sets from one range read; copies get new ids and order, no comments.
- Reorder exercises in a day (↑ ↓): the day's sets get new order keys in the day's own key range,
  each exercise keeps its set order, so records don't change.
- Delete a whole workout (sets + comment, one transaction, set count in the confirm).
- Share a workout as text (`navigator.share`, else clipboard).
- Performance (open since the M1 review): DB v2 `records` store caches record-holding set ids per
  exercise; opening a day reads those instead of each exercise's whole history. Recomputed after every
  write, cleared by restores, deleted with the exercise; filled lazily for older installs.
- Checks: 54 unit tests (incl. a v1 → v2 upgrade test), 7 e2e, initial JS 18.5 KB.

## 2026-10-21 — M4 Calendar

- Calendar tab: month grid (Monday or Sunday first — new setting), up to 4 category-coloured dots per
  day, today outlined, tap a day to open it in the log, ‹ › months, "This month", workouts count.
  One IndexedDB index-range read per month (`setsBetween`); lazy chunk 1.3 KB.
- PR #3 review nits: whole-second steps for time/pace axes (`TIME_STEPS`), Set for drawn dots,
  indentation. Toasts moved above the rest timer (they covered titles).
- Checks: 49 unit tests, 6 e2e (new calendar test), initial JS 17.4 KB.

## 2026-10-21 — M3 Exercise history, graphs & records

- Exercise screen tabs Track · History · Graph · Records (segmented control, Iron Log style).
- History: workouts newest first (20 at a time), trophies and comments, tap a day to open it.
- Graph: 10 measures by type (est. 1RM, max weight/reps, workout volume/reps, max/total distance and
  time, best pace) × 1 m / 3 m / 6 m / 1 y / all; hand-written SVG like Iron Log's LineChart
  (≤ 120 dots drawn, nearest-point readout on touch/keyboard, table view).
- Records: best estimated 1RM (Epley/Brzycki — new setting), rep maxes 1–15, best values per field
  incl. fastest pace.
- `src/lib/progress.ts`: single-pass functions over the cached, sorted history; 11 unit tests.
- Bug fix (from M1): the late "start from last time" prefill overwrote what the user had already typed
  when the history loaded slowly — it now fills only empty fields (`fillEmpty`, tested). Found via
  screenshots: 90 × 5 was saved as 80 × 5.
- Checks: 44 unit tests, 5 e2e (new: history/graph/records), Lighthouse 100/100/100, initial JS
  17.2 KB (new strings; tab code is in the lazy exercise chunk, 6.3 KB).
- Still open (perf, from the M1 review): persist per-exercise rep maxes so a heavy day doesn't read
  every exercise's full history on open.

## 2026-10-21 — M2 CI & hosting

- Repo `Quoterg/iron-notes` (private; creating a public repo was blocked by the permission check —
  the owner can switch: `gh repo edit Quoterg/iron-notes --visibility public --accept-visibility-change-consequences`).
- CI (`.github/workflows/ci.yml`) green on PR #1. Deploy workflow for Cloudflare Pages after CI on main.
- `_headers` generated from `src/csp.ts` at build (tested): CSP as a real header with `frame-ancestors 'none'`.
- Research + design draft for the HIT modes: docs/TRAINING-MODES.md.

## 2026-10-21 — M1 Foundation

Done (see ROADMAP M1 for the feature list).

Checks (all passing locally):
- `pnpm test`: 25 unit tests (records/rep-max rule, 1RM, dates, units, IndexedDB, backup, CSP hash).
- `pnpm build`: initial JS 16.6 KB gzip (budget 30), CSS 2.9 KB (budget 8).
- `pnpm e2e`: 4 tests on emulated Moto G4 with 4× CPU throttle (log + records + edit + reload +
  offline; new exercise of another type + search; theme + units; no CSP violations).
- `pnpm lighthouse`: performance 100, accessibility 100, best practices 100 (3 runs).

Review fixes (PR #1): seed the starter library only once (`kv.seeded`); per-row backup validation
before anything is written (version, ids, ISO dates, numbers, known types/units) with tests; set count
in the delete confirm; the current data is downloaded before a restore; the exercise history cache is
updated in place after a save (no re-read/re-sort); backup code moved out of the first-paint bundle.
Deferred performance items (for M3): persist per-exercise rep maxes so opening a heavy day doesn't
read every exercise's full history; `Log` re-renders all groups on any signal change.

Notes:
- Stack, CSS tokens, service worker, nav stack, lazy screens and CSP setup are taken from Iron Log
  so both apps look and behave alike.
- Records: a set holds a record when it is the first set with the heaviest weight for its rep count
  and no set with more reps was at least as heavy (so 110×5 removes the trophy from 110×4 and 100×5).
- CI workflow is in `.github/workflows/ci.yml` but there is no GitHub repo yet.
