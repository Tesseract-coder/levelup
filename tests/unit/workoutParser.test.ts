import { describe, expect, it } from 'vitest';
import { LIBRARY } from '@/domain/strength/library';
import { parseWorkoutText } from '@/domain/strength/workoutParser';

const parse = (t: string, unit: 'kg' | 'lb' = 'kg') => parseWorkoutText(t, LIBRARY, unit);
const sets = (e: { sets: { weightKg?: number; reps?: number }[] }) => e.sets.map((s) => [s.weightKg, s.reps]);

describe('typed workout parser', () => {
  it('parses the spec example', () => {
    const r = parse('Chest day. Flat dumbbell press 3 sets 12, 10, 8 with 15, 17.5, 20 kg. Incline press 3x10 at 15kg. Cable fly 3x12 at 10kg. Push-ups 2 sets till failure 18 and 14.');
    expect(r.dayTypes).toEqual(['chest']);
    expect(r.exercises).toHaveLength(4);
    const [db, inc, fly, pu] = r.exercises;
    expect(db.exerciseId).toBe('dumbbell_bench_press');
    expect(sets(db)).toEqual([[15, 12], [17.5, 10], [20, 8]]);
    // ambiguous → user must choose, with both presses offered
    expect(inc.exerciseId).toBeNull();
    expect(inc.candidates.map((c) => c.exercise.id)).toEqual(expect.arrayContaining(['incline_dumbbell_press', 'incline_barbell_press']));
    expect(sets(inc)).toEqual([[15, 10], [15, 10], [15, 10]]);
    expect(fly.exerciseId).toBe('cable_fly_mid');
    expect(pu.exerciseId).toBe('push_up');
    expect(pu.sets.map((s) => [s.type, s.reps])).toEqual([['failure', 18], ['failure', 14]]);
  });
  it('handles sets×reps, weight×reps pairs, @, and lists separated by commas/then', () => {
    const r = parse('leg day: squat 5x5 100kg, leg press 3x12 @ 180, RDL 60x10 60x10 70x8');
    expect(r.dayTypes).toEqual(['legs']);
    expect(sets(r.exercises[0])).toHaveLength(5);
    expect(sets(r.exercises[1])[0]).toEqual([180, 12]);
    expect(sets(r.exercises[2])).toEqual([[60, 10], [60, 10], [70, 8]]);
    expect(r.assumptions.join()).toMatch(/leg press: no unit given/);
    const p = parse('Push day - ohp 3 sets of 8 at 40kg then lateral raises 3x15 8kg, tricep pushdowns 25kg 12 12 10');
    expect(p.exercises.map((e) => e.exerciseId)).toEqual(['overhead_press', 'lateral_raise', 'rope_pushdown']);
    expect(sets(p.exercises[2])).toEqual([[25, 12], [25, 12], [25, 10]]);
  });
  it('handles timed, added and assisted bodyweight, word numbers, lb', () => {
    const r = parse('plank three by 60 seconds\npull ups +10kg 3x6\nassisted pull up 3x8 assist 25kg');
    expect(r.exercises[0].sets.map((s) => s.durationSec)).toEqual([60, 60, 60]);
    expect(r.exercises[1]).toMatchObject({ exerciseId: 'pull_up' });
    expect(r.exercises[1].sets[0]).toMatchObject({ addedWeightKg: 10, reps: 6 });
    expect(r.exercises[1].sets[0].weightKg).toBeUndefined();
    expect(r.exercises[2].sets[0]).toMatchObject({ assistanceKg: 25, reps: 8 });
    const lb = parse('bench 3x5 at 225 lb');
    expect(lb.exercises[0].sets[0].weightKg).toBeCloseTo(102.06, 1);
  });
  it('splits sentences that end in a number', () => {
    const r = parse('push-ups 2 sets till failure 18 and 14. cable fly 3x12 at 10kg');
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(['push_up', 'cable_fly_mid']);
    expect(r.exercises[0].sets.map((s) => s.reps)).toEqual([18, 14]);
  });
  it('flags impossible values instead of saving them silently', () => {
    const r = parse('squat 3x150 at 900kg');
    expect(r.exercises[0].sets[0].check).toMatch(/too high/);
    const w = parse('deadlift 1x5 at 700kg');
    expect(w.exercises[0].sets[0].check).toMatch(/too heavy/);
    expect(parse('curls').exercises[0].sets[0].check).toMatch(/no reps/);
  });
  it('unknown exercises are left for the user to create', () => {
    const r = parse('zottman curls 3x10 12kg');
    expect(r.exercises[0].exerciseId).toBeNull();
    expect(r.exercises[0].name).toBe('zottman curls');
  });
});
