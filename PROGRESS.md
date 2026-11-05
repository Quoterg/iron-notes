# Progress

## Next up

- **Merging:** the "Iron Notes milestone review" routine reviews every milestone PR; fix its Blockers and
  Should-fix items (CLAUDE.md step 0), and the reviewer merges. Never merge yourself.
- Live: https://iron-notes.pages.dev (Cloudflare Pages, deployed after CI on main; secrets set by the owner).
- Android 1.0.0 signed by the owner and on GitHub Releases (v1.0.0); assetlinks.json with the upload-key
  fingerprint deployed from `android/assetlinks` — then check the app opens full screen. Optional Play
  listing (add Play's app-signing fingerprint, `pnpm assetlinks`, deploy).
- Phase 3 order (owner 2026-11-05): M25 → M24 → M27 → M29 → M28 → M30 → M23 → M26, then M21 sync.
- Next: **M24 Plate badges & loadable targets**.
- Follow-ups: decimal comma in Swedish for displayed numbers (needs a display-only formatter: `num()` also
  writes CSV and input values); Swedish names for the starter library would need a stable key per
  exercise (programs match by name).
- Perf note: initial JS 20.6 KB; `db.ts` helpers used only by lazy screens could move to a lazy module.
- Local folder is still `~/Projects/train-log`; rename to `~/Projects/iron-notes` later.

## 2026-11-05 — Statistics: effective reps (owner's question)

- `periodMuscles` (lib/volume.ts): per muscle over the period (direct + half the secondary share), main
  sessions, total effective reps, weeks in the period ("All" starts at the first workout).
- Statistics: "Effective reps" tile (≈ in Standard mode) and an "Effective reps per muscle" card (bars,
  per-week average, main sessions; button to the Muscles screen). Same numbers as the day log and Muscles
  (`effectiveOf`, load types included).
- Checks: 214 unit tests, 33 e2e, initial JS 21.4 KB, Lighthouse passes.

## 2026-11-05 — M25 Load types

- `lib/load.ts`: load type per exercise (total · per hand · body weight + added load · assisted), real
  load (body weight ± from the latest Body weigh-in on or before the day; the first one for earlier days;
  body weight + load without one = the added load, assisted = unknown), volume weight (both dumbbells; the
  added load only; assisted 0), `withRealLoad` read-only copies (`weight` = real load, `vol`) for
  calculations — the stored sets never change. `lib/load-defaults.ts` (lazy): starter defaults.
- Owner's picks: dumbbell 1RM/records per hand, volume × 2; without a body weight the added load counts and
  the logging screen says so; starter exercises switch only where no load type is stored (one-time flag
  `loadsMapped`). Dips/Pull Up/Chin Up/Push Up become weight-and-reps (old sets read as + 0 kg).
- Uses: records (state), day-log volume, Statistics volume and 1RM, graphs/records tabs, effective-reps
  estimates (logging screen, day log, Muscles), feedback trend. History and set rows show what was typed:
  "15 kg/hand × 10", "BW + 20 kg × 8", "BW × 12", "BW − 25 kg × 8". Targets step the entered number.
- Editor: Load select (for weight types, and reps-only exercises → body weight/assisted adds the weight
  field). Backups validate `load`. Body entries reset the body-weight cache. Body-weight routines keep
  3 × 10 as their default plan.
- Records of body-weight exercises are re-ranked after the migration and rebuilt after any weigh-in.
- CSV (FitNotes format) has no load column: export writes the typed weight and import reads it as total,
  so per-hand and body-weight work round-trips as typed but with a total load type (backups keep it).
- Checks: 212 unit tests, 32 e2e (new load.spec), initial JS 21.4 KB (+0.8: load helpers the day log
  needs, set text, migration hook, body-weight cache), Lighthouse passes.

## 2026-11-05 — Gym QoL (PR #27)

- Exercise search also matches category and muscles (primary before secondary), in every loaded language
  (`allLabels`: English always, Swedish when its pack is loaded — no extra download); the folded index is
  built once per library/language change (`searchIndex`), a keystroke only matches (`searchIndexed`).
- "Last time" sets show their effort and copy into the form on a tap (Undo restores what was typed).
- Calculators get the set's reps too (1–15; longer sets keep the default 5).
- Statistics: "Most trained exercises" rows open the exercise (for today).

## 2026-11-05 — M11 Languages (Swedish)

- `src/lib/lang/sv.ts`: every string (first screen and later screens) and the exercise-type names in
  Swedish; a lazy chunk (7.2 KB gzip). `sv.test.ts`: same keys as English, same placeholders.
- `i18n.ts`: `lang` signal, `setLang` (loads the pack, sets `<html lang>`, remembers the last language as a
  startup hint), `detectLang` (sv, and Norwegian, → Swedish; else English), `locale()` → sv-SE for dates.
  `t()` reads the pack first, then English.
- Startup loads the hinted pack alongside the database, before the first render; `settings.lang` (Auto ·
  English · Svenska, validated in backups) wins. All 17 `toLocale…String(undefined…)` dates follow it.
- Exercise and category names are the user's data and stay as stored (starter library in gym English).
- Checks: 199 unit tests, 30 e2e (new language.spec), initial JS 20.6 KB, Lighthouse passes.

## 2026-10-29 — M12a Android project

- `android/twa-manifest.json` (package `io.github.quoterg.ironnotes`, host iron-notes.pages.dev, start `/`,
  Hologram colours, maskable icon, "Add exercise" shortcut, minSdk 24, key alias `ironnotes`) and the
  project generated by `bubblewrap update`; `./gradlew assembleRelease` builds an unsigned APK here.
  Keys and build outputs are git-ignored.
- `pnpm assetlinks` (scripts/assetlinks.mjs) writes `public/.well-known/assetlinks.json` from the
  manifest's fingerprints (refuses without one); Vite copies `.well-known` into dist (checked).
- docs/ANDROID.md: upload key, build, Digital Asset Links check, Play App Signing, store listing, data
  safety (no data collected or shared: no server, no analytics, no third-party requests).
- No app code changed: checks as M20.

## 2026-10-29 — M20 Programs

- `lib/programs.ts`: templates as data — Dorian 4-day split (Chest & biceps, Legs, Delts/traps/triceps,
  Back & rear delts; one all-out set per exercise) and Lyle's GBR (Lower/Upper; 3 × 6–8 main, 2 × 10–12
  secondary, 2 × 12–15 arms), both Mon/Tue/Thu/Fri. `buildProgram` matches the library by name, sets Lyle's
  rep ranges only on exercises without one, reports missing exercises; `isTrainingDay` by weekday.
