import { describe, expect, it } from 'vitest';
import { adherence, computeStreak, indexLogs, isDoneValue } from '@/domain/habits';
import { addDays, rangeKeys } from '@/domain/dates';
import type { ActivityDef, ActivityLog } from '@/db/types';

const def = (o: Partial<ActivityDef> = {}): ActivityDef => ({
  id: 'h', name: 'Read', kind: 'habit', trackingType: 'check', schedule: { type: 'daily' }, color: '', icon: '',
  archived: false, order: 0, aggregate: 'sum', createdAt: 0, ...o,
});
const T = '2026-03-20'; // a Friday
const done = (keys: string[]) => new Set(keys);

describe('daily streak with grace', () => {
  it('counts consecutive done days; today pending does not break', () => {
    const s = computeStreak(def(), done(rangeKeys(addDays(T, -5), addDays(T, -1))), addDays(T, -30), T, 1);
    expect(s.current).toBe(5);
    expect(s.pendingToday).toBe(true);
  });

  it('one miss in a week is forgiven', () => {
    const days = rangeKeys(addDays(T, -9), T).filter((d) => d !== addDays(T, -3));
    const s = computeStreak(def(), done(days), addDays(T, -30), T, 1);
    expect(s.current).toBe(9);
    expect(s.graceDays).toEqual([addDays(T, -3)]);
  });

  it('two misses inside 7 days break the streak with 1 grace/week', () => {
    const days = rangeKeys(addDays(T, -9), T).filter((d) => d !== addDays(T, -3) && d !== addDays(T, -5));
    const s = computeStreak(def(), done(days), addDays(T, -30), T, 1);
    expect(s.current).toBe(3); // T-2..T
    expect(s.best).toBe(5); // T-9..T-4 survived the first (graced) miss
  });

  it('with grace 0 any miss resets', () => {
    const days = rangeKeys(addDays(T, -9), T).filter((d) => d !== addDays(T, -3));
    expect(computeStreak(def(), done(days), addDays(T, -30), T, 0).current).toBe(3);
  });

  it('weekday schedules skip unscheduled days', () => {
    const d = def({ schedule: { type: 'weekdays', days: [1, 3, 5] } }); // Mon Wed Fri
    // Mon 16, Wed 18, Fri 20
    const s = computeStreak(d, done(['2026-03-09', '2026-03-11', '2026-03-13', '2026-03-16', '2026-03-18', '2026-03-20']), '2026-03-01', T, 0);
    expect(s.current).toBe(6);
  });
});

describe('weekly streak', () => {
  it('counts weeks meeting X-times target, current week pending', () => {
    const d = def({ kind: 'workout', schedule: { type: 'weekly', times: 2 } });
    // weeks (Mon start): Mar 2, Mar 9, Mar 16
    const s = computeStreak(d, done(['2026-03-03', '2026-03-05', '2026-03-10', '2026-03-12', '2026-03-17']), '2026-03-02', T, 1);
    expect(s.unit).toBe('weeks');
    expect(s.current).toBe(2);
    expect(s.pendingToday).toBe(true);
  });
});

describe('completion', () => {
  it('numeric habits need the target, avoid habits need a yes', () => {
    expect(isDoneValue(def({ trackingType: 'numeric', target: 3000 }), 2500)).toBe(false);
    expect(isDoneValue(def({ trackingType: 'numeric', target: 3000 }), 3000)).toBe(true);
    expect(isDoneValue(def({ trackingType: 'avoid' }), 0)).toBe(false);
    expect(isDoneValue(def({ trackingType: 'avoid' }), 1)).toBe(true);
    expect(isDoneValue(def({ kind: 'workout', trackingType: 'duration', target: 30 }), 10)).toBe(true);
  });

  it('adherence ignores an unfinished today', () => {
    const logs: ActivityLog[] = rangeKeys(addDays(T, -6), addDays(T, -1))
      .filter((_, i) => i % 2 === 0)
      .map((date, i) => ({ id: String(i), activityId: 'h', date, value: 1, createdAt: i }));
    const a = adherence(def(), indexLogs(logs), addDays(T, -6), T, T);
    expect(a.expected).toBe(6);
    expect(a.done).toBe(3);
  });
});
