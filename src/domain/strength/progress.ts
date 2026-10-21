import type { DateKey, DayType, Exercise, StrengthSession } from '@/db/types';
import { addDays, diffDays, startOfWeek } from '@/domain/dates';
import { exerciseSessionStats, type MetricOpts } from './metrics';
import { MUSCLE_GROUP_OF, type MuscleGroup } from './library';
import { observedRests } from './calories';

/** Deterministic progress analytics for charts and the Strength dashboard. */

export interface ExercisePoint {
  date: DateKey;
  sessionId: string;
  maxWeightKg: number;
  e1rm: number | null;
  volumeKg: number;
  bestReps: number;
  totalReps: number;
  sets: number;
  maxDurationSec: number;
}

type OptsFor = (s: StrengthSession, exerciseId: string) => MetricOpts;

export function exerciseHistory(exerciseId: string, sessions: StrengthSession[], lookup: (id: string) => Exercise, opts: OptsFor = () => ({})): ExercisePoint[] {
  const ex = lookup(exerciseId);
  const out: ExercisePoint[] = [];
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    for (const e of s.exercises) {
      if (e.exerciseId !== exerciseId) continue;
      const st = exerciseSessionStats(e, ex, opts(s, exerciseId));
      if (!st.workingSets) continue;
      out.push({ date: s.date, sessionId: s.id, maxWeightKg: st.maxWeightKg, e1rm: st.bestE1rm, volumeKg: st.volumeKg, bestReps: st.maxReps, totalReps: st.totalReps, sets: st.workingSets, maxDurationSec: st.maxDurationSec });
    }
  }
  return out;
}

/** Average observed rest for an exercise in live sessions (seconds), or null. */
export function averageRest(exerciseId: string, sessions: StrengthSession[]): number | null {
  const rests = sessions.filter((s) => s.mode === 'live').flatMap((s) => observedRests({ exercises: s.exercises.filter((e) => e.exerciseId === exerciseId) }));
  return rests.length ? Math.round(rests.reduce((a, b) => a + b, 0) / rests.length) : null;
}

/** Sessions per week over the last `weeks` weeks (ending today). */
export function frequencyPerWeek(points: { date: DateKey }[], today: DateKey, weeks = 8): number {
  const from = addDays(today, -weeks * 7 + 1);
  const n = new Set(points.filter((p) => p.date >= from && p.date <= today).map((p) => p.date)).size;
  return Math.round((n / weeks) * 10) / 10;
}

/** Hard sets per muscle group: 1 per working set for primary muscles, ½ for secondary. */
export function setsByMuscle(sessions: StrengthSession[], lookup: (id: string) => Exercise): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>;
  for (const s of sessions)
    for (const e of s.exercises) {
      const ex = lookup(e.exerciseId);
      const n = e.sets.filter((x) => x.completed && x.type !== 'warmup').length;
      if (!n) continue;
      const prim = new Set(ex.primaryMuscles.map((m) => MUSCLE_GROUP_OF[m]));
      const sec = new Set(ex.secondaryMuscles.map((m) => MUSCLE_GROUP_OF[m]).filter((g) => !prim.has(g)));
      for (const g of prim) out[g] = (out[g] ?? 0) + n;
      for (const g of sec) out[g] = (out[g] ?? 0) + n / 2;
    }
  return out;
}

export interface WeekRow {
  week: DateKey;
  sessions: number;
  volumeKg: number;
  byDayType: Partial<Record<DayType | 'other', number>>;
}

export function weeklyRows(sessions: StrengthSession[], start: DateKey, end: DateKey, weekStartsOn: 0 | 1): WeekRow[] {
  const rows = new Map<DateKey, WeekRow>();
  for (let w = startOfWeek(start, weekStartsOn); w <= end; w = addDays(w, 7)) rows.set(w, { week: w, sessions: 0, volumeKg: 0, byDayType: {} });
  for (const s of sessions) {
    if (s.date < start || s.date > end) continue;
    const r = rows.get(startOfWeek(s.date, weekStartsOn));
    if (!r) continue;
    r.sessions++;
    r.volumeKg += s.totalVolumeKg;
    const key = (s.dayTypes.find((d) => d !== 'custom') ?? 'other') as DayType | 'other';
    r.byDayType[key] = (r.byDayType[key] ?? 0) + 1;
  }
  return [...rows.values()];
}