- Programs sheet (Settings → Programs): start a template (confirm if a program exists) → routine folder,
  mode, program with its weekdays, and for Lyle a cycle unless one is running; "Your program": routine
  folder + training-day chips. The program select moved here from Settings.
- Day log: on a rest day of the schedule "Rest day in your program." with the next workout as a secondary
  button; the rotation continues after missed days (next after the last one logged).
- Checks: 195 unit tests, 28 e2e (new programs.spec), initial JS 20.3 KB, Lighthouse passes.

## 2026-10-29 — M19 Feedback & readiness

- `lib/feedback.ts`: sessions per exercise (best working-set e1RM per date; no warm-ups, lighter week,
  plans; readiness kept), trend (weaker = down twice; stalled = no new best in two; tolerance 0.5 %),
  cause of getting weaker in the design's order (gap > 10 days → inconsistent; cutting by setting or body
  weight falling ≥ 0.5 %/week; only this exercise; else real fatigue), body-weight weekly rate.
- Logging screen (Dorian/Lyle): "Recovered?" chips before a muscle's first set of the day (saved on that
  set as `sore`); still sore → Dorian: the program's next workout without those muscles ("Log … instead"),
  else train other muscles; Lyle: one set fewer. Joint-pain chip on the exercise (`joint`): no weight
  increase while flagged, "Swap: …" chips for exercises with the same main muscle (they start from their
  own history). Long gap (> 10 days): Dorian last weight, no rep target; Lyle a run-up week 2 session.
- `Feedback.tsx`: card when weaker or stalled (Lyle compares only push weeks): the cause and the mode's
  lever, with "Start a lighter week" / "Start a new cycle today" for real fatigue. Reads body weight and 4
  weeks of other exercises only when there is something to say.
- Settings: diet phase (Building · Maintaining · Cutting). `sore`, `joint`, `diet` validated in backups.
- Checks: 190 unit tests, 27 e2e (new feedback.spec), initial JS 20.2 KB, Lighthouse passes.

## 2026-10-29 — M18 Mesocycles

- `lib/cycle.ts`: phase of any day (Lyle run-up / push by cycle week; Dorian lighter week of 7 days),
  lighter-week sets and targets (90 % rounded down to the step, same reps to aim for), `progressing`
  (not planned, not `deload`), next program workout (after the last one logged from it, wrapping).
