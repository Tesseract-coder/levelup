/**
 * Zod-free half of the AI contract: types, sanitisers and grounding checks.
 * The browser imports only this file (keeps zod out of the client bundle);
 * `schemas.ts` adds the zod wire schemas used by the server.
 */
export const MEALS = ['breakfast', 'lunch', 'snack', 'dinner', 'other'] as const;
export type MealName = (typeof MEALS)[number];

export interface FoodItemWire {
  meal: MealName;
  name: string;
  quantity: number;
  unit: string;
  grams_estimate: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  confidence: number;
  assumptions: string;
}

export interface ParseFoodRequest {
  text: string;
  diet?: string;
  defaultMeal?: MealName;
}

export interface ParseActivityRequest {
  text: string;
  activities: { id: string; name: string; kind: 'workout' | 'habit'; unit?: string }[];
}

export interface Fact {
  id: string;
  text: string;
}

export interface SummaryRequest {
  kind: 'day' | 'week';
  goal: string;
  facts: Fact[];
  candidates: { wins: string[]; misses: string[]; improvements: string[]; focus: string | null };
}

export interface SummaryLine {
  text: string;
  facts: string[];
}
export interface SummaryWire {
  wins: SummaryLine[];
  misses: SummaryLine[];
  improvements: SummaryLine[];
  next_focus: SummaryLine;
}

export interface SuggestRequest {
  goal: string;
  diet: string;
  avoid: string[];
  proteinGapG: number;
  caloriesLeft: number;
  mealSlot?: MealName;
}

export const ACTIVITY_ENTRY_KINDS = ['workout', 'habit', 'sleep', 'water', 'weight', 'unknown'] as const;

export interface ParsedFoodItem {
  meal: MealName;
  name: string;
  quantity: number;
  unit: string;
  gramsEst: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  confidence: number;
  assumptions: string;
}

export interface ParseFoodResponse {
  items: ParsedFoodItem[];
  source: 'ai' | 'offline';
  model?: string;
}

const clamp = (v: unknown, lo: number, hi: number, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Accepts loosely-shaped model output, returns safe items (or [] if nothing usable). */
export function sanitizeFoodItems(raw: unknown): ParsedFoodItem[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
  const out: ParsedFoodItem[] = [];
  for (const it of list.slice(0, 60)) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
    if (!name) continue;
    const meal = (MEALS as readonly string[]).includes(o.meal as string) ? (o.meal as MealName) : 'other';
    let calories = clamp(o.calories, 0, 4000);
    const proteinG = clamp(o.protein_g ?? o.proteinG, 0, 300);
    const carbsG = clamp(o.carbs_g ?? o.carbsG, 0, 600);
    const fatG = clamp(o.fat_g ?? o.fatG, 0, 300);
    const fiberRaw = o.fiber_g ?? o.fiberG;
    const fiberG = fiberRaw == null ? undefined : clamp(fiberRaw, 0, 100);
    let confidence = clamp(o.confidence, 0, 1, 0.5);
    let assumptions = typeof o.assumptions === 'string' ? o.assumptions.trim().slice(0, 300) : '';

    // Repair: calories should roughly match 4/4/9 macros.
    const macroKcal = proteinG * 4 + carbsG * 4 + fatG * 9;
    if (macroKcal > 30 && (calories === 0 || Math.abs(calories - macroKcal) / macroKcal > 0.35)) {
      calories = macroKcal;
      confidence = Math.min(confidence, 0.5);
      assumptions = [assumptions, 'calories recalculated from macros'].filter(Boolean).join('; ');
    }
    out.push({
      meal,
      name,
      quantity: r1(clamp(o.quantity, 0, 100, 1)) || 1,
      unit: typeof o.unit === 'string' && o.unit.trim() ? o.unit.trim().slice(0, 24) : 'serving',
      gramsEst: Math.round(clamp(o.grams_estimate ?? o.gramsEst, 0, 3000)),
      calories: Math.round(calories),
      proteinG: r1(proteinG),
      carbsG: r1(carbsG),
      fatG: r1(fatG),
      fiberG: fiberG == null ? undefined : r1(fiberG),
      confidence: Math.round(confidence * 100) / 100,
      assumptions,
    });
  }
  return out;
}

