import type { Exercise, SessionExercise, StrengthIntensity, StrengthSession } from '@/db/types';
import { LOAD_FACTOR, MET_RANGE, SEC_PER_REP, STRENGTH_MET } from '@/config/strength';

/**
 * Strength-training calorie estimates (MET method). Always a range — resistance
 * training burn varies a lot between people and sessions. EPOC ("afterburn") is small and not included.
 */

export const DEFAULT_BODY_WEIGHT_KG = 70;

export interface KcalRange {
  low: number;
  mid: number;
  high: number;
}

const r5 = (v: number) => Math.round(v / 5) * 5;

/** kcal = MET × kg × hours, reported at MET − 1 … MET + 1. */
export function kcalRange(met: number, weightKg: number, minutes: number): KcalRange {
  const k = (m: number) => (Math.max(1, m) * weightKg * minutes) / 60;
  return { low: r5(k(met - MET_RANGE)), mid: r5(k(met)), high: r5(k(met + MET_RANGE)) };
}

const working = (e: SessionExercise) => e.sets.filter((s) => s.completed);

/** Seconds of work in a set: timed sets use their duration, rep sets ~3 s per rep. */
const workSec = (s: { reps?: number; durationSec?: number }) => s.durationSec ?? (s.reps ?? 0) * SEC_PER_REP;

/** Rest actually taken between consecutive sets (live mode, from tick timestamps), in seconds. */
export function observedRests(s: Pick<StrengthSession, 'exercises'>): number[] {
  const out: number[] = [];
  for (const e of s.exercises) {
    const t = e.sets.map((x) => x.completedAt).filter((x): x is number => x != null).sort((a, b) => a - b);
    for (let i = 1; i < t.length; i++) {
      const gap = (t[i] - t[i - 1]) / 1000;
      if (gap > 0 && gap < 15 * 60) out.push(gap);
    }
  }
  return out;
}

export interface IntensityResult {
  intensity: StrengthIntensity;
  /** Human-readable reasons, for the info sheet. */
  reasons: string[];
}

/** Derive intensity from RPE, compound share, rest and supersets. Score ≥ 2 → vigorous, ≤ −2 → light. */
export function deriveIntensity(s: Pick<StrengthSession, 'exercises' | 'mode'>, lookup: (id: string) => Exercise, restOf: (e: SessionExercise) => number): IntensityResult {
  let score = 0;
  const reasons: string[] = [];
  const sets = s.exercises.flatMap(working).filter((x) => x.type !== 'warmup');
  const rpes = sets.map((x) => x.rpe ?? (x.rir != null ? 10 - x.rir : undefined)).filter((x): x is number => x != null);
  if (rpes.length) {
    const avg = rpes.reduce((a, b) => a + b, 0) / rpes.length;
    if (avg >= 8) {
      score += 2;
      reasons.push(`High effort (average RPE ${avg.toFixed(1)})`);
    } else if (avg <= 6) {
      score -= 1;
      reasons.push(`Easy effort (average RPE ${avg.toFixed(1)})`);
    }
  }
  const failure = sets.filter((x) => x.type === 'failure' || x.type === 'drop').length;
  if (failure >= 3) {
    score += 1;
    reasons.push(`${failure} drop or to-failure sets`);
  }
  const done = s.exercises.filter((e) => working(e).length);
  if (done.length) {
    const compound = done.filter((e) => lookup(e.exerciseId).mechanic === 'compound').length / done.length;
    if (compound >= 0.6) {
      score += 1;
      reasons.push(`Mostly compound lifts (${Math.round(compound * 100)}%)`);
    } else if (compound <= 0.3) {
      score -= 1;
      reasons.push(`Mostly isolation exercises (${Math.round((1 - compound) * 100)}%)`);
    }
    const machines = done.filter((e) => ['machine', 'cable'].includes(lookup(e.exerciseId).equipment)).length / done.length;
    if (machines >= 0.75) {
      score -= 1;
      reasons.push('Mostly machines and cables');
    }
  }
  const observed = s.mode === 'live' ? observedRests(s) : [];
  const rests = observed.length >= 3 ? observed : done.map(restOf);
  if (rests.length) {
    const avg = rests.reduce((a, b) => a + b, 0) / rests.length;
    if (avg < 60) {
      score += 1;
      reasons.push(`Short rests (about ${Math.round(avg)} s)`);
    } else if (avg > 150) {
      score -= 1;
      reasons.push(`Long rests (about ${Math.round(avg / 60)} min)`);
    }
  }
  if (s.exercises.some((e) => e.supersetGroup)) {
    score += 1;
    reasons.push('Supersets');
  }
  const intensity: StrengthIntensity = score >= 2 ? 'vigorous' : score <= -2 ? 'light' : 'moderate';
  if (!reasons.length) reasons.push('A typical gym session');
  return { intensity, reasons };
}

