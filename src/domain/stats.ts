/**
 * Deterministic stats engine. Every number shown in Insights and in summaries comes from here.
 */
import type { ActivityDef, DateKey, Goal, ScoreComponent, Settings } from '@/db/types';
import type { RangeData } from '@/db/repository';
import { addDays, diffDays, hmToMin, rangeKeys, startOfWeek, weekday, WEEKDAY_NAMES } from './dates';
import { activeFrom, adherence, computeStreak, doneDatesFor, indexLogs, isScheduledOn, type DayIndex } from './habits';
import { sumMacros } from './nutrition';

export interface DayPoint {
  date: DateKey;
  calories: number | null; // null = nothing logged
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  burned: number;
  activeMin: number;
  minutesByActivity: Record<string, number>;
  sleepH: number | null;
  bedtimeMin: number | null; // minutes after 18:00 for consistency maths
  weightKg: number | null;
  habitsDone: number;
  habitsScheduled: number;
  mood: number | null;
  energy: number | null;
}

export function dailySeries(start: DateKey, end: DateKey, data: RangeData): DayPoint[] {
  const idx = indexLogs(data.logs, data.sleep);
  const habits = data.activities.filter((a) => a.kind === 'habit' && !a.archived && a.special !== 'sleep');
  const byId = new Map(data.activities.map((a) => [a.id, a]));
  return rangeKeys(start, end).map((date) => {
    const food = data.food.filter((f) => f.date === date);
    const t = food.length ? sumMacros(food) : null;
    const logs = data.logs.filter((l) => l.date === date);
    const minutesByActivity: Record<string, number> = {};
    let burned = 0;
    let activeMin = 0;
    for (const l of logs) {
      const d = byId.get(l.activityId);
      if (d?.kind !== 'workout') continue;
      const m = l.durationMin ?? l.value ?? 0;
      minutesByActivity[d.id] = (minutesByActivity[d.id] ?? 0) + m;
      activeMin += m;
      burned += l.caloriesBurnedEst ?? 0;
    }
    const sleep = idx.sleep.get(date);
    const body = data.body.filter((b) => b.date === date && b.weightKg != null).sort((a, b) => b.createdAt - a.createdAt)[0];
    const mood = data.mood.find((m) => m.date === date);
    let done = 0;
    let scheduled = 0;
    for (const h of habits) {
      if (h.schedule.type === 'weekly' || !isScheduledOn(h, date) || activeFrom(h, idx) > date) continue;
      scheduled++;
      if (doneDatesFor(h, idx, date, date).has(date)) done++;
    }
    return {
      date,
      calories: t?.calories ?? null,
      proteinG: t?.proteinG ?? null,
      carbsG: t?.carbsG ?? null,
      fatG: t?.fatG ?? null,
      burned,
      activeMin,
      minutesByActivity,
      sleepH: sleep ? Math.round((sleep.durationMin / 60) * 10) / 10 : null,
      bedtimeMin: sleep ? (hmToMin(sleep.bedtime) - 18 * 60 + 1440) % 1440 : null,
      weightKg: body?.weightKg ?? null,
      habitsDone: done,
      habitsScheduled: scheduled,
      mood: mood?.mood ?? null,
      energy: mood?.energy ?? null,
    };
  });
}

/** Trailing moving average over non-null values (window in days). */
export function movingAverage(points: { date: DateKey; v: number | null }[], window = 7): (number | null)[] {
  return points.map((_, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1).map((p) => p.v).filter((v): v is number => v != null);
    return slice.length ? Math.round((slice.reduce((t, v) => t + v, 0) / slice.length) * 10) / 10 : null;
  });
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const r0 = Math.round;
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

// ------------------------------------------------------------------ score

export const SCORE_WEIGHTS = { nutrition: 30, activity: 25, habits: 30, sleep: 15 } as const;

/** Calories within ±10% of target = full marks, fading to zero at ±35%. */
export function calorieAdherence(kcal: number, target: number): number {
  const dev = Math.abs(kcal - target) / target;
  if (dev <= 0.1) return 1;
  if (dev >= 0.35) return 0;
  return 1 - (dev - 0.1) / 0.25;
}
/** Protein ≥ 90% of target = full marks. */
export const proteinAdherence = (g: number, target: number) => Math.min(1, g / (0.9 * target));
/** Sleep within 30 min of target = full marks, zero at 3 h short. */
export function sleepAdherence(hours: number, targetH: number): number {
  const short = targetH - hours;
  if (short <= 0.5) return 1;
  if (short >= 3) return 0;
  return 1 - (short - 0.5) / 2.5;
}