/** Push vs pull and upper vs lower, in working sets. */
export function balance(sessions: StrengthSession[], lookup: (id: string) => Exercise) {
  const b = { push: 0, pull: 0, upper: 0, lower: 0 };
  const LOWER: MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves'];
  for (const s of sessions)
    for (const e of s.exercises) {
      const ex = lookup(e.exerciseId);
      const n = e.sets.filter((x) => x.completed && x.type !== 'warmup').length;
      if (ex.forceType === 'push') b.push += n;
      if (ex.forceType === 'pull') b.pull += n;
      const groups = ex.primaryMuscles.map((m) => MUSCLE_GROUP_OF[m]);
      if (groups.some((g) => LOWER.includes(g))) b.lower += n;
      else if (!groups.includes('core')) b.upper += n;
    }
  return b;
}

/** Areas trained before (last 8 weeks) but not in the last `days` days. */
export const AREAS: { key: string; label: string; groups: MuscleGroup[] }[] = [
  { key: 'chest', label: 'chest', groups: ['chest'] },
  { key: 'back', label: 'back', groups: ['back'] },
  { key: 'shoulders', label: 'shoulder', groups: ['shoulders'] },
  { key: 'legs', label: 'leg', groups: ['quads', 'hamstrings', 'glutes', 'calves'] },
  { key: 'arms', label: 'arm', groups: ['biceps', 'triceps'] },
  { key: 'core', label: 'core', groups: ['core'] },
];

export function neglected(sessions: StrengthSession[], lookup: (id: string) => Exercise, today: DateKey, days = 8): { label: string; daysSince: number }[] {
  const from = addDays(today, -56);
  const last = new Map<string, DateKey>();
  for (const s of sessions) {
    if (s.date < from || s.date > today) continue;
    for (const e of s.exercises) {
      if (!e.sets.some((x) => x.completed && x.type !== 'warmup')) continue;
      const groups = lookup(e.exerciseId).primaryMuscles.map((m) => MUSCLE_GROUP_OF[m]);
      for (const a of AREAS) if (a.groups.some((g) => groups.includes(g)) && (last.get(a.key) ?? '') < s.date) last.set(a.key, s.date);
    }
  }
  return AREAS.filter((a) => last.has(a.key))
    .map((a) => ({ label: a.label, daysSince: diffDays(today, last.get(a.key)!) }))
    .filter((x) => x.daysSince > days)
    .sort((a, b) => b.daysSince - a.daysSince);
}

/** Lifts whose best e1RM improved most over the window (first 2 vs last 2 sessions, ≥ 3 sessions). */
export function topImprovers(sessions: StrengthSession[], lookup: (id: string) => Exercise, today: DateKey, weeks = 6, limit = 3, opts: OptsFor = () => ({})) {
  const from = addDays(today, -weeks * 7);
  const inWindow = sessions.filter((s) => s.date >= from && s.date <= today);
  const ids = [...new Set(inWindow.flatMap((s) => s.exerciseIds))];
  const out: { exerciseId: string; pct: number; from: number; to: number }[] = [];
  for (const id of ids) {
    const pts = exerciseHistory(id, inWindow, lookup, opts).filter((p) => p.e1rm != null);
    if (pts.length < 3) continue;
    const a = Math.max(...pts.slice(0, 2).map((p) => p.e1rm!));
    const b = Math.max(...pts.slice(-2).map((p) => p.e1rm!));
    const pct = Math.round(((b - a) / a) * 100);
    if (pct > 0) out.push({ exerciseId: id, pct, from: a, to: b });
  }
  return out.sort((x, y) => y.pct - x.pct).slice(0, limit);
}
