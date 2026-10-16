/**
 * Goal-based suggestions, all rule-based and conservative. Calorie changes are ±100 kcal at most,
 * never below the safety floor, and only after enough data (≥ 14 days, ≥ 6 weigh-ins).
 */
import type { ActivityDef, DietPreference, Goal, Sex } from '@/db/types';
import type { RangeData } from '@/db/repository';
import { addDays, hmToMin, rangeKeys } from './dates';
import { foodsForDiet, macrosFor } from './foodDb';
import { calorieFloor } from './targets';
import { movingAverage } from './stats';

export interface Suggestion {
  id: string;
  kind: 'calories' | 'workout' | 'meal' | 'habit' | 'caution';
  title: string;
  body: string;
  action?: { label: string; type: 'adjustCalories'; delta: number } | { label: string; type: 'addHabit'; habit: Partial<ActivityDef> & { name: string } };
}

export function weightTrend(data: RangeData, today: string, days = 21): { change: number | null; weeks: number; entries: number } {
  const keys = rangeKeys(addDays(today, -(days - 1)), today);
  const pts = keys.map((d) => ({ date: d, v: data.body.filter((b) => b.date === d && b.weightKg != null).sort((a, b) => b.createdAt - a.createdAt)[0]?.weightKg ?? null }));
  const entries = pts.filter((p) => p.v != null).length;
  const ma = movingAverage(pts, 7);
  const firstIdx = ma.findIndex((v, i) => v != null && i >= 6);
  const last = ma[ma.length - 1];
  if (entries < 6 || firstIdx < 0 || last == null || ma[firstIdx] == null) return { change: null, weeks: days / 7, entries };
  return { change: Math.round((last - ma[firstIdx]!) * 10) / 10, weeks: (keys.length - 1 - firstIdx) / 7, entries };
}

export function calorieSuggestion(goal: Goal, sex: Sex, data: RangeData, today: string): Suggestion | null {
  const t = weightTrend(data, today);
  if (t.change == null || t.weeks < 1.5) return null;
  const perWeek = t.change / t.weeks;
  const loggedDays = new Set(data.food.filter((f) => f.date >= addDays(today, -20)).map((f) => f.date)).size;
  if (loggedDays < 12) return null; // can't judge without consistent logging
  const floor = calorieFloor(sex);
  if (goal.type === 'lose_fat') {
    if (perWeek > -0.1 && goal.calorieTarget - 100 >= floor) {
      return { id: 'cal-down', kind: 'calories', title: 'Weight has been steady', body: `Your 7-day average moved ${t.change > 0 ? '+' : ''}${t.change} kg over ~${Math.round(t.weeks)} weeks while logging consistently. A small 100 kcal reduction is enough to restart progress — nothing drastic.`, action: { label: 'Lower target by 100 kcal', type: 'adjustCalories', delta: -100 } };
    }
    if (perWeek < -(goal.startWeightKg * 0.01)) {
      return { id: 'cal-up', kind: 'caution', title: 'You’re losing faster than needed', body: `About ${Math.abs(Math.round(perWeek * 10) / 10)} kg per week. Slower loss is easier to keep — consider eating 100 kcal more.`, action: { label: 'Raise target by 100 kcal', type: 'adjustCalories', delta: 100 } };
    }
  }
  if (goal.type === 'build_muscle' && perWeek < 0.05) {
    return { id: 'cal-up-muscle', kind: 'calories', title: 'Weight isn’t moving up', body: `Your trend changed ${t.change > 0 ? '+' : ''}${t.change} kg in ~${Math.round(t.weeks)} weeks. Adding 100 kcal (e.g. a glass of milk) supports muscle gain.`, action: { label: 'Raise target by 100 kcal', type: 'adjustCalories', delta: 100 } };
  }
  return null;
}