/** Planned workout sessions per week across all active workout definitions. */
export function plannedSessionsPerWeek(defs: ActivityDef[]): number {
  return defs
    .filter((d) => d.kind === 'workout' && !d.archived)
    .reduce((t, d) => t + (d.schedule.type === 'weekly' ? d.schedule.times : d.schedule.type === 'daily' ? 7 : d.schedule.days.length), 0);
}

// ------------------------------------------------------------- range stats

export interface HabitStat {
  id: string;
  name: string;
  kind: 'habit' | 'workout';
  done: number;
  expected: number;
  rate: number; // 0..100
  streak: number;
  streakUnit: 'days' | 'weeks';
  missedWeekdays: string[]; // e.g. ['Wed','Thu']
}

export interface RangeStats {
  start: DateKey;
  end: DateKey; // capped at today
  days: number;
  goalType: Goal['type'] | null;
  nutrition: {
    loggedDays: number;
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    calorieTarget: number;
    proteinTarget: number;
    proteinHitDays: number;
    calorieOnTargetDays: number;
    overDays: number;
    avgProteinPct: number;
    avgCaloriePct: number;
    breakfastProteinAvg: number | null;
    lowIntakeDays: number;
  };
  activity: {
    sessions: number;
    planned: number;
    minutes: number;
    burned: number;
    activeDays: number;
    inactiveWeekdays: string[];
    minutesByName: Record<string, number>;
    topName: string | null;
  };
  habits: HabitStat[];
  sleep: { nights: number; avgHours: number; targetHours: number; under6: number; onTarget: number; bedtimeSdMin: number };
  weight: { entries: number; first: number | null; last: number | null; change: number | null; target: number | null };
  mood: { entries: number; avgEnergy: number | null; energyGoodSleep: number | null; energyLowSleep: number | null };
  score: number;
  breakdown: ScoreComponent[];
}

