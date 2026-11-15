# Iron Notes

Open-source, local-first training log for strength and cardio. Log sets in seconds, see personal
records, rest between sets with a timer — offline, with no account, fast on old phones.
Same design as its sister app [Iron Log](https://github.com/Quoterg/iron-log).

**Try it: https://iron-notes.pages.dev/** — or install it:

- **iPhone:** open the link in Safari → Share → *Add to Home Screen*.
- **Android:** download the **Android app (APK)** from the [releases page](https://github.com/Quoterg/iron-notes/releases)
  (v2.0.0; pick `arm64-v8a` for most phones), or open the link in Chrome → ⋮ → *Install app*.
- **Desktop:** just open the link.

Your data stays on the device. On iPhone it lives in Safari's storage for the Home Screen app, so
export a backup now and then (Settings → Export backup).

Status: the web app and the native Android app (2.0.0) are both released; see [the roadmap](docs/ROADMAP.md).

## Features (M1)

- Training log per day; swipe or ‹ › between days
- Exercise library with categories, search, your own exercises and categories
- 10 exercise types: weight/reps/distance/time and their combinations
- Fast set entry with +/− steppers; edit or delete any set; set and workout comments
- Personal-record trophies and "new record" alerts
- Last workout's sets shown while logging
- Rest timer with sound and vibration
- kg/lb, km/mi/m, Auto/Day/Night theme
- JSON backup and restore; works offline (installable PWA)

## Development

```sh
corepack pnpm@9.15.0 install
pnpm dev
pnpm test && pnpm build && pnpm e2e
```

See [CLAUDE.md](CLAUDE.md) for project rules and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

License: AGPL-3.0-or-later.
