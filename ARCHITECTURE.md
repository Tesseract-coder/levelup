# LevelUp — Architecture

LevelUp is a **local-first, static PWA**. There is no backend and no AI: every calculation runs in the browser and all user data lives in IndexedDB on the device. The whole app works offline.

```
┌──────────────────────────── Browser (PWA) ─────────────────────────────┐
│ React screens ─▶ hooks/data.ts (TanStack Query) ─▶ Repository ─▶ Dexie/IndexedDB
│      │
│      └─▶ domain/*  (pure TS, unit-tested)
│            targets · habits & streaks · stats & score · rule summaries
│            suggestions · food DB + food/activity parsers · safety checks
└────────────────────────────────────────────────────────────────────────┘
                 Service worker: precaches the app shell for offline use
```

## Folders

| Path | What lives there |
|---|---|
| `src/db/` | Data model (`types.ts`), Dexie schema + versioned migrations (`dexie.ts`), the **`Repository` interface** and its Dexie implementation |
| `src/domain/` | Pure logic: dates & day boundary, Mifflin-St Jeor targets, activity presets & MET calorie burn, habit completion & **streaks with grace**, nutrition totals, the **stats engine & consistency score**, rule-based summaries, suggestions, the food DB and parsers, safety checks |
| `src/features/` | Screens and sheets, one folder per area |
| `src/components/` | Design-system primitives: bottom sheet (+ back-button history sync), buttons, steppers, rings, snackbar, bottom nav |
| `src/lib/` | Query client, export/import, haptics, PWA registration |
| `public/reminders-sw.js` | Reminder logic imported into the generated service worker |

## Data flow

* **Reads**: screens call hooks in `hooks/data.ts`, which wrap `repo.*` in TanStack Query (`networkMode: 'always'` so they run offline; `staleTime: Infinity` because data only changes through our own writes).
* **Writes**: feature actions call `repo.*` then `refresh()` (invalidate all queries). Deletes go through `removeWithUndo`, which keeps the record for the undo snackbar.
* **Repository boundary**: screens don't touch Dexie directly (apart from two read-by-id lookups). A cloud-synced implementation can replace `DexieRepository` in `src/db/index.ts` without changing screens.
* **Dates**: stored as local `YYYY-MM-DD` keys computed with the user's *day boundary* (`dayKeyFor(now, boundaryHour)`), plus `createdAt` timestamps. Never `toISOString()` (UTC) for day keys.
* **Schema versioning**: Dexie `version(n)` with `upgrade()` steps (v2 dropped the old AI parse cache). Exports carry `format`, `version` and `schemaVersion`; import refuses newer exports.

## Logging without AI

* **Food** (`domain/localFoodParser.ts` + `domain/foodDb.ts`): splits text by meal labels and separators, parses quantities (numbers, fractions, words like "half", "a couple"), units (katori, glass, tbsp, slice, plate, g, ml…) and size words, and matches the longest food alias in the database. Grams are derived from the quantity times food-specific unit weights, and macros are scaled from per-100 g values. Confidence reflects how exact the match and unit were. Low-confidence or unmatched items are flagged on the review screen; nothing is saved without the user confirming.
* **Activity notes** (`domain/localActivityParser.ts`): splits a sentence into phrases, extracts durations, distances, water volumes, steps and weight, and matches phrases to the user's own activities via preset keywords and activity names.

## Coaching: stats → rules

1. `domain/stats.ts` computes everything deterministically: daily series, averages, adherence, streaks (with grace), sleep consistency, weight trend, mood/sleep correlation, and the **consistency score** with a transparent breakdown (weights: nutrition 30, activity 25, habits 30, sleep 15; components without data are excluded and the weights renormalised).
2. `domain/rulesSummary.ts` turns those stats into **stat lines** ("facts") and goal-aware, prioritised wins, misses, improvements and a next focus, which can be a one-tap habit. Copy is supportive and never shaming. The stat lines are shown under each summary as *the numbers behind this summary*, and a unit test checks that every number in the summary text appears in them.
3. `domain/suggestions.ts` adds conservative goal-based suggestions: ±100 kcal at most and never below the safety floor, workout ideas for the goal, habit ideas from patterns such as late bedtimes, and protein-dense meal ideas from the food DB filtered by diet preference and avoid list.

## PWA

`vite-plugin-pwa` (generateSW) precaches the app shell, all route chunks, icons and the Latin font subsets, so every screen loads offline; `navigateFallback` serves `index.html` for deep links. The manifest includes maskable icons, standalone display and three shortcuts (`/?quick=food|workout|water`). Updates use a “new version ready — Reload” snackbar.

Reminders: an in-app ticker while the app is open, plus Periodic Background Sync for installed Chromium PWAs (the SW reads the mirrored reminder config from a tiny IndexedDB store).

## Safety

Calorie floors (1,200 / 1,500 / 1,350 kcal), capped deficits (≤ 500 kcal) and surpluses (≤ 300 kcal), gentle cautions for aggressive targets or pace, ±100 kcal maximum automatic suggestion, a non-diagnostic support message after repeated very-low-intake days, and a disclaimer at onboarding and in Profile.