export function computeRangeStats(
  startIn: DateKey,
  endIn: DateKey,
  data: RangeData,
  goal: Goal | null | undefined,
  settings: Pick<Settings, 'graceDaysPerWeek' | 'weekStartsOn'>,
  today: DateKey,
): RangeStats {
  const end = endIn > today ? today : endIn;
  const start = startIn;
  const keys = rangeKeys(start, end);
  const idx: DayIndex = indexLogs(data.logs, data.sleep);
  const series = dailySeries(start, end, data);
  const isPast = (d: DateKey) => d < today;
  const calorieTarget = goal?.calorieTarget ?? 2000;
  const proteinTarget = goal?.proteinTarget ?? 100;

  // ---- nutrition (today counts only if something is logged)
  const logged = series.filter((p) => p.calories != null);
  const nutritionDays = keys.filter((d) => isPast(d) || logged.some((p) => p.date === d)).length;
  const breakfast = keys
    .map((d) => data.food.filter((f) => f.date === d && f.meal === 'breakfast'))
    .filter((b) => b.length)
    .map((b) => b.reduce((t, f) => t + f.proteinG, 0));
  const nutrition = {
    loggedDays: logged.length,
    avgCalories: r0(mean(logged.map((p) => p.calories!))),
    avgProtein: r0(mean(logged.map((p) => p.proteinG!))),
    avgCarbs: r0(mean(logged.map((p) => p.carbsG!))),
    avgFat: r0(mean(logged.map((p) => p.fatG!))),
    calorieTarget,
    proteinTarget,
    proteinHitDays: logged.filter((p) => p.proteinG! >= 0.9 * proteinTarget).length,
    calorieOnTargetDays: logged.filter((p) => Math.abs(p.calories! - calorieTarget) <= 0.1 * calorieTarget).length,
    overDays: logged.filter((p) => p.calories! > 1.1 * calorieTarget).length,
    avgProteinPct: pct(mean(logged.map((p) => p.proteinG!)), proteinTarget),
    avgCaloriePct: pct(mean(logged.map((p) => p.calories!)), calorieTarget),
    breakfastProteinAvg: breakfast.length ? r0(mean(breakfast)) : null,
    lowIntakeDays: logged.filter((p) => p.calories! < 800 && data.food.filter((f) => f.date === p.date).length >= 2).length,
  };
  const nutritionScore = nutritionDays
    ? keys
        .filter((d) => isPast(d) || logged.some((p) => p.date === d))
        .map((d) => {
          const p = logged.find((x) => x.date === d);
          return p ? 0.5 * calorieAdherence(p.calories!, calorieTarget) + 0.5 * proteinAdherence(p.proteinG!, proteinTarget) : 0;
        })
        .reduce((t, x) => t + x, 0) / nutritionDays
    : 0;

  // ---- activity
  const workoutDefs = data.activities.filter((a) => a.kind === 'workout' && !a.archived);
  const perWeek = plannedSessionsPerWeek(workoutDefs);
  const workoutLogs = data.logs.filter((l) => l.date >= start && l.date <= end && workoutDefs.some((d) => d.id === l.activityId));
  // A single-day range measures week-to-date pace so rest days aren't penalised.
  const weekStart = startOfWeek(end, settings.weekStartsOn);
  const singleDay = start === end;
  const paceLogs = singleDay ? data.logs.filter((l) => l.date >= weekStart && l.date <= end && workoutDefs.some((d) => d.id === l.activityId)) : workoutLogs;
  const elapsed = singleDay ? diffDays(end, weekStart) + 1 : keys.length;
  const planned = r1((perWeek * elapsed) / 7);
  const minutesByName: Record<string, number> = {};
  for (const l of workoutLogs) {
    const n = workoutDefs.find((d) => d.id === l.activityId)!.name;
    minutesByName[n] = (minutesByName[n] ?? 0) + (l.durationMin ?? l.value ?? 0);
  }
  const activeDates = new Set(workoutLogs.map((l) => l.date));
  const inactiveWeekdays = keys.length > 1 ? keys.filter((d) => isPast(d) && !activeDates.has(d)).map((d) => WEEKDAY_NAMES[weekday(d)]) : [];
  const activity = {
    sessions: workoutLogs.length,
    planned: r1((perWeek * keys.length) / 7),
    minutes: workoutLogs.reduce((t, l) => t + (l.durationMin ?? l.value ?? 0), 0),
    burned: workoutLogs.reduce((t, l) => t + (l.caloriesBurnedEst ?? 0), 0),
    activeDays: activeDates.size,
    inactiveWeekdays,
    minutesByName,
    topName: Object.entries(minutesByName).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
  const activityScore = planned > 0 ? Math.min(1, paceLogs.length / planned) : 0;

  // ---- habits & workouts adherence
  const habitStats: HabitStat[] = data.activities
    .filter((a) => !a.archived && a.special !== 'sleep')
    .map((a) => {
      const ad = adherence(a, idx, start, end, today);
      const done = doneDatesFor(a, idx, addDays(today, -180), today);
      const s = computeStreak(a, done, activeFrom(a, idx), today, settings.graceDaysPerWeek, settings.weekStartsOn);
      const missed = a.schedule.type === 'weekly' ? [] : keys.filter((d) => isPast(d) && isScheduledOn(a, d) && d >= activeFrom(a, idx) && !done.has(d)).map((d) => WEEKDAY_NAMES[weekday(d)]);
      return { id: a.id, name: a.name, kind: a.kind, done: ad.done, expected: ad.expected, rate: r0(ad.rate * 100), streak: s.current, streakUnit: s.unit, missedWeekdays: missed };
    });
  const habitOnly = habitStats.filter((h) => h.kind === 'habit' && h.expected > 0);
  const habitsScore = habitOnly.length ? mean(habitOnly.map((h) => h.rate / 100)) : 0;

  // ---- sleep
  const targetH = (goal?.sleepTargetMin ?? 450) / 60;
  const nights = series.filter((p) => p.sleepH != null);
  const sleep = {
    nights: nights.length,
    avgHours: r1(mean(nights.map((p) => p.sleepH!))),
    targetHours: r1(targetH),
    under6: nights.filter((p) => p.sleepH! < 6).length,
    onTarget: nights.filter((p) => p.sleepH! >= targetH - 0.5).length,
    bedtimeSdMin: r0(sd(nights.map((p) => p.bedtimeMin!))),
  };
  const sleepScore = nights.length ? mean(nights.map((p) => sleepAdherence(p.sleepH!, targetH))) : 0;

  // ---- weight
  const weights = series.filter((p) => p.weightKg != null);
  const weight = {
    entries: weights.length,
    first: weights[0]?.weightKg ?? null,
    last: weights[weights.length - 1]?.weightKg ?? null,
    change: weights.length >= 2 ? r1(weights[weights.length - 1].weightKg! - weights[0].weightKg!) : null,
    target: goal?.targetWeightKg ?? null,
  };

  // ---- mood ↔ sleep correlation (simple split, needs enough data on both sides)
  const moods = series.filter((p) => p.energy != null);
  const good = moods.filter((p) => p.sleepH != null && p.sleepH >= 7).map((p) => p.energy!);
  const low = moods.filter((p) => p.sleepH != null && p.sleepH < 7).map((p) => p.energy!);
  const mood = {
    entries: moods.length,
    avgEnergy: moods.length ? r1(mean(moods.map((p) => p.energy!))) : null,
    energyGoodSleep: good.length >= 3 ? r1(mean(good)) : null,
    energyLowSleep: low.length >= 3 ? r1(mean(low)) : null,
  };

  // ---- consistency score (transparent, components without data are excluded and weights renormalised)
  const hasFoodHabit = data.food.some((f) => f.date >= addDays(end, -13) && f.date <= end);
  const sleepTracked = data.activities.some((a) => a.special === 'sleep' && !a.archived) || nights.length > 0;
  const breakdown: ScoreComponent[] = [
    {
      key: 'nutrition',
      label: 'Nutrition',
      weight: SCORE_WEIGHTS.nutrition,
      score: hasFoodHabit && nutritionDays ? nutritionScore : null,
      detail: hasFoodHabit
        ? `Calories within ±10% of ${calorieTarget.toLocaleString()} kcal and protein ≥90% of ${proteinTarget} g, averaged over ${nutritionDays} day${nutritionDays === 1 ? '' : 's'} (unlogged days count as 0). Logged ${nutrition.loggedDays}.`
        : 'Not included — no food logged in the last 2 weeks.',
    },
    {
      key: 'activity',
      label: 'Activity',
      weight: SCORE_WEIGHTS.activity,
      score: planned > 0 ? activityScore : null,
      detail:
        planned > 0
          ? singleDay
            ? `Week-to-date pace: ${paceLogs.length} of ${planned} planned sessions so far this week.`
            : `${workoutLogs.length} of ${activity.planned} planned sessions.`
          : 'Not included — no workouts planned.',
    },
    {
      key: 'habits',
      label: 'Habits',
      weight: SCORE_WEIGHTS.habits,
      score: habitOnly.length ? habitsScore : null,
      detail: habitOnly.length ? `Average completion across ${habitOnly.length} habit${habitOnly.length === 1 ? '' : 's'} (an unfinished today doesn't count against you).` : 'Not included — no scheduled habits yet.',
    },
    {
      key: 'sleep',
      label: 'Sleep',
      weight: SCORE_WEIGHTS.sleep,
      score: sleepTracked && nights.length ? sleepScore : null,
      detail: sleepTracked ? (nights.length ? `Nights within 30 min of ${r1(targetH)} h get full marks, fading to zero at 3 h short. ${nights.length} night${nights.length === 1 ? '' : 's'} logged.` : 'Not included — no sleep logged in this period.') : 'Not included — sleep isn’t tracked.',
    },
  ];
  const included = breakdown.filter((b) => b.score != null);
  const totalW = included.reduce((t, b) => t + b.weight, 0);
  const score = totalW ? r0((included.reduce((t, b) => t + b.weight * (b.score ?? 0), 0) / totalW) * 100) : 0;

  return { start, end, days: keys.length, goalType: goal?.type ?? null, nutrition, activity, habits: habitStats, sleep, weight, mood, score, breakdown };
}

/** Daily score trend for charts (each day scored on its own). */
export function scoreSeries(start: DateKey, end: DateKey, data: RangeData, goal: Goal | null | undefined, settings: Pick<Settings, 'graceDaysPerWeek' | 'weekStartsOn'>, today: DateKey) {
  return rangeKeys(start, end > today ? today : end).map((d) => ({ date: d, score: computeRangeStats(d, d, data, goal, settings, today).score }));
}
