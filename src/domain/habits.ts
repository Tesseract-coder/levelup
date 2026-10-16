import type { ActivityDef, ActivityLog, DateKey, SleepLog } from '@/db/types';
import { addDays, diffDays, rangeKeys, startOfWeek, weekday } from './dates';

export function isScheduledOn(def: ActivityDef, date: DateKey): boolean {
  switch (def.schedule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return def.schedule.days.includes(weekday(date));
    case 'weekly':
      return true; // flexible: any day can count toward "X times per week"
  }
}

export function scheduleLabel(def: ActivityDef): string {
  const s = def.schedule;
  if (s.type === 'daily') return 'Every day';
  if (s.type === 'weekly') return `${s.times}× per week`;
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (s.days.length === 5 && [1, 2, 3, 4, 5].every((d) => s.days.includes(d))) return 'Weekdays';
  return s.days.map((d) => names[d]).join(', ');
}

export function targetLabel(def: ActivityDef): string {
  if (def.trackingType === 'avoid') return 'Avoid';
  if (def.trackingType === 'check') return def.kind === 'workout' ? 'Session' : 'Done';
  if (def.target == null) return '';
  return `${formatValue(def, def.target)}`;
}

export function formatValue(def: Pick<ActivityDef, 'unit' | 'trackingType' | 'special'>, v: number): string {
  if (def.special === 'water') return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)} L` : `${Math.round(v)} ml`;
  if (def.special === 'steps') return `${Math.round(v).toLocaleString()} steps`;
  if (def.unit === 'h') return `${Number(v.toFixed(1))} h`;
  if (def.unit === 'min') return v >= 60 && v % 60 === 0 ? `${v / 60} h` : `${Math.round(v)} min`;
  if (def.unit) return `${Number(v.toFixed(1))} ${def.unit}`;
  return String(Math.round(v));
}

export interface DayIndex {
  /** activityId → date → logs */
  logs: Map<string, Map<DateKey, ActivityLog[]>>;
  sleep: Map<DateKey, SleepLog>;
}

export function indexLogs(logs: ActivityLog[], sleep: SleepLog[] = []): DayIndex {
  const m = new Map<string, Map<DateKey, ActivityLog[]>>();
  for (const l of logs) {
    let byDate = m.get(l.activityId);
    if (!byDate) m.set(l.activityId, (byDate = new Map()));
    const arr = byDate.get(l.date);
    if (arr) arr.push(l);
    else byDate.set(l.date, [l]);
  }
  for (const byDate of m.values()) for (const arr of byDate.values()) arr.sort((a, b) => a.createdAt - b.createdAt);
  return { logs: m, sleep: new Map(sleep.map((s) => [s.date, s])) };
}

export function logsOn(idx: DayIndex, activityId: string, date: DateKey): ActivityLog[] {
  return idx.logs.get(activityId)?.get(date) ?? [];
}

/** The day's value for a definition: summed, latest, or derived from sleep logs. `null` = nothing logged. */
export function dayValue(def: ActivityDef, date: DateKey, idx: DayIndex): number | null {
  if (def.special === 'sleep') {
    const s = idx.sleep.get(date);
    if (s) return s.durationMin / 60;
  }
  const logs = logsOn(idx, def.id, date);
  if (!logs.length) return null;
  if (def.kind === 'workout') return logs.reduce((t, l) => t + (l.durationMin ?? l.value ?? 0), 0);
  if (def.trackingType === 'avoid' || def.aggregate === 'last') return logs[logs.length - 1].value;
  return logs.reduce((t, l) => t + (l.value ?? 0), 0);
}

export type DayStatus = 'done' | 'partial' | 'missed' | 'slipped' | 'none';

/** Whether a definition counts as complete for a day. Workouts count once any session is logged. */
export function isDoneValue(def: ActivityDef, value: number | null): boolean {
  if (value == null) return false;
  if (def.kind === 'workout') return true;
  switch (def.trackingType) {
    case 'check':
      return value >= 1;
    case 'avoid':
      return value >= 1;
    default:
      return def.target ? value >= def.target - 1e-9 : value > 0;
  }
}

export function dayStatus(def: ActivityDef, date: DateKey, idx: DayIndex): DayStatus {
  const v = dayValue(def, date, idx);
  if (v == null) return 'none';
  if (isDoneValue(def, v)) return 'done';
  if (def.trackingType === 'avoid') return 'slipped';
  return v > 0 ? 'partial' : 'none';
}

export function progressFraction(def: ActivityDef, value: number | null): number {
  if (value == null) return 0;
  if (def.trackingType === 'check' || def.trackingType === 'avoid' || def.kind === 'workout') return isDoneValue(def, value) ? 1 : 0;
  if (!def.target) return value > 0 ? 1 : 0;
  return Math.min(1, value / def.target);
}

export interface StreakResult {
  current: number;
  best: number;
  unit: 'days' | 'weeks';
  /** Dates where a grace day protected the streak. */
  graceDays: DateKey[];
  /** True when today isn't done yet but the streak is still alive. */
  pendingToday: boolean;
}

/**
 * Streaks with grace. For day-based schedules, up to `gracePerWeek` missed scheduled days in any rolling
 * 7-day window are forgiven (the streak pauses instead of resetting). Today is never a miss — it's pending.
 * For "X times per week" schedules the streak counts consecutive weeks where the target was met; the
 * current week is pending until it ends.
 */
export function computeStreak(
  def: ActivityDef,
  doneDates: Set<DateKey>,
  start: DateKey,
  today: DateKey,
  gracePerWeek: number,
  weekStartsOn: 0 | 1 = 1,
): StreakResult {
  if (start > today) return { current: 0, best: 0, unit: 'days', graceDays: [], pendingToday: false };

  if (def.schedule.type === 'weekly') {
    const times = Math.max(1, def.schedule.times);
    let run = 0;
    let best = 0;
    const thisWeek = startOfWeek(today, weekStartsOn);
    for (let w = startOfWeek(start, weekStartsOn); w <= thisWeek; w = addDays(w, 7)) {
      let count = 0;
      for (let i = 0; i < 7; i++) if (doneDates.has(addDays(w, i))) count++;
      if (count >= times) {
        run++;
        best = Math.max(best, run);
      } else if (w !== thisWeek) {
        run = 0;
      }
    }
    const thisWeekCount = rangeKeys(thisWeek, today).filter((d) => doneDates.has(d)).length;
    return { current: run, best, unit: 'weeks', graceDays: [], pendingToday: thisWeekCount < times };
  }

  let run = 0;
  let best = 0;
  let graces: DateKey[] = [];
  for (const d of rangeKeys(start, today)) {
    if (!isScheduledOn(def, d)) continue;
    if (doneDates.has(d)) {
      run++;
      best = Math.max(best, run);
    } else if (d === today) {
      // pending, not a miss
    } else {
      const recent = graces.filter((g) => diffDays(d, g) < 7).length;
      if (run > 0 && recent < gracePerWeek) {
        graces.push(d);
      } else {
        run = 0;
        graces = [];
      }
    }
  }
  const pendingToday = isScheduledOn(def, today) && !doneDates.has(today);
  // Only report graces that belong to the current run.
  const currentGraces = run > 0 ? graces : [];
  return { current: run, best, unit: 'days', graceDays: currentGraces, pendingToday };
}

export function doneDatesFor(def: ActivityDef, idx: DayIndex, start: DateKey, end: DateKey): Set<DateKey> {
  const out = new Set<DateKey>();
  const byDate = idx.logs.get(def.id);
  if (def.special === 'sleep') {
    for (const [d, s] of idx.sleep) if (d >= start && d <= end && isDoneValue(def, s.durationMin / 60)) out.add(d);
  }
  if (byDate) for (const d of byDate.keys()) if (d >= start && d <= end && isDoneValue(def, dayValue(def, d, idx))) out.add(d);
  return out;
}

/** First day a definition could count: the earlier of its creation date and its first log. */
export function activeFrom(def: ActivityDef, idx: DayIndex): DateKey {
  const c = new Date(def.createdAt);
  const created = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`;
  let first = created;
  const byDate = idx.logs.get(def.id);
  if (byDate) for (const d of byDate.keys()) if (d < first) first = d;
  if (def.special === 'sleep') for (const d of idx.sleep.keys()) if (d < first) first = d;
  return first;
}

