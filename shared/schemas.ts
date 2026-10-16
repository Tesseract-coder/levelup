/**
 * Zod wire schemas for the AI proxy (server side). Request bodies are validated against these, and
 * the model must return JSON matching the *Wire schemas (structured outputs). Results then go through
 * the sanitisers in `sanitize.ts`, which the browser also uses — the browser never imports zod.
 */
import { z } from 'zod';
import { ACTIVITY_ENTRY_KINDS, MEALS } from './sanitize.ts';

export * from './sanitize.ts';

// ---------------------------------------------------------------- food parsing
export const FoodItemWire = z.object({
  meal: z.enum(MEALS),
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  grams_estimate: z.number(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number().nullable(),
  confidence: z.number(),
  assumptions: z.string(),
});
export const FoodParseWire = z.object({ items: z.array(FoodItemWire) });

export const ParseFoodRequest = z.object({
  text: z.string().trim().min(2).max(2000),
  diet: z.string().max(40).optional(),
  defaultMeal: z.enum(MEALS).optional(),
});

// ------------------------------------------------------------ activity parsing
export const ActivityEntryWire = z.object({
  phrase: z.string(),
  kind: z.enum(ACTIVITY_ENTRY_KINDS),
  activity_id: z.string().nullable(),
  activity_name: z.string(),
  duration_min: z.number().nullable(),
  distance_km: z.number().nullable(),
  value: z.number().nullable(),
  unit: z.string().nullable(),
  intensity: z.enum(['easy', 'moderate', 'hard']).nullable(),
  confidence: z.number(),
});
export const ActivityParseWire = z.object({ entries: z.array(ActivityEntryWire) });

export const ParseActivityRequest = z.object({
  text: z.string().trim().min(2).max(1500),
  activities: z
    .array(z.object({ id: z.string().max(64), name: z.string().max(60), kind: z.enum(['workout', 'habit']), unit: z.string().max(12).optional() }))
    .max(60),
});

// ------------------------------------------------------------ summary phrasing
export const Fact = z.object({ id: z.string().max(40), text: z.string().max(300) });

export const SummaryRequest = z.object({
  kind: z.enum(['day', 'week']),
  goal: z.string().max(120),
  facts: z.array(Fact).max(80),
  candidates: z.object({
    wins: z.array(z.string()).max(20),
    misses: z.array(z.string()).max(20),
    improvements: z.array(z.string()).max(20),
    focus: z.string().nullable(),
  }),
});

const SummaryLine = z.object({ text: z.string(), facts: z.array(z.string()) });
export const SummaryWire = z.object({
  wins: z.array(SummaryLine),
  misses: z.array(SummaryLine),
  improvements: z.array(SummaryLine),
  next_focus: SummaryLine,
});

// ---------------------------------------------------------------- suggestions
export const SuggestRequest = z.object({
  goal: z.string().max(120),
  diet: z.string().max(40),
  avoid: z.array(z.string().max(40)).max(20),
  proteinGapG: z.number().min(0).max(300),
  caloriesLeft: z.number().min(-3000).max(5000),
  mealSlot: z.enum(MEALS).optional(),
});

export const MealIdeaWire = z.object({ name: z.string(), description: z.string(), protein_g: z.number(), calories: z.number() });
export const SuggestWire = z.object({ ideas: z.array(MealIdeaWire) });
