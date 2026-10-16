# LevelUp

A mobile-first, local-first PWA that tracks **workouts, habits, sleep and food** in one place, and answers one question every day: *did I do what I said I'd do, and is it moving me toward my goal?*

- **Frictionless logging** — type (or say) a whole day of food in one line; one tap to check off a habit; describe your day in a sentence.
- **Honest, calm feedback** — daily and weekly summaries with a transparent consistency score, wins, misses and small next steps. Grace days instead of streak anxiety.
- **Private by default** — all data stays in your browser (IndexedDB). Works offline. Export/import any time. No trackers, no paywalls.

> LevelUp provides general guidance, not medical advice. Calorie and macro values are estimates.

## Quick start

Requirements: **Node 20.19+** (or 22.12+), npm.

```bash
npm install
cp .env.example .env          # optional — add ANTHROPIC_API_KEY to enable AI
npm run dev                   # web on http://localhost:5173 + AI proxy on :8787
```

Open on your phone: `npm run dev` binds to your LAN, so visit `http://<your-computer-ip>:5173`. (Service workers and install need HTTPS or `localhost`; for full PWA testing on a phone use the production build behind HTTPS — see Deploy.)

**Demo data:** open `http://localhost:5173/?demo=1` (or Profile → Your data → *Load demo data*) to replace everything with ~60 days of realistic data, which lets you preview Insights and summaries instantly.

Without an API key everything still works: food is estimated from the built-in database (≈160 Indian and international foods with household units such as katori, roti, glass, tbsp), activity notes use a rules parser, and summaries are rule-based. The UI tells you when you're seeing an offline estimate.

## Environment variables

Set these for the **server only**; they are never sent to the browser.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API key. Leave empty to run fully offline/rule-based. |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model used for food/activity parsing, summary phrasing and meal ideas. |
| `PORT` | `8787` | AI proxy port (Vite proxies `/api` to it in dev). |
| `RATE_LIMIT_PER_MIN` | `30` | Requests per minute per IP for `/api/*`. |
| `CORS_ORIGIN` | — | Comma-separated origins allowed to call the API cross-origin (only needed if the PWA and API live on different origins). |

`.env` is git-ignored. Never commit a key.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server + AI proxy with reload |
| `npm run build` | Type-check and build the PWA into `dist/` |
| `npm start` | Production server: serves `dist/` **and** `/api/*` from one origin (brotli/gzip, immutable caching for hashed assets) |
| `npm test` | Unit tests (Vitest): targets, streaks, score, stats engine, food/activity parsers, AI-output validation, server endpoints |
| `npm run e2e` | Playwright at 390×844: onboarding, food logging, habit check-off, summaries, charts at 360/390/430 px, axe accessibility scans (light + dark) |
| `npm run check` | Everything above in order |
| `npm run icons` | Regenerate PWA icons (needs Python + Pillow) |

First-time e2e setup: `npx playwright install chromium`.

## Deploying as a PWA

LevelUp is one small Node process:

```bash
npm ci
npm run build
ANTHROPIC_API_KEY=… npm start     # listens on $PORT (default 8787)
```

Put it behind HTTPS (any reverse proxy, Fly.io, Render, Railway, a VM with Caddy, etc.). Restart the server after each build so it serves the new hashed assets. Once served over HTTPS:

- Android/Chrome offers **Install app**; iOS Safari: Share → *Add to Home Screen*.
- The service worker precaches the whole app, so every screen opens offline. Updates show a *“new version ready — Reload”* prompt.
- Home-screen shortcuts: **Log food**, **Log workout**, **Log water**.

You can also host `dist/` on any static host/CDN and run the API separately. Set `CORS_ORIGIN` to the PWA's origin and route `/api/*` to the server (or same-origin proxy it).

### Reminders

Reminders are local notifications. Browsers can't schedule arbitrary future notifications without a push server, so LevelUp fires them while the app is open (including background tabs) and, for **installed** Chromium PWAs, via Periodic Background Sync (the browser decides how often it runs). Push-based reminders would need a push service and are a natural next step.

## How the AI endpoints work

All AI calls go through the server (`server/`) so the key never reaches the client. Every endpoint validates its request with Zod, uses **structured outputs** (the model must return JSON matching a schema), retries once on malformed or invalid output, and is rate-limited and size-limited (16 KB). Identical requests are cached on the server and, for food parsing, in IndexedDB on the device.

| Endpoint | Input (minimum needed) | Output |
|---|---|---|
| `POST /api/parse-food` | `{ text, diet?, defaultMeal? }` | per-item `meal, name, quantity, unit, grams_estimate, calories, protein_g, carbs_g, fat_g, fiber_g, confidence, assumptions` → sanitised (values clamped, calories reconciled with macros) |
| `POST /api/parse-activity` | `{ text, activities: [{id, name, kind, unit}] }` | structured entries matched to your activity ids |
| `POST /api/summary` | `{ kind, goal, facts: [{id, text}], candidates }` — precomputed stats only | `wins / misses / improvements / next_focus`, each citing fact ids |
| `POST /api/suggest` | `{ goal, diet, avoid, proteinGapG, caloriesLeft }` | 3 meal ideas |
| `GET /api/health` | — | `{ ai: boolean }` |

**Numbers are never invented.** The browser computes all stats deterministically and sends them as *facts*. Every number in the AI's summary must appear verbatim in those facts. The server and then the browser both check this (plus tone), and any failure falls back to the rule-based summary. See [ARCHITECTURE.md](ARCHITECTURE.md).

No personal identifiers are sent. There's no name, email, body stats or history, only the food text you typed, your activity names, or pre-computed summary numbers. The in-app privacy note (Profile → AI & privacy) explains this to users.

## Project structure

```
src/
  db/          data model, Dexie schema + migrations, Repository interface (swap for cloud sync later)
  domain/      pure logic: targets, habits & streaks, stats & score, rule summaries, suggestions, food DB, parsers
  features/    screens & sheets (onboarding, today, log, food, habits, workouts, insights, summary, goals, profile)
  components/  UI primitives (sheet, buttons, steppers, rings, nav, snackbar)
  lib/         AI client, export/import, query client, PWA, haptics
  dev/seed.ts  demo data generator
shared/        AI contract: sanitize.ts (browser + server), schemas.ts (zod, server)
server/        Fastify AI proxy
tests/unit/    Vitest
e2e/           Playwright
```

## Notes & decisions

- **Stack** as specified, with two deliberate deviations:
  - CSS transitions instead of Framer Motion. Every animation is 150–250 ms and needs no library, which saves ~40 KB for low-end Android.
  - Self-hosted font (Plus Jakarta Sans via Fontsource) instead of Google Fonts, so the app works offline.
- **Model:** defaults to `claude-opus-5-5`. It doesn't accept `temperature`, so parsing uses `effort: "low"` for the same literal, fast behaviour. A cheaper model can be set via `ANTHROPIC_MODEL`.
- **Health Connect / Apple Health** import is a documented future integration (needs a native wrapper or companion app); steps are entered manually today.
- **Not in v1, by design:** photo logging, barcode scanning, cloud sync, sharing, coach chat. The `Repository` interface is the seam for sync.

Measured on the production build (Lighthouse 13, mobile, simulated slow 4G): Performance 94, Accessibility 100, Best Practices 100; first-load JS ≈ 175 KB gzipped, Insights charts lazy-loaded.
