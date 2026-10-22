# Progress

## Next up

- **Merging:** the "Iron Notes milestone review" routine reviews every milestone PR; fix its Blockers and
  Should-fix items (CLAUDE.md step 0), and the reviewer merges. Never merge yourself.
- Live: https://iron-notes.pages.dev (Cloudflare Pages, deployed after CI on main; secrets set by the owner).
- **Brainstorm** docs/TRAINING-MODES.md (questions at the end) before M13–M16.
- Next build milestone: **M6 Supersets / groups**.
- Perf follow-up: initial JS is 19.3 KB, mostly UI strings; split later screens' strings into a lazy
  chunk like Iron Log's `strings-later` before it nears the 30 KB budget.
- Local folder is still `~/Projects/train-log`; rename to `~/Projects/iron-notes` later.

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
