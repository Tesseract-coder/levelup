import type { Exercise, SessionExercise, StrengthSession } from '@/db/types';
import { PAUSE_THRESHOLD_MIN } from '@/config/strength';
import { estimateSession } from './calories';
import { hasValues } from './session';
import { sessionVolume } from './metrics';

export interface FinalizeCtx {
  lookup: (id: string) => Exercise;
  bodyWeightKg?: number;
  includeWarmups: boolean;
  /** Per-exercise "count both hands" overrides. */
  countBothHands?: (id: string) => boolean | undefined;
  /** Rest between sets for an exercise entry (entry → pref → setting → library default). */
  restOf: (e: SessionExercise) => number;
  now: number;
}

/** Drop empty sets/exercises. Filled-in unticked sets are either counted as done or dropped. */
export function cleanSession(s: StrengthSession, markFilledDone: boolean): StrengthSession {
  const exercises = s.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((x) => hasValues(x) && (markFilledDone || x.completed)).map((x) => (x.completed ? x : { ...x, completed: true })) }))
    .filter((e) => e.sets.length > 0);
  return { ...s, exercises, exerciseIds: [...new Set(exercises.map((e) => e.exerciseId))] };
}

/** Filled-in sets that weren't ticked off (asked about at finish in live mode). */
export function unticked(s: StrengthSession): number {
  return s.exercises.reduce((t, e) => t + e.sets.filter((x) => hasValues(x) && !x.completed).length, 0);
}

/**
 * Live mode: wall-clock time from start, minus explicit pauses and minus any gap
 * longer than the pause threshold between logged sets (e.g. a phone call mid-workout).
 */
export function liveActiveMinutes(s: Pick<StrengthSession, 'startedAt' | 'endedAt' | 'pausedMs' | 'exercises'>, now: number): number {
  const end = s.endedAt ?? now;
  let ms = Math.max(0, end - s.startedAt - (s.pausedMs ?? 0));
  const stamps = s.exercises
    .flatMap((e) => e.sets.map((x) => x.completedAt))
    .filter((t): t is number => t != null)
    .sort((a, b) => a - b);
  const points = [s.startedAt, ...stamps, end];
  const threshold = PAUSE_THRESHOLD_MIN * 60_000;
  for (let i = 1; i < points.length; i++) {
    const gap = points[i] - points[i - 1];
    if (gap > threshold) ms -= gap - threshold;
  }
  return Math.max(1, Math.round(ms / 60_000));
}

/** Turn an in-progress (or edited) session into its saved form: cleaned, timed, totalled, estimated. */
export function finalizeSession(raw: StrengthSession, ctx: FinalizeCtx, opts: { markFilledDone: boolean }): StrengthSession {
  let s = cleanSession(raw, opts.markFilledDone);
  const liveRun = s.mode === 'live' && raw.status === 'in_progress';
  const given = liveRun ? liveActiveMinutes({ ...s, endedAt: ctx.now }, ctx.now) : Math.round(s.durationMin || 0);
  const bodyWeightKg = s.bodyWeightKg ?? ctx.bodyWeightKg;
  const est = estimateSession({ ...s, durationMin: given }, { lookup: ctx.lookup, restOf: ctx.restOf, bodyWeightKg });
  const durationMin = est.minutes;
  s = {
    ...s,
    durationMin,
    bodyWeightKg,
    intensity: est.intensity,
    endedAt: liveRun ? ctx.now : s.startedAt + durationMin * 60_000,
    exercises: s.exercises.map((e, i) => ({ ...e, kcalShare: est.shares[i] })),
  };
  return {
    ...s,
    status: 'done',
    totalVolumeKg: sessionVolume(s, ctx.lookup, { includeWarmups: ctx.includeWarmups, prefs: ctx.countBothHands }),
    kcalMethod: 'met',
    kcalEstimate: est.range.mid,
    kcalLow: est.range.low,
    kcalHigh: est.range.high,
  };
}
