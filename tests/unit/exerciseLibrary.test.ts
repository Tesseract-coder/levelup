import { describe, expect, it } from 'vitest';
import { LIBRARY, libraryExercise } from '@/domain/strength/library';
import { findDuplicate, matchExercise, normaliseName, rankExercises } from '@/domain/strength/exerciseMatch';
import { fitsDay } from '@/domain/strength/dayTypes';

describe('exercise library', () => {
  it('has ~150 exercises with unique ids and complete fields', () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(145);
    expect(new Set(LIBRARY.map((e) => e.id)).size).toBe(LIBRARY.length);
    for (const e of LIBRARY) {
      expect(e.primaryMuscles.length, e.id).toBeGreaterThan(0);
      expect(e.defaultRestSec).toBeGreaterThan(0);
    }
  });
  it('includes the required exercises', () => {
    const required = ['Flat Dumbbell Press', 'Incline Barbell Press', 'Decline Dumbbell Press', 'Machine Chest Press', 'Cable Fly (High to Low)', 'Pec Deck', 'Push-up', 'Dips', 'Deadlift', 'Romanian Deadlift', 'Pull-up', 'Lat Pulldown', 'Seated Cable Row', 'Barbell Row', 'T-bar Row', 'Face Pull', 'Overhead Press', 'Dumbbell Shoulder Press', 'Lateral Raise', 'Rear Delt Fly', 'Barbell Shrug', 'Squat', 'Leg Press', 'Hack Squat', 'Walking Lunge', 'Bulgarian Split Squat', 'Leg Extension', 'Lying Leg Curl', 'Hip Thrust', 'Standing Calf Raise', 'Barbell Curl', 'Dumbbell Curl', 'Cable Curl', 'Hammer Curl', 'Preacher Curl', 'Tricep Rope Pushdown', 'Skull Crusher', 'Overhead Tricep Extension', 'Plank', 'Crunch', 'Hanging Leg Raise', 'Cable Crunch', 'Russian Twist'];
    const names = new Set(LIBRARY.map((e) => e.name));
    expect(required.filter((r) => !names.has(r))).toEqual([]);
  });
  it('applies defaults: dumbbells are per hand, bodyweight tracks reps, rest by mechanic', () => {
    expect(libraryExercise('dumbbell_bench_press')).toMatchObject({ bilateralDumbbell: true, defaultRestSec: 90, metCategory: 'moderate' });
    expect(libraryExercise('goblet_squat')?.bilateralDumbbell).toBe(false);
    expect(libraryExercise('push_up')?.trackingType).toBe('bodyweight_reps');
    expect(libraryExercise('lateral_raise')).toMatchObject({ defaultRestSec: 60, metCategory: 'light' });
    expect(libraryExercise('plank')?.trackingType).toBe('duration');
  });
});

describe('fuzzy exercise matching', () => {
  it('normalises abbreviations and plurals', () => {
    expect(normaliseName('DB Curls')).toBe('dumbbell curl');
    expect(normaliseName('Push-ups')).toBe('push up');
    expect(normaliseName('Skull crushers')).toBe('skull crusher');
  });
  it.each([
    ['Flat dumbbell press', 'dumbbell_bench_press'],
    ['bench', 'barbell_bench_press'],
    ['Push-ups', 'push_up'],
    ['lat pull down', 'lat_pulldown'],
    ['tricep pushdowns', 'rope_pushdown'],
    ['RDL', 'romanian_deadlift'],
    ['skullcrushers', 'skull_crusher'],
    ['Incline DB press', 'incline_dumbbell_press'],
    ['Cable fly', 'cable_fly_mid'],
    ['side lateral raises', 'lateral_raise'],
  ])('%s → %s', (q, id) => {
    expect(matchExercise(q, LIBRARY)?.exercise.id).toBe(id);
  });
  it('returns no confident match for ambiguous names but ranks the options', () => {
    expect(matchExercise('Incline press', LIBRARY)).toBeNull();
    const ids = rankExercises('Incline press', LIBRARY, 3).map((m) => m.exercise.id);
    expect(ids).toEqual(expect.arrayContaining(['incline_dumbbell_press', 'incline_barbell_press']));
  });
  it('detects duplicates when creating custom exercises', () => {
    expect(findDuplicate('bench press', LIBRARY)?.id).toBe('barbell_bench_press');
    expect(findDuplicate('Zottman curl', LIBRARY)).toBeNull();
  });
});

describe('day types', () => {
  it('matches exercises to days', () => {
    const ex = (id: string) => libraryExercise(id)!;
    expect(fitsDay(ex('barbell_bench_press'), ['chest'])).toBe(true);
    expect(fitsDay(ex('barbell_bench_press'), ['push'])).toBe(true);
    expect(fitsDay(ex('barbell_bench_press'), ['pull'])).toBe(false);
    expect(fitsDay(ex('lat_pulldown'), ['pull'])).toBe(true);
    expect(fitsDay(ex('leg_press'), ['legs'])).toBe(true);
    expect(fitsDay(ex('hammer_curl'), ['arms'])).toBe(true);
    expect(fitsDay(ex('hammer_curl'), ['chest'])).toBe(false);
  });
});
