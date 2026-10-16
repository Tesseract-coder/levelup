import type { ActivityDef, DateKey, FoodEntry, Goal, Settings } from '@/db/types';
import type { RangeData } from '@/db/repository';
import { addDays } from './dates';
import { computeStreak, dayStatus, dayValue, doneDatesFor, indexLogs, isScheduledOn, progressFraction, type DayIndex, type DayStatus, type StreakResult } from './habits';
import { sumMacros } from './nutrition';

export interface HabitRow {
  def: ActivityDef;
  value: number | null;
  status: DayStatus;
  progress: number;
  scheduled: boolean;
  streak: StreakResult;
  /** for "X per week": done so far this week */
  weekCount?: number;
}

export interface DayView {
  date: DateKey;
  food: FoodEntry[];
  totals: ReturnType<typeof sumMacros>;
  workouts: { def: ActivityDef; log: RangeData['logs'][number] }[];
  activeMinutes: number;
  activeTarget: number;
  burned: number;
  habits: HabitRow[];
  workoutDefs: HabitRow[];
  habitsDone: number;
  habitsScheduled: number;
  idx: DayIndex;
}

/** History window used for streaks on the Today screen. */
export const STREAK_LOOKBACK = 180;

export function computeDay(date: DateKey, data: RangeData, settings: Pick<Settings, 'graceDaysPerWeek' | 'weekStartsOn'>, goal?: Goal | null): DayView {
  const idx = indexLogs(data.logs, data.sleep);
  const food = data.food.filter((f) => f.date === date);
  const live = data.activities.filter((a) => !a.archived);
  const byId = new Map(data.activities.map((a) => [a.id, a]));
  const workouts = data.logs
    .filter((l) => l.date === date && byId.get(l.activityId)?.kind === 'workout')
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((log) => ({ def: byId.get(log.activityId)!, log }));
  const activeMinutes = workouts.reduce((t, w) => t + (w.log.durationMin ?? w.log.value ?? 0), 0);
  const burned = workouts.reduce((t, w) => t + (w.log.caloriesBurnedEst ?? 0), 0);

  const start = addDays(date, -STREAK_LOOKBACK);
  const row = (def: ActivityDef): HabitRow => {
    const value = dayValue(def, date, idx);
    const created = new Date(def.createdAt);
    const createdKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
    const done = doneDatesFor(def, idx, start, date);
    const firstLog = [...done].sort()[0];
    const from = [createdKey, firstLog].filter(Boolean).sort()[0] ?? createdKey;
    const streak = computeStreak(def, done, from < start ? start : from, date, settings.graceDaysPerWeek, settings.weekStartsOn);
    let weekCount: number | undefined;
    if (def.schedule.type === 'weekly') {
      weekCount = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(date, -i);
        if (done.has(d)) weekCount++;
        if (new Date(d + 'T12:00').getDay() === settings.weekStartsOn) break;
      }
    }
    return { def, value, status: dayStatus(def, date, idx), progress: progressFraction(def, value), scheduled: isScheduledOn(def, date), streak, weekCount };
  };
  const habits = live.filter((a) => a.kind === 'habit').map(row);
  const workoutDefs = live.filter((a) => a.kind === 'workout').map(row);
  const scheduledHabits = habits.filter((h) => h.scheduled && h.def.schedule.type !== 'weekly');
  // Planned active minutes per day: sum of weekly workout targets spread across the week.
  const activeTarget = Math.round(
    live.filter((a) => a.kind === 'workout').reduce((t, a) => t + (a.target ?? 30) * (a.schedule.type === 'weekly' ? a.schedule.times : a.schedule.type === 'daily' ? 7 : a.schedule.days.length), 0) / 7,
  );

  return {
    date,
    food,
    totals: sumMacros(food),
    workouts,
    activeMinutes,
    activeTarget: activeTarget || (goal ? 30 : 30),
    burned,
    habits,
    workoutDefs,
    habitsDone: scheduledHabits.filter((h) => h.status === 'done').length,
    habitsScheduled: scheduledHabits.length,
    idx,
  };
}
