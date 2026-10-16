# LevelUp

A mobile-first, local-first PWA that tracks **workouts, habits, sleep and food** in one place, and answers one question every day: *did I do what I said I'd do, and is it moving me toward my goal?*

- **Frictionless logging** — type (or say) a whole day of food in one line; one tap to check off a habit; describe your day in a sentence.
- **Honest, calm feedback** — daily and weekly summaries with a transparent consistency score, wins, misses and small next steps. Grace days instead of streak anxiety.
- **Completely private** — no server, no accounts, no AI, no trackers. Everything is calculated and stored on your device (IndexedDB) and works offline. Export/import any time.

> LevelUp provides general guidance, not medical advice. Calorie and macro values are estimates.

## Quick start

Requirements: **Node 20.19+** (or 22.12+), npm.

```bash
npm install
npm run dev        # http://localhost:5173
```

To open it on your phone during development, `npm run dev` listens on your LAN, so visit `http://<your-computer-ip>:5173`. Install and offline mode need HTTPS (or `localhost`), so for full PWA testing on a phone, deploy the build (see below).

**Demo data:** open `http://localhost:5173/?demo=1` (or Profile → Your data → *Load demo data*) to replace everything with ~60 days of realistic data, which lets you preview Insights and summaries instantly.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and build the PWA into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests (Vitest): targets, streaks, score, stats engine, summaries, food & activity parsers |
| `npm run e2e` | Playwright at 390×844: onboarding, food logging, habit check-off, summaries, charts at 360/390/430 px, axe accessibility scans (light + dark) |
| `npm run check` | Everything above in order |
| `npm run icons` | Regenerate PWA icons (needs Python + Pillow) |

First-time e2e setup: `npx playwright install chromium`.

## Deploying

`npm run build` produces a fully static site in `dist/`. Host it anywhere that serves static files over HTTPS, such as GitHub Pages, Netlify, Vercel, Cloudflare Pages or any web server. Two things to configure:

- **SPA fallback:** unknown paths should serve `index.html` (Netlify/Vercel/Cloudflare do this with a one-line rewrite; on GitHub Pages copy `index.html` to `404.html`).
- **Caching:** files in `dist/assets/` are content-hashed and can be cached forever; `index.html` and `sw.js` should be `no-cache`.

Once served over HTTPS:
- Android/Chrome offers **Install app**; on iOS Safari use Share → *Add to Home Screen*.
- The service worker precaches the whole app, so every screen opens offline. Updates show a *“new version ready — Reload”* prompt.
- Home-screen shortcuts: **Log food**, **Log workout**, **Log water**.

### Reminders

Reminders are local notifications. Without a push server, browsers can't schedule notifications for an arbitrary future time. LevelUp fires them while the app is open (including background tabs) and, for **installed** Chromium PWAs, via Periodic Background Sync (the browser decides how often it runs).

## How food & activity logging works (no AI)

- **Food:** `src/domain/localFoodParser.ts` splits your text into meals ("Breakfast: …") and items, reads quantities and household units (2 rotis, 1 katori, ½ plate, 200 g, a handful), and matches each item against a built-in database of ~160 Indian and international foods (`src/domain/foodDb.ts`, per-100 g values from IFCT / USDA ballpark figures). You review and edit every item before saving. Unknown foods are flagged for you to enter by hand, or you can swap them for a similar item. Saved meals and "My foods" make repeats one tap.
- **Activity notes:** `src/domain/localActivityParser.ts` turns "cycled 40 min, learned React for 1 hour, slept 6.5 hrs, drank 2 L water" into entries matched to your own activities, also reviewed before saving.
- **Summaries & suggestions:** computed deterministically from your logs (`src/domain/stats.ts`, `rulesSummary.ts`, `suggestions.ts`). Every summary shows *the numbers behind it*, and a unit test checks that every number in the text appears in those stats.

To improve recognition, add foods to `FOODS` in `src/domain/foodDb.ts`: give each one a name, aliases, per-100 g macros and household units.

## Project structure

```
src/
  db/          data model, Dexie schema + migrations, Repository interface (swap for cloud sync later)
  domain/      pure logic: targets, habits & streaks, stats & score, rule summaries, suggestions, food DB, parsers
  features/    screens & sheets (onboarding, today, log, food, habits, workouts, insights, summary, goals, profile)
  components/  UI primitives (sheet, buttons, steppers, rings, nav, snackbar)
  lib/         export/import, query client, PWA, haptics
  dev/seed.ts  demo data generator
tests/unit/    Vitest
e2e/           Playwright
```

## Notes & decisions

- **Stack** as specified, with two deliberate deviations:
  - CSS transitions instead of Framer Motion. Every animation is 150–250 ms and needs no library, which saves ~40 KB for low-end Android.
  - Self-hosted font (Plus Jakarta Sans via Fontsource) so the app works offline.
- **No AI and no backend**, by choice. All parsing, coaching and suggestions are rule-based and run on the device. An AI-assisted version (Claude-powered parsing and summary phrasing) exists in this repo's first commit (`ed51363`) if you ever want to revisit it.
- **Health Connect / Apple Health** import is a documented future integration (needs a native wrapper); steps are entered manually today.
- **Not in v1:** photo logging, barcode scanning, cloud sync, sharing. The `Repository` interface is the seam for sync.
