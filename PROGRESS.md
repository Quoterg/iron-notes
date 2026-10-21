# Progress

## Next up

- **Owner decisions needed** before M2: where to host (not GitHub Pages on Quoterg — see ROADMAP M2),
  and creating the GitHub repo (`Quoterg/iron-notes`?) for CI and PRs.
- Then **M3 Exercise history, graphs & records** (doesn't depend on hosting).
- Local folder is still `~/Projects/train-log`; rename to `~/Projects/iron-notes` (see README).

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