/** No duration given: Σ(work time) + Σ(rest between sets), rest from each exercise's rest setting. */
export function estimateDurationMin(s: Pick<StrengthSession, 'exercises'>, restOf: (e: SessionExercise) => number): number {
  let sec = 0;
  let sets = 0;
  for (const e of s.exercises) {
    const w = working(e);
    for (const x of w) sec += workSec(x);
    sec += restOf(e) * w.length; // rest after each set (incl. the change-over to the next exercise)
    sets += w.length;
  }
  if (sets) sec -= restOf(s.exercises.filter((e) => working(e).length).at(-1)!); // no rest after the very last set
  return Math.max(1, Math.round(sec / 60));
}

export function loadFactor(ex: Exercise): number {
  if (ex.mechanic === 'isolation') return LOAD_FACTOR.isolation;
  return ex.forceType === 'legs' ? LOAD_FACTOR.compoundLower : LOAD_FACTOR.compoundUpper;
}

/**
 * Split the session estimate between exercises by weighted working time
 * (work + rest periods, × load factor). Largest-remainder rounding, so the
 * shares always add up to exactly `total`.
 */
export function allocateKcal(total: number, exercises: SessionExercise[], lookup: (id: string) => Exercise, restOf: (e: SessionExercise) => number): number[] {
  const weights = exercises.map((e) => {
    const w = working(e);
    if (!w.length) return 0;
    const t = w.reduce((a, x) => a + workSec(x), 0) + restOf(e) * w.length;
    return t * loadFactor(lookup(e.exerciseId));
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || total <= 0) return exercises.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floor = raw.map(Math.floor);
  let left = total - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    if (weights[i] > 0) {
      floor[i]++;
      left--;
    }
  }
  return floor;
}

export interface SessionEstimate {
  intensity: StrengthIntensity;
  reasons: string[];
  met: number;
  weightKg: number;
  weightAssumed: boolean;
  minutes: number;
  minutesEstimated: boolean;
  range: KcalRange;
  shares: number[];
}

export function estimateSession(
  s: Pick<StrengthSession, 'exercises' | 'mode' | 'intensity' | 'intensityOverridden' | 'durationMin'>,
  ctx: { lookup: (id: string) => Exercise; restOf: (e: SessionExercise) => number; bodyWeightKg?: number; minutes?: number },
): SessionEstimate {
  const derived = deriveIntensity(s, ctx.lookup, ctx.restOf);
  const intensity = s.intensityOverridden ? s.intensity : derived.intensity;
  const reasons = s.intensityOverridden ? ['Set by you'] : derived.reasons;
  const minutesEstimated = !(ctx.minutes ?? s.durationMin);
  const minutes = ctx.minutes || s.durationMin || estimateDurationMin(s, ctx.restOf);
  const weightKg = ctx.bodyWeightKg ?? DEFAULT_BODY_WEIGHT_KG;
  const met = STRENGTH_MET[intensity];
  const range = kcalRange(met, weightKg, minutes);
  return { intensity, reasons, met, weightKg, weightAssumed: ctx.bodyWeightKg == null, minutes, minutesEstimated, range, shares: allocateKcal(range.mid, s.exercises, ctx.lookup, ctx.restOf) };
}
