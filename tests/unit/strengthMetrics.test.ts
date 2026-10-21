import { describe, expect, it } from 'vitest';
import type { ExerciseSet, StrengthSession } from '@/db/types';
import { libraryExercise } from '@/domain/strength/library';
import { e1rm, exerciseSessionStats, exerciseVolume, sessionVolume, setVolume } from '@/domain/strength/metrics';
import { annotatePRs } from '@/domain/strength/prs';
import { fromDisplay, toDisplay } from '@/domain/strength/units';
import { platesPerSide, PLATES_LB } from '@/domain/strength/plates';
import { liveActiveMinutes } from '@/domain/strength/finalize';
import { compareToLastSameDay, routineFromSession } from '@/domain/strength/session';

const ex = (id: string) => libraryExercise(id)!;
let n = 0;
const set = (p: Partial<ExerciseSet>): ExerciseSet => ({ id: `s${++n}`, type: 'working', completed: true, ...p });
const session = (id: string, date: string, entries: [string, ExerciseSet[]][], extra: Partial<StrengthSession> = {}): StrengthSession => ({
  id, date, status: 'done', mode: 'quick', startedAt: Date.parse(`${date}T18:00:00`), durationMin: 60, dayTypes: ['chest'], intensity: 'moderate', intensityOverridden: false,
  kcalEstimate: 0, kcalLow: 0, kcalHigh: 0, kcalMethod: 'met', totalVolumeKg: 0, source: 'manual',
  exercises: entries.map(([exerciseId, sets], i) => ({ id: `${id}-e${i}`, exerciseId, sets })), exerciseIds: entries.map(([e]) => e), createdAt: 0, updatedAt: 0, ...extra,
});

describe('units', () => {
  it('stores kg and round-trips lb', () => {
    expect(fromDisplay(45, 'lb')).toBeCloseTo(20.412, 3);
    expect(toDisplay(fromDisplay(45, 'lb'), 'lb')).toBe(45);
    expect(toDisplay(fromDisplay(102.5, 'lb'), 'lb')).toBe(102.5);
    expect(toDisplay(22.5, 'kg')).toBe(22.5);
  });
});

describe('volume', () => {
  it('weight × reps over working sets, warm-ups excluded by default', () => {
    const sets = [set({ type: 'warmup', weightKg: 20, reps: 10 }), set({ weightKg: 60, reps: 8 }), set({ weightKg: 60, reps: 6 })];
    expect(exerciseVolume({ id: 'x', exerciseId: 'barbell_bench_press', sets }, ex('barbell_bench_press'))).toBe(840);
    expect(exerciseVolume({ id: 'x', exerciseId: 'barbell_bench_press', sets }, ex('barbell_bench_press'), { includeWarmups: true })).toBe(1040);
  });
  it('counts both hands for bilateral dumbbell exercises, configurable', () => {
    const s = set({ weightKg: 20, reps: 10 });
    expect(setVolume(s, ex('dumbbell_bench_press'))).toBe(400);
    expect(setVolume(s, ex('dumbbell_bench_press'), { countBothHands: false })).toBe(200);
    expect(setVolume(s, ex('goblet_squat'))).toBe(200);
  });
  it('bodyweight uses body weight plus added minus assistance', () => {
    expect(setVolume(set({ reps: 10 }), ex('pull_up'), { bodyWeightKg: 80 })).toBe(800);
    expect(setVolume(set({ reps: 5, addedWeightKg: 20 }), ex('pull_up'), { bodyWeightKg: 80 })).toBe(500);
    expect(setVolume(set({ reps: 8, assistanceKg: 30 }), ex('assisted_pull_up'), { bodyWeightKg: 80 })).toBe(400);
    expect(setVolume(set({ reps: 10 }), ex('push_up'))).toBe(0); // no body weight known
  });
  it('timed sets add no volume; incomplete sets never count', () => {
    expect(setVolume(set({ durationSec: 60 }), ex('plank'), { bodyWeightKg: 80 })).toBe(0);
    expect(setVolume(set({ weightKg: 100, reps: 5, completed: false }), ex('back_squat'))).toBe(0);
  });
  it('session volume sums exercises', () => {
    const s = session('a', '2026-10-01', [['barbell_bench_press', [set({ weightKg: 60, reps: 8 })]], ['dumbbell_curl', [set({ weightKg: 10, reps: 12 })]]]);
    expect(sessionVolume(s, ex)).toBe(720);
  });
});

