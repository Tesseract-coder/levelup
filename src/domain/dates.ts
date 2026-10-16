import type { DateKey } from '@/db/types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date → `YYYY-MM-DD` (never via toISOString, which is UTC). */
export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a key as local noon (noon avoids DST edge cases when adding days). */
export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * The "logical" day for a moment in time. With a 4 a.m. boundary,
 * 1:30 a.m. on Tuesday still counts as Monday — good for night owls.
 */
export function dayKeyFor(now: Date, boundaryHour = 0): DateKey {
  const shifted = new Date(now.getTime() - boundaryHour * 3600_000);
  return toKey(shifted);
}

export function todayKey(boundaryHour = 0): DateKey {
  return dayKeyFor(new Date(), boundaryHour);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((fromKey(a).getTime() - fromKey(b).getTime()) / 86_400_000);
}

/** Inclusive list of keys from start to end. */
export function rangeKeys(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

export function weekday(key: DateKey): number {
  return fromKey(key).getDay();
}

export function startOfWeek(key: DateKey, weekStartsOn: 0 | 1 = 1): DateKey {
  const wd = weekday(key);
  const back = (wd - weekStartsOn + 7) % 7;
  return addDays(key, -back);
}

export function endOfWeek(key: DateKey, weekStartsOn: 0 | 1 = 1): DateKey {
  return addDays(startOfWeek(key, weekStartsOn), 6);
}

export function minKey(a: DateKey, b: DateKey) {
  return a < b ? a : b;
}
export function maxKey(a: DateKey, b: DateKey) {
  return a > b ? a : b;
}

const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekdayShort = (key: DateKey) => WD_SHORT[weekday(key)];
export const WEEKDAY_NAMES = WD_SHORT;

export function formatDay(key: DateKey, today: DateKey): string {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatShort(key: DateKey): string {
  return fromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatRange(start: DateKey, end: DateKey): string {
  return `${formatShort(start)} – ${formatShort(end)}`;
}

/** "HH:mm" → minutes after midnight */
export function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minToHm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Sleep duration from bedtime and wake time, crossing midnight when needed. */
export function sleepDuration(bedtime: string, wake: string): number {
  const b = hmToMin(bedtime);
  const w = hmToMin(wake);
  return w > b ? w - b : w + 1440 - b;
}

export function formatDuration(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${r} min`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