export function sanitizeActivityEntries(raw: unknown, knownIds: Set<string>): ParsedActivityEntry[] {
  const list = Array.isArray((raw as { entries?: unknown })?.entries) ? (raw as { entries: unknown[] }).entries : [];
  const out: ParsedActivityEntry[] = [];
  for (const it of list.slice(0, 30)) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const kind = (ACTIVITY_ENTRY_KINDS as readonly string[]).includes(o.kind as string) ? (o.kind as ParsedActivityEntry['kind']) : 'unknown';
    const id = typeof o.activity_id === 'string' && knownIds.has(o.activity_id) ? o.activity_id : null;
    const num = (v: unknown, hi: number) => (v == null ? undefined : clamp(v, 0, hi) || undefined);
    out.push({
      phrase: String(o.phrase ?? '').slice(0, 120),
      kind,
      activityId: id,
      activityName: String(o.activity_name ?? '').slice(0, 60),
      durationMin: num(o.duration_min, 24 * 60),
      distanceKm: num(o.distance_km, 500),
      value: num(o.value, 1_000_000),
      unit: typeof o.unit === 'string' ? o.unit.slice(0, 12) : undefined,
      intensity: ['easy', 'moderate', 'hard'].includes(o.intensity as string) ? (o.intensity as ParsedActivityEntry['intensity']) : undefined,
      confidence: clamp(o.confidence, 0, 1, 0.5),
    });
  }
  return out;
}

/** Pulls every number out of a string ("1,800 kcal", "102%", "6.5 h" → [1800, 102, 6.5]). */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?<![\w.])-?\d[\d,]*(?:\.\d+)?/g)) {
    const n = parseFloat(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Every number the model writes must already exist in the facts it was given.
 * Returns the list of offending numbers (empty = grounded).
 */
export function ungroundedNumbers(text: string, facts: Fact[]): number[] {
  const allowed = new Set<number>();
  for (const f of facts) for (const n of extractNumbers(f.text)) allowed.add(n);
  return extractNumbers(text).filter((n) => !allowed.has(n));
}

export function validateSummary(s: SummaryWire, facts: Fact[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const ids = new Set(facts.map((f) => f.id));
  const lines = [...s.wins, ...s.misses, ...s.improvements, s.next_focus];
  for (const l of lines) {
    const bad = ungroundedNumbers(l.text, facts);
    if (bad.length) problems.push(`ungrounded numbers ${bad.join(', ')} in "${l.text}"`);
    if (l.facts.some((f) => !ids.has(f))) problems.push(`unknown fact id in "${l.text}"`);
    if (l.text.length > 240) problems.push('line too long');
  }
  if (s.wins.length > 4 || s.misses.length > 4 || s.improvements.length > 3) problems.push('too many items');
  const banned = /\b(fail(ed|ure)?|bad day|lazy|disappoint|shame|fat\b|ugly|punish|purge|starve)/i;
  for (const l of lines) if (banned.test(l.text)) problems.push(`tone: "${l.text}"`);
  return { ok: problems.length === 0, problems };
}

export function sanitizeIdeas(raw: unknown): MealIdea[] {
  const list = Array.isArray((raw as { ideas?: unknown })?.ideas) ? (raw as { ideas: unknown[] }).ideas : [];
  return list
    .slice(0, 5)
    .map((x) => x as Record<string, unknown>)
    .filter((o) => typeof o?.name === 'string')
    .map((o) => ({
      name: String(o.name).slice(0, 60),
      description: String(o.description ?? '').slice(0, 160),
      proteinG: Math.round(clamp(o.protein_g, 0, 150)),
      calories: Math.round(clamp(o.calories, 0, 1500) / 10) * 10,
    }));
}

export interface ParsedActivityEntry {
  phrase: string;
  kind: (typeof ACTIVITY_ENTRY_KINDS)[number];
  activityId: string | null;
  activityName: string;
  durationMin?: number;
  distanceKm?: number;
  value?: number;
  unit?: string;
  intensity?: 'easy' | 'moderate' | 'hard';
  confidence: number;
}

export interface MealIdea {
  name: string;
  description: string;
  proteinG: number;
  calories: number;
}