describe('e1RM (Epley)', () => {
  it('computes w × (1 + reps/30) for 1–12 reps only', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 5)).toBe(116.7);
    expect(e1rm(60, 10)).toBe(80);
    expect(e1rm(60, 13)).toBeNull();
    expect(e1rm(0, 5)).toBeNull();
  });
  it('best set by e1RM, warm-ups ignored', () => {
    const sets = [set({ type: 'warmup', weightKg: 100, reps: 10 }), set({ weightKg: 80, reps: 5 }), set({ weightKg: 70, reps: 12 })];
    const st = exerciseSessionStats({ id: 'x', exerciseId: 'back_squat', sets }, ex('back_squat'));
    expect(st.bestE1rm).toBe(98);
    expect(st.bestSet?.weightKg).toBe(70);
    expect(st.maxWeightKg).toBe(80);
    expect(st.workingSets).toBe(2);
  });
});

describe('PR detection', () => {
  const ctx = { lookup: ex, opts: () => ({}) };
  it('first session is a baseline, later beats are flagged by type', () => {
    const s1 = session('s1', '2026-10-01', [['barbell_bench_press', [set({ weightKg: 60, reps: 8 }), set({ weightKg: 60, reps: 8 })]]]);
    const s2 = session('s2', '2026-10-04', [['barbell_bench_press', [set({ weightKg: 62.5, reps: 6 }), set({ weightKg: 60, reps: 10 })]]]);
    const { records, changed } = annotatePRs([s2, s1], ctx);
    expect(records.filter((r) => r.sessionId === 's1')).toEqual([]);
    const types = records.map((r) => r.type).sort();
    expect(types).toEqual(['e1rm', 'reps', 'volume', 'weight']);
    expect(records.find((r) => r.type === 'weight')?.value).toBe(62.5);
    expect(records.find((r) => r.type === 'reps')).toMatchObject({ value: 10, atWeightKg: 60 });
    expect(changed.map((c) => c.id)).toEqual(['s2']);
    expect(changed[0].exercises[0].sets.filter((x) => x.isPR)).toHaveLength(2);
  });
  it('warm-up sets never count as PRs', () => {
    const s1 = session('s1', '2026-10-01', [['back_squat', [set({ weightKg: 100, reps: 5 })]]]);
    const s2 = session('s2', '2026-10-03', [['back_squat', [set({ type: 'warmup', weightKg: 140, reps: 5 }), set({ weightKg: 90, reps: 5 })]]]);
    expect(annotatePRs([s1, s2], ctx).records).toEqual([]);
  });
  it('clears stale flags when history changes', () => {
    const s2 = session('s2', '2026-10-04', [['barbell_bench_press', [set({ weightKg: 62.5, reps: 6, isPR: true, prTypes: ['weight'] })]]]);
    const { changed } = annotatePRs([s2], ctx);
    expect(changed[0].exercises[0].sets[0].isPR).toBeUndefined();
  });
});

describe('sessions', () => {
  it('compares volume with the last same-day session', () => {
    const a = session('a', '2026-10-01', [['barbell_bench_press', [set({ weightKg: 50, reps: 10 })]]], { totalVolumeKg: 500 });
    const b = session('b', '2026-10-08', [['barbell_bench_press', [set({ weightKg: 55, reps: 10 })]]], { totalVolumeKg: 550 });
    const legs = session('l', '2026-10-05', [], { dayTypes: ['legs'], totalVolumeKg: 9000 });
    expect(compareToLastSameDay(b, [a, legs, b])?.pct).toBe(10);
    expect(compareToLastSameDay(a, [a, legs, b])).toBeNull();
  });
  it('routine from session keeps sets and rep range', () => {
    const s = session('a', '2026-10-01', [['barbell_bench_press', [set({ type: 'warmup', reps: 12 }), set({ weightKg: 60, reps: 10 }), set({ weightKg: 65, reps: 8 })]]]);
    expect(routineFromSession(s, 'Chest A', 0).exercises[0]).toMatchObject({ exerciseId: 'barbell_bench_press', targetSets: 2, repMin: 8, repMax: 10 });
  });
  it('live duration excludes pauses longer than 10 minutes', () => {
    const t0 = 1_000_000;
    const min = 60_000;
    const s = { startedAt: t0, pausedMs: 0, exercises: [{ id: 'e', exerciseId: 'x', sets: [set({ completedAt: t0 + 5 * min }), set({ completedAt: t0 + 35 * min }), set({ completedAt: t0 + 40 * min })] }] };
    // 30-min gap → only 10 counted: 5 + 10 + 5 + 5 (to end) = 25
    expect(liveActiveMinutes({ ...s, endedAt: t0 + 45 * min }, 0)).toBe(25);
  });
});

describe('plate calculator', () => {
  it('plates per side', () => {
    expect(platesPerSide(100, 20).perSide).toEqual([{ plate: 25, count: 1 }, { plate: 15, count: 1 }]);
    expect(platesPerSide(62.5, 20).perSide).toEqual([{ plate: 20, count: 1 }, { plate: 1.25, count: 1 }]);
    expect(platesPerSide(61, 20).remainder).toBe(1);
    expect(platesPerSide(225, 45, PLATES_LB).perSide).toEqual([{ plate: 45, count: 2 }]);
  });
});

