import { describe, expect, it } from 'vitest';
import { libraryExercise } from '@/domain/strength/library';
import { instantiate, plannedFor, plannedWeekdays, TEMPLATES } from '@/domain/strength/templates';
import { exercisesFromRoutine } from '@/domain/strength/session';

describe('starter templates', () => {
  it('only reference library exercises', () => {
    for (const t of TEMPLATES) for (const d of t.days) for (const [id] of d.exercises) expect(libraryExercise(id), `${t.key}: ${id}`).toBeDefined();
  });
  it('instantiate creates routines and a split on the template weekdays', () => {
    const { routines, plan } = instantiate('ppl', 5);
    expect(routines.map((r) => r.name)).toEqual(['Push day', 'Pull day', 'Leg day']);
    expect(routines[0].order).toBe(5);
    expect(plannedWeekdays(plan)).toEqual([1, 3, 5]);
    expect(plan.days[3]?.routineId).toBe(routines[1].id);
    expect(plannedFor([plan], 1)).toBeNull(); // not active yet
    expect(plannedFor([{ ...plan, active: true }], 1)?.day.label).toBe('Push day');
    expect(plannedFor([{ ...plan, active: true }], 2)).toBeNull();
  });
  it('routine → session prefills target sets from last time', () => {
    const { routines } = instantiate('full_body');
    const ex = exercisesFromRoutine(routines[0], []);
    expect(ex[0].sets).toHaveLength(3);
    expect(ex[0].sets[0]).toMatchObject({ reps: 8, completed: false });
  });
});
