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
* **Schema versioning**: Dexie `version(n)` with `upgrade()` steps (v2 dropped the old AI parse cache; v3 added strength training and converted legacy strength logs). Exports carry `format`, `version` and `schemaVersion`; import refuses newer exports.

## Logging without AI

* **Food** (`domain/localFoodParser.ts` + `domain/foodDb.ts`): splits text by meal labels and separators, parses quantities (numbers, fractions, words like "half", "a couple"), units (katori, glass, tbsp, slice, plate, g, ml…) and size words, and matches the longest food alias in the database. Grams are derived from the quantity times food-specific unit weights, and macros are scaled from per-100 g values. Confidence reflects how exact the match and unit were. Low-confidence or unmatched items are flagged on the review screen; nothing is saved without the user confirming.
* **Activity notes** (`domain/localActivityParser.ts`): splits a sentence into phrases, extracts durations, distances, water volumes, steps and weight, and matches phrases to the user's own activities via preset keywords and activity names.

## Strength training

### Data model (schema v3)

| Table | Key / indexes | Holds |
|---|---|---|
| `strengthSessions` | `id`, `date`, `status`, `*exerciseIds` (multi-entry), `activityLogId` | One workout: `status` (`in_progress` / `done`), `mode` (`live` / `quick`), timing, `dayTypes`, intensity + override, `kcalEstimate/Low/High`, `totalVolumeKg`, body weight used, notes, energy, `source` (`manual` / `text` / `migrated`), and the **exercises with their sets embedded** in order |
| `customExercises` | `id`, `name` | User-created exercises (same shape as library entries, `isCustom: true`) |
| `exercisePrefs` | `exerciseId` | Favorite, rest override, "count both hands", machine/gym note, target rep range |
| `routines` | `id`, `order` | Name, day types, exercises with target sets, rep range, rest, superset group |
| `splitPlans` | `id` | Weekday (0 = Sun) → routine or day type; at most one `active` |

Settings gain `strength` (weight step, bar weight, default rest, warm-ups in volume, rest-timer sound/vibration/notification).

* **Why sets are embedded** instead of separate `SessionExercise` / `ExerciseSet` tables: a session saves, deletes and undoes atomically as one record, an in-progress workout is a single row to autosave and resume, and per-exercise history is still one indexed query (`exerciseIds`).
* **Link to the rest of the app**: finishing a session writes (in the same transaction) one `ActivityLog` under the *Strength training* activity with duration, intensity, `caloriesBurnedEst` and `sessionId`. Today, history, charts, calories in/out and the consistency score keep working without special cases. Deleting a session removes its log too.
* **The exercise library** is bundled (`src/data/exercises.json`, versioned, 155 entries) and never copied into IndexedDB; IDs are stable and referenced by logs. Defaults (per-hand dumbbells, rest 90/60 s, MET category) are applied in `domain/strength/library.ts`.
* **Migration v2 → v3** turns each legacy strength log (free-text exercise names + sets) into a finished session: names are fuzzy-matched to the library, anything unmatched becomes one custom exercise per distinct name, legacy calorie numbers are kept. Importing a pre-v3 export runs the same conversion.
* **Units**: weights are stored in kg (3 dp so lb values round-trip); kg/lb is display-only.

### Metrics (`domain/strength/metrics.ts`, `prs.ts`)

* **Volume** = weight × reps over completed **working** sets (warm-ups excluded unless enabled), × 2 for bilateral dumbbell exercises (configurable per exercise). Bodyweight exercises use body weight + added − assistance; timed and distance sets add no volume.
* **Estimated 1RM** (Epley) = `w × (1 + reps/30)`, only for 1–12 reps, always labelled "estimated".
* **PRs**: heaviest weight, best e1RM, most reps at a given weight (or heavier), best session volume. Warm-ups never count; the first session of an exercise is the baseline. Flags are stored on sets and recomputed across history after every save, edit, delete and undo, so they stay correct when older workouts change.
* **Progress analytics** (`progress.ts`): per-exercise history points, weekly hard sets per muscle group (primary muscles 1, secondary ½), push/pull and upper/lower balance, areas not trained for 8+ days, top e1RM improvers over 6 weeks.
* **Progressive overload** (`overload.ts`): all working sets at the top of the rep range with RPE ≤ 8 → next step (+2.5 kg / 5 lb, or the next dumbbell); reps below the range → same weight; e1RM down two sessions in a row → lighter session and a pointer to sleep/nutrition. Goal-aware tips are fixed text.

