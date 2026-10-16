import type { DateKey, FoodEntry } from '@/db/types';
import { addDays } from './dates';

export const VERY_LOW_KCAL = 800;

/**
 * Non-diagnostic signal: 3+ of the last 7 completed days where the user logged at least two items
 * (so it's not just partial logging) and the total was under 800 kcal.
 */
export function veryLowIntakeDays(food: FoodEntry[], today: DateKey): number {
  let count = 0;
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i);
    const items = food.filter((f) => f.date === d);
    if (items.length < 2) continue;
    const kcal = items.reduce((t, f) => t + f.calories, 0);
    if (kcal < VERY_LOW_KCAL) count++;
  }
  return count;
}

export const showLowIntakeSupport = (food: FoodEntry[], today: DateKey) => veryLowIntakeDays(food, today) >= 3;
