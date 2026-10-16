import type { Meal } from '@/db/types';

type MealName = Meal;

/** One parsed item, shown on the review screen before saving. */
export interface ParsedFoodItem {
  meal: Meal;
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
import { FOODS, UNIT_ALIASES, gramsFor, macrosFor, type FoodRef } from './foodDb';

/**
 * On-device parser: turns "Lunch: 2 rotis, 1 katori dal and curd" into estimated items
 * using the bundled food database.
 */

const MEAL_PATTERNS: [RegExp, MealName][] = [
  [/\b(breakfast|brekkie|morning|nashta)\b/, 'breakfast'],
  [/\b(lunch|afternoon)\b/, 'lunch'],
  [/\b(dinner|supper|night)\b/, 'dinner'],
  [/\b(snacks?|evening snack|tea time|pre[- ]?workout|post[- ]?workout)\b/, 'snack'],
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, couple: 2, three: 3, few: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25, dozen: 12,
};

const FILLER = /\b(of|some|little|bit|a bit|approx|around|about|like|plain|homemade|home made|cooked|fresh|bowl of)\b/g;

const SIZE: Record<string, number> = { small: 0.7, medium: 1, large: 1.4, big: 1.4, mini: 0.5, huge: 1.8 };

// Longest aliases first so "masala dosa" wins over "dosa".
const ALIAS_INDEX: { alias: string; food: FoodRef }[] = FOODS.flatMap((f) => f.aliases.map((alias) => ({ alias, food: f }))).sort(
  (a, b) => b.alias.length - a.alias.length,
);

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchFood(text: string): { food: FoodRef; exact: boolean } | null {
  const t = ` ${text.toLowerCase()} `;
  for (const { alias, food } of ALIAS_INDEX) {
    if (new RegExp(`[^a-z]${escapeRe(alias)}[^a-z]`).test(t)) return { food, exact: true };
  }
  // fuzzy: any word of length ≥4 that starts an alias
  const words = text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  for (const w of words) {
    const hit = ALIAS_INDEX.find(({ alias }) => alias.startsWith(w.slice(0, Math.max(4, w.length - 1))));
    if (hit) return { food: hit.food, exact: false };
  }
  return null;
}

function splitMeals(text: string, defaultMeal: MealName): { meal: MealName; text: string }[] {
  const parts: { meal: MealName; text: string }[] = [];
  const re = /(breakfast|brekkie|lunch|dinner|supper|evening snack|snacks?|pre[- ]?workout|post[- ]?workout)\s*[:\-–]?/gi;
  let last = 0;
  let meal = defaultMeal;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ meal, text: text.slice(last, m.index) });
    meal = MEAL_PATTERNS.find(([p]) => p.test(m![1].toLowerCase()))?.[1] ?? defaultMeal;
    last = m.index + m[0].length;
  }
  parts.push({ meal, text: text.slice(last) });
  return parts.filter((p) => p.text.trim());
}

function splitItems(text: string): string[] {
  return text
    .split(/[,;\n+&]|\band\b|\bwith\b|\balong with\b|\.(?!\d)/i)
    .map((s) => s.trim())
    .filter((s) => /[a-z]/i.test(s));
}

