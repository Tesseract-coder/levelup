import type { FoodEntry, Macros, Meal } from '@/db/types';

export const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner', 'other'];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snacks', dinner: 'Dinner', other: 'Other' };

export function sumMacros(items: Pick<Macros, 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG'>[]): Required<Macros> {
  const t = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
  for (const i of items) {
    t.calories += i.calories || 0;
    t.proteinG += i.proteinG || 0;
    t.carbsG += i.carbsG || 0;
    t.fatG += i.fatG || 0;
    t.fiberG += i.fiberG || 0;
  }
  return { calories: Math.round(t.calories), proteinG: Math.round(t.proteinG), carbsG: Math.round(t.carbsG), fatG: Math.round(t.fatG), fiberG: Math.round(t.fiberG) };
}

export function groupByMeal<T extends { meal: Meal }>(items: T[]): { meal: Meal; items: T[] }[] {
  return MEAL_ORDER.map((meal) => ({ meal, items: items.filter((i) => i.meal === meal) })).filter((g) => g.items.length);
}

/** Display helpers — round sensibly, never fake precision. */
export const kcal = (n: number) => Math.round(n).toLocaleString();
export const grams = (n: number) => `${Math.round(n)} g`;

export function guessMeal(now = new Date()): Meal {
  const h = now.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

export type { FoodEntry };