### Calorie estimate (`domain/strength/calories.ts`, constants in `config/strength.ts`)

```
kcal = MET × bodyWeightKg × activeHours     shown as MET−1 … MET+1, rounded to 5 kcal
```

* **MET** (Compendium of Physical Activities): light 3.5, moderate 5.0, vigorous 6.0. **Intensity** is derived from average RPE/RIR (≥ 8 → +2), drop/failure sets, share of compound lifts, share of machines, average rest (observed between ticks in live mode, else configured) and supersets; score ≥ 2 → vigorous, ≤ −2 → light. The user can override it in the "How is this calculated?" sheet.
* **Active time**: live mode uses the timer minus any gap > 10 min between logged sets; quick log uses the entered duration; with no duration it's estimated as Σ(reps × 3 s or set duration) + rest after each set except the last.
* **Body weight**: latest logged weight (70 kg assumed and stated if none).
* **Per-exercise share** = session estimate × (exercise's working time + rest) × load factor (compound lower 1.3, compound upper 1.1, isolation 0.9) ÷ the total; largest-remainder rounding guarantees the shares add up exactly to the session figure.
* EPOC ("afterburn") is not included; the info sheet says so and points out that food logging matters more for weight goals. A heart-rate method (`kcalMethod: 'heart_rate'`) is reserved for when health data import exists.

### Typed / dictated workouts (`domain/strength/workoutParser.ts`)

On-device, like the food parser: leading day type, one segment per exercise (sentences, `;`, newlines, "then"), then sets×reps, "N sets 12, 10, 8 with 15, 17.5, 20 kg", weight×reps pairs, `@`/`at`, bare rep lists, "till failure", timed sets, `+10 kg` / assisted, word numbers, kg/lb. Exercise names are fuzzy-matched (`exerciseMatch.ts`: normalised names/aliases, character bigrams + token overlap, equipment-mismatch penalty); ambiguous names get "Did you mean…" choices. Values beyond `LIMITS` (100 reps, 500 kg, 1 h) are flagged and block saving until fixed.

### Routines, split and summaries

Starter programs (`templates.ts`) create editable routines plus an inactive split. Activating a split sets the Strength activity's schedule to `{ type: 'weekdays' }`, so the existing adherence/streak/grace logic and the consistency score count planned days with no strength-specific scoring code. `RangeData` carries sessions, custom exercises and plans; `stats.ts` adds `strength` (PRs, skipped planned days, volume per muscle group), and `rulesSummary.ts` turns it into wins, misses and week-over-week changes — every number in that text is in a fact line, enforced by the existing grounding test.

## Coaching: stats → rules

1. `domain/stats.ts` computes everything deterministically: daily series, averages, adherence, streaks (with grace), sleep consistency, weight trend, mood/sleep correlation, and the **consistency score** with a transparent breakdown (weights: nutrition 30, activity 25, habits 30, sleep 15; components without data are excluded and the weights renormalised).
2. `domain/rulesSummary.ts` turns those stats into **stat lines** ("facts") and goal-aware, prioritised wins, misses, improvements and a next focus, which can be a one-tap habit. Copy is supportive and never shaming. The stat lines are shown under each summary as *the numbers behind this summary*, and a unit test checks that every number in the summary text appears in them.
3. `domain/suggestions.ts` adds conservative goal-based suggestions: ±100 kcal at most and never below the safety floor, workout ideas for the goal, habit ideas from patterns such as late bedtimes, and protein-dense meal ideas from the food DB filtered by diet preference and avoid list.

## PWA

`vite-plugin-pwa` (generateSW) precaches the app shell, all route chunks, icons and the Latin font subsets, so every screen loads offline; `navigateFallback` serves `index.html` for deep links. The manifest includes maskable icons, standalone display and three shortcuts (`/?quick=food|workout|water`). Updates use a “new version ready — Reload” snackbar.

Reminders: an in-app ticker while the app is open, plus Periodic Background Sync for installed Chromium PWAs (the SW reads the mirrored reminder config from a tiny IndexedDB store).

## Safety

Calorie floors (1,200 / 1,500 / 1,350 kcal), capped deficits (≤ 500 kcal) and surpluses (≤ 300 kcal), gentle cautions for aggressive targets or pace, ±100 kcal maximum automatic suggestion, a non-diagnostic support message after repeated very-low-intake days, and a disclaimer at onboarding and in Profile.
