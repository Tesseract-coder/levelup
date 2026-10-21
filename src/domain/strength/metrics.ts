import type { Exercise, ExerciseSet, SessionExercise, StrengthSession } from '@/db/types';
import { E1RM_MAX_REPS } from '@/config/strength';

/** Deterministic strength metrics. Weights are always kg; dumbbell weights are per hand. */

export interface MetricOpts {
  includeWarmups?: boolean;
  /** Needed for bodyweight exercises; without it only added weight counts. */
  bodyWeightKg?: number;
  /** User override of the library's bilateral-dumbbell rule. */
  countBothHands?: boolean;
}

export const round1 = (v: number) => Math.round(v * 10) / 10;

/** Counted sets: completed, and not a warm-up unless asked. */
export function countsForVolume(s: ExerciseSet, includeWarmups = false): boolean {
  return s.completed && (includeWarmups || s.type !== 'warmup');
}

const bothHands = (ex: Exercise, o: MetricOpts) => (o.countBothHands ?? ex.bilateralDumbbell) && ex.equipment === 'dumbbell';

/**
 * The load one rep moves, as entered (per hand for dumbbells).
 * Bodyweight: body weight + added − assistance (just added weight when body weight is unknown).
 */
export function effectiveLoadKg(s: ExerciseSet, ex: Exercise, o: MetricOpts = {}): number {
  if (ex.trackingType === 'bodyweight_reps') {
    const base = o.bodyWeightKg ?? 0;
    return Math.max(0, base + (s.addedWeightKg ?? 0) - (s.assistanceKg ?? 0));
  }
  return s.weightKg ?? 0;
}

/** weight × reps (× 2 for bilateral dumbbell exercises). Timed/distance sets contribute no volume. */
export function setVolume(s: ExerciseSet, ex: Exercise, o: MetricOpts = {}): number {
  if (!countsForVolume(s, o.includeWarmups)) return 0;
  if (ex.trackingType === 'duration' || ex.trackingType === 'weight_duration' || ex.trackingType === 'distance') return 0;
  const reps = s.reps ?? 0;
  return effectiveLoadKg(s, ex, o) * reps * (bothHands(ex, o) ? 2 : 1);
}

export function exerciseVolume(se: SessionExercise, ex: Exercise, o: MetricOpts = {}): number {
  return round1(se.sets.reduce((t, s) => t + setVolume(s, ex, o), 0));
}

export function sessionVolume(session: Pick<StrengthSession, 'exercises' | 'bodyWeightKg'>, lookup: (id: string) => Exercise, o: Omit<MetricOpts, 'bodyWeightKg' | 'countBothHands'> & { prefs?: (id: string) => boolean | undefined } = {}): number {
  return round1(
    session.exercises.reduce((t, se) => t + exerciseVolume(se, lookup(se.exerciseId), { includeWarmups: o.includeWarmups, bodyWeightKg: session.bodyWeightKg, countBothHands: o.prefs?.(se.exerciseId) }), 0),
  );
}

/** Epley estimated 1RM. Only reliable for 1–12 reps; returns null outside that. */
export function e1rm(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !(reps >= 1) || reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return round1(weightKg);
  return round1(weightKg * (1 + reps / 30));
}

export function setE1rm(s: ExerciseSet, ex: Exercise, o: MetricOpts = {}): number | null {
  if (s.type === 'warmup' || !s.completed) return null;
  if (ex.trackingType !== 'weight_reps' && ex.trackingType !== 'bodyweight_reps') return null;
  return e1rm(effectiveLoadKg(s, ex, o), s.reps ?? 0);
}

export interface ExerciseSessionStats {
  /** Heaviest working-set weight (per hand for dumbbells; added weight for bodyweight). */
  maxWeightKg: number;
  bestE1rm: number | null;
  bestSet: ExerciseSet | null;
  volumeKg: number;
  totalReps: number;
  maxReps: number;
  workingSets: number;
  /** Timed exercises. */
  totalDurationSec: number;
  maxDurationSec: number;
  totalDistanceM: number;
}

export function exerciseSessionStats(se: SessionExercise, ex: Exercise, o: MetricOpts = {}): ExerciseSessionStats {
  const working = se.sets.filter((s) => s.completed && s.type !== 'warmup');
  let bestE1rm: number | null = null;
  let bestSet: ExerciseSet | null = null;
  for (const s of working) {
    const v = setE1rm(s, ex, o);
    if (v != null && (bestE1rm == null || v > bestE1rm)) {
      bestE1rm = v;
      bestSet = s;
    }
  }
  const weightOf = (s: ExerciseSet) => (ex.trackingType === 'bodyweight_reps' ? s.addedWeightKg ?? 0 : s.weightKg ?? 0);
  if (!bestSet && working.length) bestSet = [...working].sort((a, b) => weightOf(b) - weightOf(a) || (b.reps ?? 0) - (a.reps ?? 0) || (b.durationSec ?? 0) - (a.durationSec ?? 0))[0];
  return {
    maxWeightKg: Math.max(0, ...working.map(weightOf)),
    bestE1rm,
    bestSet,
    volumeKg: exerciseVolume(se, ex, o),
    totalReps: working.reduce((t, s) => t + (s.reps ?? 0), 0),
    maxReps: Math.max(0, ...working.map((s) => s.reps ?? 0)),
    workingSets: working.length,
    totalDurationSec: working.reduce((t, s) => t + (s.durationSec ?? 0), 0),
    maxDurationSec: Math.max(0, ...working.map((s) => s.durationSec ?? 0)),
    totalDistanceM: working.reduce((t, s) => t + (s.distanceM ?? 0), 0),
  };
}

export function sessionTotals(session: Pick<StrengthSession, 'exercises'>) {
  let sets = 0;
  let reps = 0;
  for (const se of session.exercises)
    for (const s of se.sets) {
      if (!s.completed || s.type === 'warmup') continue;
      sets++;
      reps += s.reps ?? 0;
    }
  return { exercises: session.exercises.filter((e) => e.sets.some((s) => s.completed)).length, sets, reps };
}