export function workoutSuggestions(goal: Goal, activities: ActivityDef[]): Suggestion[] {
  const names = new Set(activities.filter((a) => !a.archived).map((a) => a.name.toLowerCase()));
  const has = (n: string) => [...names].some((x) => x.includes(n));
  const out: Suggestion[] = [];
  if (goal.type === 'lose_fat') {
    if (!has('incline') && !has('walk'))
      out.push({ id: 'w-incline', kind: 'workout', title: 'Add an easy inclined walk', body: 'On rest days, 20–30 minutes of incline walking burns energy without wrecking recovery.', action: { label: 'Add “Inclined walk”', type: 'addHabit', habit: { name: 'Inclined walk / treadmill', kind: 'workout' } } });
    if (!has('strength')) out.push({ id: 'w-strength', kind: 'workout', title: 'Keep some strength work', body: 'Two short strength sessions a week help you keep muscle while losing fat.', action: { label: 'Add “Strength training”', type: 'addHabit', habit: { name: 'Strength training', kind: 'workout' } } });
  }
  if (goal.type === 'build_muscle') {
    out.push({ id: 'w-overload', kind: 'workout', title: 'Progressive overload', body: 'Each session, try adding 2.5 kg or one rep to a main lift. LevelUp shows last session’s numbers and flags PRs.' });
    if (!has('strength')) out.push({ id: 'w-strength2', kind: 'workout', title: 'Track strength sessions', body: 'Log sets × reps × weight to see your progress over time.', action: { label: 'Add “Strength training”', type: 'addHabit', habit: { name: 'Strength training', kind: 'workout' } } });
  }
  if (goal.type === 'endurance') {
    out.push({ id: 'w-easy', kind: 'workout', title: 'Mostly easy, a little hard', body: 'Keep about 80% of cardio at an easy, chatty pace and one session a week harder.' });
    if (!has('stretch') && !has('yoga')) out.push({ id: 'w-mob', kind: 'workout', title: 'Add mobility', body: '10 minutes of stretching after runs helps you keep training consistently.', action: { label: 'Add “Stretching”', type: 'addHabit', habit: { name: 'Stretching', kind: 'workout' } } });
  }
  if (goal.type === 'discipline' || goal.type === 'maintain') {
    if (!has('walk')) out.push({ id: 'w-walk', kind: 'workout', title: 'A daily walk', body: 'A 20-minute walk is the easiest movement habit to keep.', action: { label: 'Add “Walking”', type: 'addHabit', habit: { name: 'Walking', kind: 'workout' } } });
  }
  return out;
}

export function habitSuggestions(data: RangeData, today: string, goal: Goal): Suggestion[] {
  const out: Suggestion[] = [];
  const recent = data.sleep.filter((s) => s.date >= addDays(today, -13));
  // bedtimes after 23:30 (minutes after 18:00 > 330)
  const late = recent.filter((s) => (hmToMin(s.bedtime) - 18 * 60 + 1440) % 1440 > 330).length;
  const has = (n: string) => data.activities.some((a) => !a.archived && a.name.toLowerCase().includes(n));
  if (late >= 4 && !has('wind')) {
    out.push({ id: 'h-wind', kind: 'habit', title: 'Late nights lately', body: `You went to bed after 11:30 pm on ${late} of the last ${recent.length} logged nights. A short wind-down routine (screens off, dim lights) makes earlier sleep easier.`, action: { label: 'Add “Wind-down routine”', type: 'addHabit', habit: { name: 'Wind-down routine', kind: 'habit', trackingType: 'check', icon: 'moon' } } });
  }
  const water = data.activities.find((a) => a.special === 'water');
  if (!water) out.push({ id: 'h-water', kind: 'habit', title: 'Track water', body: 'Quick-add glasses with one tap — an easy daily win.', action: { label: 'Add “Water”', type: 'addHabit', habit: { name: 'Water', kind: 'habit', special: 'water' } } });
  if ((goal.type === 'discipline' || goal.type === 'custom') && !has('journal')) out.push({ id: 'h-journal', kind: 'habit', title: 'One-line journal', body: 'Write a single line each evening about what went well. It reinforces every other habit.', action: { label: 'Add “Journaling”', type: 'addHabit', habit: { name: 'Journaling', kind: 'habit', trackingType: 'check', icon: 'journal' } } });
  return out;
}

export interface LocalMealIdea {
  name: string;
  serving: string;
  proteinG: number;
  calories: number;
}

/** Protein-dense ideas from the bundled database, filtered by diet and avoid list. */
export function localMealIdeas(diet: DietPreference, avoid: string[], proteinGap: number, kcalLeft: number, n = 3): LocalMealIdea[] {
  const avoidL = avoid.map((a) => a.toLowerCase());
  const candidates = foodsForDiet(diet)
    .filter((f) => !avoidL.some((a) => f.name.toLowerCase().includes(a) || f.aliases.some((x) => x.includes(a))))
    .map((f) => {
      const unit = f.defaultUnit === 'g' ? (f.units.piece ? 'piece' : 'g') : f.defaultUnit;
      const grams = unit === 'g' ? 100 : f.units[unit] ?? 150;
      const m = macrosFor(f, grams);
      return { f, unit, grams, m, density: m.proteinG / Math.max(50, m.calories) };
    })
    .filter((x) => x.m.proteinG >= 6 && x.m.calories <= Math.max(250, kcalLeft));
  candidates.sort((a, b) => b.density - a.density);
  const seen = new Set<string>();
  const out: LocalMealIdea[] = [];
  for (const c of candidates) {
    const key = c.f.name.split(' ')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    const qty = proteinGap > c.m.proteinG * 1.8 && c.unit !== 'g' ? 2 : 1;
    out.push({ name: c.f.name, serving: `${qty} ${c.unit === 'g' ? '100 g' : c.unit}${qty > 1 && c.unit !== 'g' ? 's' : ''} (~${c.grams * qty} g)`, proteinG: Math.round(c.m.proteinG * qty), calories: Math.round((c.m.calories * qty) / 5) * 5 });
    if (out.length >= n) break;
  }
  return out;
}

