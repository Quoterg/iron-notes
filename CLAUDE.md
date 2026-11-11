# Iron Notes — notes for AI coding sessions

Open-source, local-first training log: FitNotes' features in Iron Log's design, then
evidence-based extras (effective reps per muscle group). Must stay fast on old low/mid-range phones.
Sister project: Iron Log (`Quoterg/iron-log`) — same stack, look and conventions; when in doubt, do
what Iron Log does.

## Session protocol

0. **Review fixes first.** Open `milestone/*` PRs get reviewed by the "Iron Notes milestone review"
   routine (fires on PR opened / new commits). Read its reviews/comments by `Quoterg` that start with
   `**Verdict:` (`gh api repos/Quoterg/iron-notes/pulls/<n>/reviews` and `.../issues/<n>/comments`).
   Fix every **Blocker** and **Should fix** on that PR's branch (with tests), commit
   `Review fixes: <PR title>`, push, and reply on the PR with one line per item: `n. fixed in <sha>`
   or `n. not fixed: <reason>`. Cheap performance items too; list the rest in PROGRESS.md. **The
   reviewer merges** (after re-checking and green CI) — never merge yourself. To ask for a (re-)check
   without code changes, push an empty commit `review: request`.
1. Read `PROGRESS.md` (top, "Next up") and the next unchecked milestone in `docs/ROADMAP.md`.
2. Branch `milestone/mN-short-name`. Do **one milestone**; split it in ROADMAP.md if it's too big.
   If the previous milestone's PR is still open, branch from it and open the new PR with **base =
   that milestone branch** (the reviewer only merges PRs based on `main`, so it can't merge early).
   After the base PR merges: `git merge origin/main`, push, then retarget
   (`gh api -X PATCH repos/Quoterg/iron-notes/pulls/<n> -f base=main`) and push `review: request`.
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
pnpm assetlinks                # android/twa-manifest.json fingerprints → public/.well-known/assetlinks.json
                               # Android build guide: docs/ANDROID.md (the owner signs; keys never committed)
cargo test --manifest-path native/core-rs/Cargo.toml --locked   # native: Rust core + golden fixtures
cd native && ./gradlew :app:assembleDebug [-PrustAbis=x86_64]  # native app (Phase 4); needs JDK 17, SDK,
                               # Rust + Android targets, cargo-ndk 4.1.2, NDK r28c — setup in docs/NATIVE.md
```

## Rules

- **Performance budget is a hard gate**: initial JS ≤ 30 KB gzip, CSS ≤ 8 KB. No UI/component
  libraries, chart libraries, icon fonts, CSS-in-JS, date libraries. Every screen except the day log
  is a lazy chunk (`lazyView` in src/app.tsx), prefetched when idle.
- User data stays on device (IndexedDB, `src/lib/db.ts`); weights in kg, distances in km, time in
  seconds — convert only for display (`src/lib/units.ts`). No analytics, no third-party requests.
- All UI strings go through `t()` in `src/lib/i18n.ts`; every new key also goes into the Swedish pack
  `src/lib/lang/sv.ts` (a test fails otherwise).
- Pure logic (records, 1RM, future effective reps) lives in `src/lib/*.ts` with unit tests.
- Keep the CSP strict (`src/csp.ts`): no inline scripts except the hashed theme boot; never build
  `style="…"` strings (Preact `style={{}}` is fine).
- Don't host on GitHub Pages under the Quoterg account (shares Iron Log's origin and its data).
