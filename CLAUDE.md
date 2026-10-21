# Iron Notes — notes for AI coding sessions

Open-source, local-first training log: FitNotes' features in Iron Log's design, then
evidence-based extras (effective reps per muscle group). Must stay fast on old low/mid-range phones.
Sister project: Iron Log (`Quoterg/iron-log`) — same stack, look and conventions; when in doubt, do
what Iron Log does.

## Session protocol

1. Read `PROGRESS.md` (top, "Next up") and the next unchecked milestone in `docs/ROADMAP.md`.
2. Branch `milestone/mN-short-name`. Do **one milestone**; split it in ROADMAP.md if it's too big.
3. Commit after each working step (a session may stop at any time — the owner wants work resumed
   from where it stopped, so never leave large uncommitted changes).
4. Before finishing, all must pass: `pnpm test`, `pnpm build` (size budget), `pnpm e2e`, `pnpm lighthouse`.
5. Update `PROGRESS.md` (entry at top + "Next up"), tick the milestone in ROADMAP.md.
6. Never push to `main`, never force-push, never merge.

## Commands

```sh
corepack pnpm@9.15.0 install   # or `corepack enable` once, then plain pnpm
pnpm dev                       # dev server
pnpm test                      # Vitest (src/**/*.test.ts)
pnpm build                     # typecheck + build + size budget (scripts/check-size.mjs)
pnpm e2e                       # Playwright, emulated Moto G4, 4× CPU throttle (needs a build)
pnpm lighthouse                # Lighthouse CI on dist/; locally:
                               # CHROME_PATH=~/.cache/ms-playwright/chromium-1193/chrome-linux/chrome
pnpm icons                     # public/icon.svg → PNG icons
```

## Rules

- **Performance budget is a hard gate**: initial JS ≤ 30 KB gzip, CSS ≤ 8 KB. No UI/component
  libraries, chart libraries, icon fonts, CSS-in-JS, date libraries. Every screen except the day log
  is a lazy chunk (`lazyView` in src/app.tsx), prefetched when idle.
- User data stays on device (IndexedDB, `src/lib/db.ts`); weights in kg, distances in km, time in
  seconds — convert only for display (`src/lib/units.ts`). No analytics, no third-party requests.
- All UI strings go through `t()` in `src/lib/i18n.ts`.
- Pure logic (records, 1RM, future effective reps) lives in `src/lib/*.ts` with unit tests.
- Keep the CSP strict (`src/csp.ts`): no inline scripts except the hashed theme boot; never build
  `style="…"` strings (Preact `style={{}}` is fine).
- Don't host on GitHub Pages under the Quoterg account (shares Iron Log's origin and its data).
