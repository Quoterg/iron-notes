# Architecture

Same shape as Iron Log, smaller.

- **UI**: Preact + `@preact/signals`. `src/app.tsx` is the shell (date header, tabs, sheet stack);
  `src/components/Log.tsx` (the day) is the only screen in the first-paint bundle. Every other
  screen is a lazy chunk (`src/lazy.tsx`) prefetched one at a time when idle (`src/main.tsx`).
- **Navigation**: full-screen sheets in a stack mirrored in browser history (`src/nav.ts`), so the
  Android back button closes the top sheet.
- **State**: `src/state.ts` — settings, library, the shown day's sets, records per exercise; all
  writes go through it so the log, records and open screens stay in step.
- **Storage**: IndexedDB via `idb` (`src/lib/db.ts`): `categories`, `exercises`, `sets` (indexes
  `date`, `exercise`), `comments` (by date), `kv` (settings). Only the shown day and the exercises
  on screen are read — start-up cost doesn't grow with history.
- **Logic**: `src/lib/calc.ts` (records, 1RM, dates), `src/lib/units.ts` (display units). Pure, tested.
- **Offline**: `public/sw.js` (Iron Log's worker): the app page cache-first, new versions only once
  all their assets are cached, "restart to update" bar.
- **Security**: CSP meta tag from `src/csp.ts` (script-src self + one hash for the theme boot).

## Performance budget

Initial JS ≤ 30 KB gzip, CSS ≤ 8 KB gzip (`scripts/check-size.mjs`, part of `pnpm build`).
Lighthouse (mobile, simulated slow 4G): performance ≥ 90, FCP ≤ 1.8 s, LCP ≤ 2.5 s, TBT ≤ 200 ms,
CLS ≤ 0.1. Browser tests run on an emulated Moto G4 with a 4× CPU slowdown.
