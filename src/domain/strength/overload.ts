import type { Exercise, ExerciseSet, GoalType } from '@/db/types';
import { DUMBBELL_STEPS_KG } from '@/config/strength';
import type { ExercisePoint } from './progress';
import { KG_PER_LB } from '@/domain/targets';

/** Rule-based progressive-overload suggestions. All numbers come from the user's own logs. */

export type OverloadKind = 'increase' | 'more_reps' | 'hold' | 'deload';

export interface OverloadSuggestion {
  kind: OverloadKind;
  /** Weight to try (kg; per hand for dumbbells). */
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  /** Numbers the text refers to, for grounding checks. */
  facts: number[];
}

export function defaultRepRange(goal: GoalType | undefined): [number, number] {
  if (goal === 'endurance') return [12, 20];
  if (goal === 'build_muscle') return [6, 12];
  return [8, 12];
}

export function nextDumbbellKg(kg: number): number {
  return DUMBBELL_STEPS_KG.find((w) => w > kg + 0.01) ?? kg + 2.5;
}

/** Smallest sensible jump for the equipment: 2.5 kg (5 lb) on bars/machines, the next dumbbell. */
export function nextWeightKg(ex: Exercise, kg: number, unit: 'kg' | 'lb'): number {
  if (ex.equipment === 'dumbbell' || ex.equipment === 'kettlebell') return unit === 'lb' ? kg + 5 * KG_PER_LB : nextDumbbellKg(kg);
  return Math.round((kg + (unit === 'lb' ? 5 * KG_PER_LB : 2.5)) * 1000) / 1000;
}

export function suggestOverload(input: { ex: Exercise; lastSets: ExerciseSet[]; history: ExercisePoint[]; repRange: [number, number]; unit?: 'kg' | 'lb' }): OverloadSuggestion | null {
  const { ex, history, repRange } = input;
  const [repMin, repMax] = repRange;
  const work = input.lastSets.filter((s) => s.completed && s.type !== 'warmup');
  if (!work.length) return null;

  // two drops in a row (e1RM, or best reps/time when there's no load)
  const series = history.slice(-3).map((p) => p.e1rm ?? (p.maxDurationSec || p.bestReps));
  if (series.length === 3 && series[2] < series[1] && series[1] < series[0]) return { kind: 'deload', facts: [] };

  if (ex.trackingType === 'duration' || ex.trackingType === 'weight_duration') {
    const best = Math.max(...work.map((s) => s.durationSec ?? 0));
    return { kind: 'increase', durationSec: best + 10, facts: [best, best + 10] };
  }
  const top = Math.max(...work.map((s) => (ex.trackingType === 'bodyweight_reps' ? s.addedWeightKg ?? 0 : s.weightKg ?? 0)));
  const atTop = work.filter((s) => (ex.trackingType === 'bodyweight_reps' ? s.addedWeightKg ?? 0 : s.weightKg ?? 0) === top);
  const minReps = Math.min(...atTop.map((s) => s.reps ?? 0));
  const easyEnough = atTop.every((s) => (s.rpe ?? (s.rir != null ? 10 - s.rir : 8)) <= 8);

  if (minReps >= repMax && easyEnough) {
    if (ex.trackingType === 'bodyweight_reps' && top === 0) return { kind: 'more_reps', reps: minReps + 2, facts: [minReps, minReps + 2] };
    const w = nextWeightKg(ex, top, input.unit ?? 'kg');
    return { kind: 'increase', weightKg: w, reps: repMin, facts: [top, w, repMin, repMax] };
  }
  if (minReps < repMin) return { kind: 'hold', weightKg: top, reps: repMin, facts: [top, minReps, repMin] };
  return { kind: 'more_reps', weightKg: top, reps: Math.min(repMax, minReps + 1), facts: [top, minReps, Math.min(repMax, minReps + 1)] };
}