- Dorian lighter week (Settings): sets are saved with RIR 1 and `deload: true`; targets and routine days
  use the last normal session (never a lighter week's), so progression resumes where it was.
- Program (Settings, any mode): a routine folder whose workouts rotate; `logRoutineDay` records the last
  one; the day log's quiet lazy `DayPlan` shows the phase ("Week 2 of 6 (run-up)", "Lighter week") and, on
  an empty day, "Next: Push A (My workouts)".
- Calendar: a coloured line under days in the cycle (run-up / push / lighter week) and a legend.
- Lyle cycle length was already changeable mid-cycle (M17); its deload is the next cycle's run-up.
- Checks: 181 unit tests, 25 e2e (new cycles.spec), initial JS 20.2 KB, CSS 4.6 KB, Lighthouse passes.

## 2026-10-29 — M17 Lyle progression

- `lib/lyle.ts`: cycle week from the start date; rep range per exercise (top default 12, bottom top − 4);
  best weight for the range from working sets before the cycle; targets for the whole exercise: run-up
  weeks 1–2 at 82.5 % / 92.5 % of that best (rounded down to the step) × top, stop 2–3 / 1–2 short; push:
  last session's first working set at the top with RIR ≥ 1 → + one step, reps from the bottom; at the top
  with RIR 0 or unknown → hold; below the top → same weight, one more rep. No cycle → push rules.
- Settings (Lyle): "Cycle: Week n of N (run-up/push)", length 6/8 (changeable mid-cycle, start kept),
  "Start a new cycle today"; finished cycle → hint on the logging screen. `settings.cycle` in backups.
- Logging screen (Lyle): target line with week and reason, form prefilled for the first set. Routine days
  in Lyle mode: working sets at the target, warm-ups dropped.
- Exercise editor: bottom of rep range (`repBottom`, integer ≥ 1 in backups).
- Checks: 175 unit tests, 23 e2e (new lyle.spec), initial JS 20.1 KB, Lighthouse passes.

## 2026-10-29 — M15 Effective reps per muscle

- `lib/volume.ts`: goals per mode (Dorian 20, in range to 30; Lyle 20–40; Standard none), per-session
  muscle totals (direct, indirect at 0.5, main session ≥ half the goal), week starts by setting, per-week
  totals with main sessions.
- `effort.ts` (lazy): effective reps of any sets, estimates from each exercise's best e1RM over its cached
  history (warm-ups excluded) — same numbers as the logging screen.
- Day log: quiet lazy `DayMuscles` under the summary — `Chest 26/20` (status colour), `Triceps +8 extra`;
  tap → Muscles. Indirect-only muscles only on the Muscles screen.
- Muscles sheet (Settings → Training mode → Muscles, or the day chips): this week's bars per muscle with
  main sessions (weekday + reps, coloured vs goal), last 8 weeks as mini bars. One `setsBetween` read.
- Checks: 166 unit tests, 22 e2e (new volume.spec), initial JS 20.1 KB, CSS 4.4 KB, Lighthouse passes.

## 2026-10-29 — M16 Dorian progression

- `lib/targets.ts`: dynamic double progression per working set (n-th working set against last time's
  n-th; reps + 1 to beat until the top, then that set's weight + the exercise's step and no rep target;
  body-weight sets keep adding reps), warm-ups 50 % × 10 / 75 % × 6 rounded down to the step, too-soon
  check (main session — direct effective reps ≥ 10 — less than 5 days earlier; extra work ignored).
- Logging screen (Dorian HIT): "Set n target: 102.5 kg" / "80 kg × 11+" with the reason; the form is
  prefilled with the target and moves to the next set's target after each working set (reverse pyramids);
  warm-up chips until the first working set; "Working set" after warm-ups restores the target; hint card
  when a primary muscle had a main session in the last 4 days (one `setsBetween` read per screen).
- Routine/saved-workout days in Dorian HIT start from progressed sets; last time's warm-ups stay warm-ups.
- Exercise editor: "Top of rep range" (default 12; e.g. 15 for legs). Validated in backups.
- Checks: 160 unit tests, 21 e2e (new dorian.spec), initial JS 20.0 KB, Lighthouse passes.

## 2026-10-28 — M14 Modes & effort input

- Plan (PR #16): Phase 2 rewritten — goal "better than RP Hypertrophy"; Dorian HIT (dynamic double
  progression) and Lyle (GBR cycles, 6 weeks = 2 run-up + 4 push); load-based effective reps; feedback
  that finds the cause first. M5d folded into M16/M17.
- `lib/effective.ts`: effective reps per set (R = reps + RIR; R ≤ 8 every rep, 9 → last 6, ≥ 10 → last 5;
  reps after failure count fully), RIR estimated from the best e1RM (Standard mode, shown "≈"),
  per-muscle totals (secondary 0.5, direct vs indirect), main session ≥ half the goal.
- Settings → Training mode. Sets store their effort (`rir`, `after`, `warmup`), so switching modes never
  changes what old sets count. Dorian: Warm-up / Working set + "Reps after failure" (working sets RIR 0).
  Lyle: RIR chips 0–5+, remembered from the last set. Each set shows "n eff.", the day's total above.
- Checks: 151 unit tests, 20 e2e (new modes.spec), initial JS 19.9 KB, Lighthouse passes.

## 2026-10-28 — M5c Saved workouts

- Day tools → **Save as workout**: name + folder (the routines are the folders; "My workouts" is created
  when there are none). Stores the day's exercises in order with sets × reps (distance/time for those
  types) and supersets — no weights (owner's choice).
- **Add exercise** shows **Workouts** at the top (and in search results); one tap puts the whole workout
  on the day as planned sets. Weights come from the exercise's last workout **set by set** (set 1 from
  last time's set 1 …), so a reverse pyramid keeps its shape (`lastWorkoutSets`: two indexed reads).
- A workout's supersets become fresh groups each time it's logged (or join the exercise's superset of
  that day). Item groups validated in backups.
- Checks: 128 unit tests, 18 e2e (new: save → add from the picker), Lighthouse 100/100/100, initial JS 19.9 KB.

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