function parseFraction(s: string): number | null {
  if (s === '½') return 0.5;
  if (s === '¼') return 0.25;
  if (s === '¾') return 0.75;
  const f = s.match(/^(\d+)\/(\d+)$/);
  if (f) return Number(f[1]) / Number(f[2]);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function parseChunk(chunk: string, meal: MealName): ParsedFoodItem {
  let s = chunk.toLowerCase().replace(/\s+/g, ' ').trim();
  let quantity = 1;
  let unit: string | null = null;
  let sizeFactor = 1;

  // "200g", "250 ml", "2 katori", "1/2 cup", "½ plate"
  const q = s.match(/^(\d+\/\d+|\d+(?:\.\d+)?|[½¼¾])\s*([a-z]+)?\b/);
  if (q) {
    quantity = parseFraction(q[1]) ?? 1;
    if (q[2] && UNIT_ALIASES[q[2]]) {
      unit = UNIT_ALIASES[q[2]];
      s = s.slice(q[0].length);
    } else {
      s = s.slice(q[1].length);
    }
  } else {
    const w = s.match(/^([a-z]+)\s+/);
    if (w && NUMBER_WORDS[w[1]] != null) {
      quantity = NUMBER_WORDS[w[1]];
      s = s.slice(w[0].length);
      if (w[1] === 'half' && s.startsWith('a ')) s = s.slice(2);
    }
  }
  // a unit word after the number: "2 big katoris of dal"
  for (let i = 0; i < 2; i++) {
    const u = s.trim().match(/^([a-z]+)\b/);
    if (!u) break;
    if (SIZE[u[1]] != null) {
      sizeFactor = SIZE[u[1]];
      s = s.trim().slice(u[0].length);
    } else if (!unit && UNIT_ALIASES[u[1]]) {
      unit = UNIT_ALIASES[u[1]];
      s = s.trim().slice(u[0].length);
    }
  }
  const name = s.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  const hit = matchFood(name || chunk);

  if (!hit) {
    return {
      meal,
      name: capitalize(name || chunk.trim()),
      quantity,
      unit: unit ?? 'serving',
      gramsEst: 0,
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      confidence: 0.1,
      assumptions: 'Not in the food list yet — please enter calories and macros.',
    };
  }
  const { food, exact } = hit;
  const u = unit ?? food.defaultUnit;
  // Bare "2 rotis" uses the food's default unit; bare "200" with g default means grams.
  const grams = Math.round(gramsFor(food, u, quantity) * sizeFactor);
  const effectiveGrams = food.defaultUnit === 'g' && !unit && quantity < 10 ? Math.round((food.units.piece ?? 100) * quantity * sizeFactor) : grams;
  const m = macrosFor(food, effectiveGrams);
  const perUnit = food.units[u];
  const assumptions = [
    unit ? null : `assumed ${food.defaultUnit === 'g' ? 'a typical portion' : `${quantity} ${food.defaultUnit}`}`,
    perUnit && u !== 'g' && u !== 'ml' ? `1 ${u} ≈ ${perUnit} g` : null,
    sizeFactor !== 1 ? `size adjusted ×${sizeFactor}` : null,
    exact ? null : `closest match: ${food.name}`,
  ]
    .filter(Boolean)
    .join('; ');
  return {
    meal,
    name: food.name,
    quantity,
    unit: food.defaultUnit === 'g' && !unit ? 'serving' : u,
    gramsEst: effectiveGrams,
    calories: m.calories,
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
    fiberG: m.fiberG,
    confidence: exact ? (unit ? 0.6 : 0.5) : 0.35,
    assumptions,
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseFoodTextLocally(text: string, defaultMeal: MealName = 'other'): ParsedFoodItem[] {
  const out: ParsedFoodItem[] = [];
  for (const section of splitMeals(text, defaultMeal)) {
    for (const chunk of splitItems(section.text)) out.push(parseChunk(chunk, section.meal));
  }
  return out;
}

/** Re-scale an item when the user edits its quantity on the review screen. */
export function rescaleItem<T extends { quantity: number; gramsEst: number; calories: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number }>(
  item: T,
  newQuantity: number,
): T {
  if (item.quantity <= 0) return { ...item, quantity: newQuantity };
  const k = newQuantity / item.quantity;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    ...item,
    quantity: newQuantity,
    gramsEst: Math.round(item.gramsEst * k),
    calories: Math.round(item.calories * k),
    proteinG: r1(item.proteinG * k),
    carbsG: r1(item.carbsG * k),
    fatG: r1(item.fatG * k),
    fiberG: item.fiberG == null ? undefined : r1(item.fiberG * k),
  };
}

/** Build an item from a DB food (used by "swap food" and search). */
export function itemFromFood(food: FoodRef, meal: MealName, quantity = 1, unit = food.defaultUnit): ParsedFoodItem {
  const u = unit === 'g' && quantity < 10 ? 'piece' : unit;
  const grams = Math.round(gramsFor(food, u, quantity));
  const m = macrosFor(food, grams);
  return {
    meal,
    name: food.name,
    quantity,
    unit: u === 'piece' && food.defaultUnit === 'g' ? 'serving' : u,
    gramsEst: grams,
    ...m,
    confidence: 0.7,
    assumptions: `${quantity} ${u} ≈ ${grams} g`,
  };
}

export function searchFoods(query: string, limit = 8): FoodRef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = FOODS.map((f) => {
    let score = 0;
    for (const a of [f.name.toLowerCase(), ...f.aliases]) {
      if (a === q) score = Math.max(score, 100);
      else if (a.startsWith(q)) score = Math.max(score, 60);
      else if (a.includes(q)) score = Math.max(score, 30);
    }
    return { f, score };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.f);
}