export interface Adherence {
  done: number;
  expected: number;
  rate: number; // 0..1
}

/**
 * Completion vs what was planned in [start, end]. Weekly schedules expect `times × days/7`.
 * Today only counts toward "expected" once it's done, so an unfinished today never lowers the rate.
 */
export function adherence(def: ActivityDef, idx: DayIndex, rangeStart: DateKey, end: DateKey, today: DateKey): Adherence {
  const from = activeFrom(def, idx);
  const start = from > rangeStart ? from : rangeStart;
  if (start > end) return { done: 0, expected: 0, rate: 0 };
  const done = doneDatesFor(def, idx, start, end);
  const days = rangeKeys(start, end > today ? today : end);
  if (def.schedule.type === 'weekly') {
    const pastDays = days.filter((d) => d !== today || done.has(d)).length;
    const expected = (def.schedule.times * pastDays) / 7;
    const count = days.filter((d) => done.has(d)).length;
    return { done: count, expected: Math.round(expected * 10) / 10, rate: expected > 0 ? Math.min(1, count / expected) : count > 0 ? 1 : 0 };
  }
  let expected = 0;
  let count = 0;
  for (const d of days) {
    if (!isScheduledOn(def, d)) continue;
    const isDone = done.has(d);
    if (d === today && !isDone) continue;
    expected++;
    if (isDone) count++;
  }
  return { done: count, expected, rate: expected ? count / expected : 0 };
}
