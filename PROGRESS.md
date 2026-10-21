# Progress

## Next up

- **Merging:** owner's rule — wait for a reviewer before any merge. Iron Notes has no reviewer routine
  yet (Iron Log's only watches iron-log); owner to decide how reviews happen. Never merge yourself.
- **Owner action for deploys:** Cloudflare API token (Account → Cloudflare Pages → Edit) and account id
  as repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- **Brainstorm** docs/TRAINING-MODES.md (questions at the end) before M13–M16.
- Next build milestone: **M3 Exercise history, graphs & records**.
- Local folder is still `~/Projects/train-log`; rename to `~/Projects/iron-notes` later.

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

Notes:
- Stack, CSS tokens, service worker, nav stack, lazy screens and CSP setup are taken from Iron Log
  so both apps look and behave alike.
- Records: a set holds a record when it is the first set with the heaviest weight for its rep count
  and no set with more reps was at least as heavy (so 110×5 removes the trophy from 110×4 and 100×5).
- CI workflow is in `.github/workflows/ci.yml` but there is no GitHub repo yet.