describe('finishing', () => {
  it('drops unticked sets when the user leaves them out, keeps them when confirmed', async () => {
    const { cleanSession } = await import('@/domain/strength/finalize');
    const s = session('a', '2026-10-01', [['barbell_bench_press', [set({ weightKg: 60, reps: 8 }), set({ weightKg: 62.5, reps: 6, completed: false }), set({ completed: false })]]]);
    expect(cleanSession(s, false).exercises[0].sets).toHaveLength(1);
    const kept = cleanSession(s, true).exercises[0].sets;
    expect(kept).toHaveLength(2);
    expect(kept.every((x) => x.completed)).toBe(true);
  });
});

describe('progress analytics', () => {
  it('weekly sets per muscle count primary 1, secondary ½; neglect and improvers', async () => {
    const { setsByMuscle, neglected, topImprovers, balance } = await import('@/domain/strength/progress');
    const a = session('a', '2026-10-01', [['barbell_bench_press', [set({ weightKg: 60, reps: 8 }), set({ weightKg: 60, reps: 8 }), set({ type: 'warmup', weightKg: 20, reps: 10 })]]]);
    const sets = setsByMuscle([a], ex);
    expect(sets.chest).toBe(2);
    expect(sets.triceps).toBe(1);
    expect(sets.shoulders).toBe(1);
    expect(balance([a], ex)).toMatchObject({ push: 2, pull: 0, upper: 2, lower: 0 });
    const legs = session('l', '2026-10-02', [['back_squat', [set({ weightKg: 100, reps: 5 })]]]);
    expect(neglected([a, legs], ex, '2026-10-12')).toEqual([{ label: 'leg', daysSince: 10 }, { label: 'chest', daysSince: 11 }].sort((x, y) => y.daysSince - x.daysSince));
    const prog = [60, 62.5, 65, 67.5].map((w, i) => session(`p${i}`, `2026-10-0${i + 1}`, [['barbell_bench_press', [set({ weightKg: w, reps: 5 })]]]));
    expect(topImprovers(prog, ex, '2026-10-10')[0]).toMatchObject({ exerciseId: 'barbell_bench_press', pct: 8 });
  });
});

describe('progressive overload', () => {
  it('suggests weight, reps, hold or deload from the numbers', async () => {
    const { suggestOverload, nextDumbbellKg } = await import('@/domain/strength/overload');
    const hist = (vals: number[]) => vals.map((v, i) => ({ date: `2026-10-0${i + 1}`, sessionId: `${i}`, maxWeightKg: 0, e1rm: v, volumeKg: 0, bestReps: 0, totalReps: 0, sets: 3, maxDurationSec: 0 }));
    const top = [set({ weightKg: 60, reps: 12, rpe: 8 }), set({ weightKg: 60, reps: 12, rpe: 7 })];
    expect(suggestOverload({ ex: ex('barbell_bench_press'), lastSets: top, history: hist([70, 72]), repRange: [8, 12] })).toMatchObject({ kind: 'increase', weightKg: 62.5, reps: 8 });
    expect(suggestOverload({ ex: ex('dumbbell_bench_press'), lastSets: [set({ weightKg: 20, reps: 12 })], history: [], repRange: [8, 12] })).toMatchObject({ kind: 'increase', weightKg: 22 });
    expect(nextDumbbellKg(17.5)).toBe(18);
    expect(suggestOverload({ ex: ex('barbell_bench_press'), lastSets: [set({ weightKg: 60, reps: 12, rpe: 10 })], history: [], repRange: [8, 12] })?.kind).toBe('more_reps');
    expect(suggestOverload({ ex: ex('barbell_bench_press'), lastSets: [set({ weightKg: 60, reps: 6 })], history: [], repRange: [8, 12] })).toMatchObject({ kind: 'hold', weightKg: 60, reps: 8 });
    expect(suggestOverload({ ex: ex('barbell_bench_press'), lastSets: [set({ weightKg: 60, reps: 9 })], history: [], repRange: [8, 12] })).toMatchObject({ kind: 'more_reps', reps: 10 });
    expect(suggestOverload({ ex: ex('barbell_bench_press'), lastSets: top, history: hist([80, 76, 72]), repRange: [8, 12] })?.kind).toBe('deload');
    expect(suggestOverload({ ex: ex('plank'), lastSets: [set({ durationSec: 60 })], history: [], repRange: [8, 12] })).toMatchObject({ kind: 'increase', durationSec: 70 });
  });
});
