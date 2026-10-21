import type { DateKey, DayType, Exercise, ExerciseSet, Routine, SessionExercise, SetType, StrengthSession } from '@/db/types';
import { newId } from '@/lib/id';
import { dayKeyOf, fitsDay } from './dayTypes';
import { LIBRARY } from './library';

/** Pure helpers for building and editing a strength session. */

export function newSession(input: { date: DateKey; dayTypes: DayType[]; customDayName?: string; mode: 'live' | 'quick'; startedAt?: number; durationMin?: number; routineId?: string; bodyWeightKg?: number }): StrengthSession {
  const now = Date.now();
  return {
    id: newId(),
    date: input.date,
    status: 'in_progress',
    mode: input.mode,
    startedAt: input.startedAt ?? now,
    durationMin: input.durationMin ?? 0,
    dayTypes: input.dayTypes,
    customDayName: input.customDayName?.trim() || undefined,
    routineId: input.routineId,
    intensity: 'moderate',
    intensityOverridden: false,
    kcalEstimate: 0,
    kcalLow: 0,
    kcalHigh: 0,
    kcalMethod: 'met',
    totalVolumeKg: 0,
    bodyWeightKg: input.bodyWeightKg,
    source: 'manual',
    exercises: [],
    exerciseIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** A fresh set. Copies the previous set's numbers (so "Add set" is one tap). */
export function newSet(from?: Partial<ExerciseSet>, type: SetType = from?.type === 'warmup' ? 'working' : from?.type ?? 'working', completed = false): ExerciseSet {
  return {
    id: newId(),
    type,
    weightKg: from?.weightKg,
    reps: from?.reps,
    durationSec: from?.durationSec,
    distanceM: from?.distanceM,
    addedWeightKg: from?.addedWeightKg,
    assistanceKg: from?.assistanceKg,
    completed,
  };
}

/** Sets prefilled from the last time (same count and numbers, not completed). */
export function setsFromPrevious(prev: ExerciseSet[] | undefined, fallbackCount = 3, completed = false): ExerciseSet[] {
  if (prev?.length) return prev.map((s) => ({ ...newSet(s, s.type), completed }));
  return Array.from({ length: fallbackCount }, () => newSet(undefined, 'working', completed));
}

export function sessionExercise(exerciseId: string, sets: ExerciseSet[], restSec?: number): SessionExercise {
  return { id: newId(), exerciseId, sets, restSec };
}

/** Sessions are ordered by date then start time. */
export const sessionOrder = (a: StrengthSession, b: StrengthSession) => (a.date === b.date ? a.startedAt - b.startedAt : a.date < b.date ? -1 : 1);

/** The most recent finished session (other than `excludeId`) that contains the exercise. */
export function lastSessionWith(exerciseId: string, sessions: StrengthSession[], excludeId?: string): { session: StrengthSession; entry: SessionExercise } | null {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.id === excludeId || s.status !== 'done') continue;
    const entry = s.exercises.find((e) => e.exerciseId === exerciseId && e.sets.some((x) => x.completed));
    if (entry) return { session: s, entry };
  }
  return null;
}

/** Previous session's sets, completed only, for the "Previous" column. */
export function previousSets(exerciseId: string, sessions: StrengthSession[], excludeId?: string): ExerciseSet[] {
  return lastSessionWith(exerciseId, sessions, excludeId)?.entry.sets.filter((s) => s.completed) ?? [];
}

/** The last finished session of the same day type. */
export function lastSameDay(dayTypes: DayType[], customName: string | undefined, sessions: StrengthSession[], excludeId?: string): StrengthSession | null {
  const key = dayKeyOf(dayTypes, customName);
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.id !== excludeId && s.status === 'done' && dayKeyOf(s.dayTypes, s.customDayName) === key) return s;
  }
  return null;
}

export interface Suggestion {
  exercise: Exercise;
  reason: 'last_time' | 'routine' | 'popular';
  previous?: ExerciseSet[];
}

/** "What should I do today?": last same-day session first, then library exercises for those muscles. */
export function suggestExercises(dayTypes: DayType[], customName: string | undefined, sessions: StrengthSession[], lookup: Map<string, Exercise>, limit = 24): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const last = lastSameDay(dayTypes, customName, sessions);
  for (const e of last?.exercises ?? []) {
    const ex = lookup.get(e.exerciseId);
    if (!ex || seen.has(ex.id)) continue;
    seen.add(ex.id);
    out.push({ exercise: ex, reason: 'last_time', previous: e.sets.filter((s) => s.completed) });
  }
  if (!dayTypes.length || dayTypes.every((d) => d === 'custom')) return out;
  // compounds first, then isolation, in library order (which is curated by popularity)
  const pool = LIBRARY.filter((e) => fitsDay(e, dayTypes) && !seen.has(e.id));
  const ranked = [...pool.filter((e) => e.mechanic === 'compound'), ...pool.filter((e) => e.mechanic === 'isolation')];
  for (const ex of ranked) {
    if (out.length >= limit) break;
    out.push({ exercise: ex, reason: 'popular' });
  }
  return out;
}

/** Routine → session exercises (target sets prefilled with last time's numbers when available). */
export function exercisesFromRoutine(r: Routine, sessions: StrengthSession[], completed = false): SessionExercise[] {
  return r.exercises.map((re) => {
    const prev = previousSets(re.exerciseId, sessions).filter((s) => s.type !== 'warmup');
    const sets = Array.from({ length: re.targetSets }, (_, i) => newSet(prev[i] ?? prev[prev.length - 1] ?? { reps: re.repMax }, 'working', completed));
    return { ...sessionExercise(re.exerciseId, sets, re.restSec), supersetGroup: re.supersetGroup };
  });
}

/** A set has something worth saving. */
export const hasValues = (s: ExerciseSet) => (s.reps ?? 0) > 0 || (s.durationSec ?? 0) > 0 || (s.distanceM ?? 0) > 0;

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
