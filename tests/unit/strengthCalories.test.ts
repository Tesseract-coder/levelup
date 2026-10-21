import { describe, expect, it } from 'vitest';
import type { ExerciseSet, SessionExercise } from '@/db/types';
import { libraryExercise } from '@/domain/strength/library';
import { allocateKcal, deriveIntensity, estimateDurationMin, estimateSession, kcalRange } from '@/domain/strength/calories';
import { finalizeSession } from '@/domain/strength/finalize';
import { newSession } from '@/domain/strength/session';

const ex = (id: string) => libraryExercise(id)!;
let n = 0;
const set = (p: Partial<ExerciseSet>): ExerciseSet => ({ id: `s${++n}`, type: 'working', completed: true, ...p });
const entry = (exerciseId: string, sets: ExerciseSet[], extra: Partial<SessionExercise> = {}): SessionExercise => ({ id: `e${++n}`, exerciseId, sets, ...extra });
const restOf = (e: SessionExercise) => e.restSec ?? ex(e.exerciseId).defaultRestSec;
const three = (w: number, r: number, p: Partial<ExerciseSet> = {}) => [set({ weightKg: w, reps: r, ...p }), set({ weightKg: w, reps: r, ...p }), set({ weightKg: w, reps: r, ...p })];

describe('session calories', () => {
  it('MET × kg × h with a ±1 MET range, rounded to 5 kcal', () => {
    // 5 × 80 × 1 = 400; 4 × 80 = 320; 6 × 80 = 480
    expect(kcalRange(5, 80, 60)).toEqual({ low: 320, mid: 400, high: 480 });
    expect(kcalRange(3.5, 60, 45)).toEqual({ low: 115, mid: 160, high: 205 });
  });

  it('derives intensity from effort, compounds, rest and supersets', () => {
    const heavy = { mode: 'quick' as const, exercises: [entry('back_squat', three(100, 5, { rpe: 9 })), entry('deadlift', three(140, 5, { rpe: 9 }))] };
    expect(deriveIntensity(heavy, ex, restOf).intensity).toBe('vigorous');
    const easy = { mode: 'quick' as const, exercises: [entry('leg_extension', three(40, 12, { rpe: 6 }), { restSec: 180 }), entry('pec_deck', three(30, 12, { rpe: 6 }), { restSec: 180 })] };
    const r = deriveIntensity(easy, ex, restOf);
    expect(r.intensity).toBe('light');
    expect(r.reasons.join()).toMatch(/isolation/);
    const typical = { mode: 'quick' as const, exercises: [entry('barbell_bench_press', three(60, 8)), entry('lateral_raise', three(8, 12))] };
    expect(deriveIntensity(typical, ex, restOf).intensity).toBe('moderate');
    const circuit = { mode: 'quick' as const, exercises: [entry('dumbbell_bench_press', three(20, 10), { supersetGroup: 'g', restSec: 45 }), entry('dumbbell_row', three(20, 10), { supersetGroup: 'g', restSec: 45 })] };
    expect(deriveIntensity(circuit, ex, restOf).intensity).toBe('vigorous');
  });

  it('estimates duration from reps and rest when none is given', () => {
    // bench: 3×10 reps × 3 s = 90 s + 3 × 120 s rest; curl: 3×10 × 3 s = 90 s + 3 × 60 s rest − last rest 60 → 660 s
    const s = { exercises: [entry('barbell_bench_press', three(60, 10)), entry('dumbbell_curl', three(10, 10))] };
    expect(estimateDurationMin(s, restOf)).toBe(11);
  });

  it('per-exercise shares always add up to the session total', () => {
    const exercises = [entry('back_squat', three(100, 5)), entry('barbell_bench_press', three(60, 8)), entry('lateral_raise', three(8, 15)), entry('plank', [set({ durationSec: 60 })]), entry('push_up', [set({ reps: 20, completed: false })])];
    for (const total of [0, 1, 7, 173, 245, 400, 999]) {
      const shares = allocateKcal(total, exercises, ex, restOf);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      expect(shares[4]).toBe(0); // nothing completed
    }
    const [squat, bench, lat] = allocateKcal(300, exercises, ex, restOf);
    expect(squat).toBeGreaterThan(bench);
    expect(bench).toBeGreaterThan(lat);
  });

  it('a single exercise logged alone gets the whole estimate', () => {
    const e = estimateSession({ mode: 'quick', intensity: 'moderate', intensityOverridden: false, durationMin: 0, exercises: [entry('barbell_bench_press', three(60, 10))] }, { lookup: ex, restOf, bodyWeightKg: 80 });
    expect(e.minutesEstimated).toBe(true);
    expect(e.shares).toEqual([e.range.mid]);
  });

  it('respects a user override and assumes 70 kg without a logged weight', () => {
    const e = estimateSession({ mode: 'quick', intensity: 'vigorous', intensityOverridden: true, durationMin: 60, exercises: [entry('lateral_raise', three(8, 12))] }, { lookup: ex, restOf });
    expect(e).toMatchObject({ intensity: 'vigorous', met: 6, weightKg: 70, weightAssumed: true });
    expect(e.range.mid).toBe(420);
  });

  it('finalize stores the range and shares that sum to the estimate', () => {
    const s = newSession({ date: '2026-10-01', dayTypes: ['chest'], mode: 'quick', durationMin: 50, bodyWeightKg: 75 });
    s.exercises = [entry('barbell_bench_press', three(60, 8)), entry('cable_fly_mid', three(15, 12))];
    const f = finalizeSession(s, { lookup: ex, restOf, includeWarmups: false, now: Date.now() }, { markFilledDone: true });
    expect(f.status).toBe('done');
    expect(f.kcalLow).toBeLessThan(f.kcalEstimate);
    expect(f.kcalHigh).toBeGreaterThan(f.kcalEstimate);
    expect(f.exercises.reduce((t, e) => t + (e.kcalShare ?? 0), 0)).toBe(f.kcalEstimate);
    expect(f.totalVolumeKg).toBe(1440 + 540);
  });
});
