import type { DayType, Routine, RoutineExercise, SplitPlan } from '@/db/types';
import { newId } from '@/lib/id';

/** Editable starter programs. Weekdays: 0 = Sunday … 6 = Saturday. */

type T = [exerciseId: string, sets: number, repMin: number, repMax: number];
interface Template {
  key: string;
  name: string;
  description: string;
  days: { name: string; dayTypes: DayType[]; weekday: number; exercises: T[] }[];
}

const PUSH: T[] = [['barbell_bench_press', 3, 6, 10], ['incline_dumbbell_press', 3, 8, 12], ['overhead_press', 3, 6, 10], ['lateral_raise', 3, 12, 15], ['rope_pushdown', 3, 10, 15]];
const PULL: T[] = [['deadlift', 3, 4, 6], ['lat_pulldown', 3, 8, 12], ['seated_cable_row', 3, 8, 12], ['face_pull', 3, 12, 15], ['dumbbell_curl', 3, 10, 12]];
const LEGS: T[] = [['back_squat', 3, 5, 8], ['leg_press', 3, 8, 12], ['romanian_deadlift', 3, 8, 10], ['lying_leg_curl', 3, 10, 12], ['standing_calf_raise', 3, 12, 15]];

export const TEMPLATES: Template[] = [
  {
    key: 'ppl',
    name: 'Push / Pull / Legs',
    description: '3 days a week, each muscle once — repeat for 6 days if you like.',
    days: [
      { name: 'Push day', dayTypes: ['push'], weekday: 1, exercises: PUSH },
      { name: 'Pull day', dayTypes: ['pull'], weekday: 3, exercises: PULL },
      { name: 'Leg day', dayTypes: ['legs'], weekday: 5, exercises: LEGS },
    ],
  },
  {
    key: 'upper_lower',
    name: 'Upper / Lower',
    description: '4 days a week, each muscle twice.',
    days: [
      { name: 'Upper A', dayTypes: ['upper'], weekday: 1, exercises: [['barbell_bench_press', 3, 6, 10], ['barbell_row', 3, 6, 10], ['overhead_press', 3, 8, 10], ['lat_pulldown', 3, 8, 12], ['dumbbell_curl', 2, 10, 12], ['rope_pushdown', 2, 10, 12]] },
      { name: 'Lower A', dayTypes: ['lower'], weekday: 2, exercises: [['back_squat', 3, 5, 8], ['romanian_deadlift', 3, 8, 10], ['leg_extension', 3, 10, 15], ['standing_calf_raise', 3, 12, 15], ['plank', 3, 1, 1]] },
      { name: 'Upper B', dayTypes: ['upper'], weekday: 4, exercises: [['incline_dumbbell_press', 3, 8, 12], ['pull_up', 3, 6, 10], ['dumbbell_shoulder_press', 3, 8, 12], ['seated_cable_row', 3, 8, 12], ['lateral_raise', 3, 12, 15], ['hammer_curl', 2, 10, 12]] },
      { name: 'Lower B', dayTypes: ['lower'], weekday: 5, exercises: [['deadlift', 3, 4, 6], ['leg_press', 3, 8, 12], ['bulgarian_split_squat', 3, 8, 12], ['lying_leg_curl', 3, 10, 12], ['hanging_leg_raise', 3, 10, 15]] },
    ],
  },
  {
    key: 'bro',
    name: 'Bro split',
    description: '5 days, one muscle group per day.',
    days: [
      { name: 'Chest day', dayTypes: ['chest'], weekday: 1, exercises: [['barbell_bench_press', 4, 6, 10], ['incline_dumbbell_press', 3, 8, 12], ['machine_chest_press', 3, 10, 12], ['cable_fly_mid', 3, 12, 15], ['push_up', 2, 10, 20]] },
      { name: 'Back day', dayTypes: ['back'], weekday: 2, exercises: [['deadlift', 3, 4, 6], ['pull_up', 3, 6, 10], ['barbell_row', 3, 8, 10], ['lat_pulldown', 3, 10, 12], ['face_pull', 3, 12, 15]] },
      { name: 'Shoulder day', dayTypes: ['shoulders'], weekday: 3, exercises: [['overhead_press', 4, 6, 10], ['dumbbell_shoulder_press', 3, 8, 12], ['lateral_raise', 4, 12, 15], ['rear_delt_fly', 3, 12, 15], ['dumbbell_shrug', 3, 10, 15]] },
      { name: 'Leg day', dayTypes: ['legs'], weekday: 4, exercises: [['back_squat', 4, 5, 8], ['leg_press', 3, 8, 12], ['romanian_deadlift', 3, 8, 10], ['leg_extension', 3, 12, 15], ['lying_leg_curl', 3, 10, 12], ['standing_calf_raise', 4, 12, 15]] },
      { name: 'Arm day', dayTypes: ['arms'], weekday: 5, exercises: [['barbell_curl', 3, 8, 12], ['skull_crusher', 3, 8, 12], ['hammer_curl', 3, 10, 12], ['rope_pushdown', 3, 10, 15], ['preacher_curl', 2, 10, 12], ['overhead_tricep_extension', 2, 10, 12]] },
    ],
  },
  {
    key: 'full_body',
    name: 'Full body 3×/week',
    description: 'Simple and efficient — great for beginners.',
    days: [
      { name: 'Full body A', dayTypes: ['full'], weekday: 1, exercises: [['back_squat', 3, 5, 8], ['barbell_bench_press', 3, 6, 10], ['barbell_row', 3, 8, 10], ['plank', 3, 1, 1]] },
      { name: 'Full body B', dayTypes: ['full'], weekday: 3, exercises: [['deadlift', 3, 4, 6], ['overhead_press', 3, 6, 10], ['lat_pulldown', 3, 8, 12], ['walking_lunge', 3, 10, 12]] },
      { name: 'Full body C', dayTypes: ['full'], weekday: 5, exercises: [['leg_press', 3, 8, 12], ['incline_dumbbell_press', 3, 8, 12], ['seated_cable_row', 3, 8, 12], ['dumbbell_curl', 2, 10, 12], ['rope_pushdown', 2, 10, 12]] },
    ],
  },
];

/** Routines + an (inactive) split plan for a template. Routine orders start at `orderFrom`. */
export function instantiate(key: string, orderFrom = 0): { routines: Routine[]; plan: SplitPlan } {
  const t = TEMPLATES.find((x) => x.key === key)!;
  const now = Date.now();
  const routines = t.days.map(
    (d, i): Routine => ({
      id: newId(),
      name: d.name,
      dayTypes: d.dayTypes,
      exercises: d.exercises.map(([exerciseId, targetSets, repMin, repMax]): RoutineExercise => ({ exerciseId, targetSets, repMin, repMax })),
      archived: false,
      order: orderFrom + i,
      createdAt: now,
      updatedAt: now,
    }),
  );
  const days: SplitPlan['days'] = {};
  t.days.forEach((d, i) => (days[d.weekday] = { routineId: routines[i].id, dayTypes: d.dayTypes, label: d.name }));
  return { routines, plan: { id: newId(), name: t.name, days, active: false, createdAt: now } };
}

/** What the active plan has for a weekday, or null for a rest day / no plan. */
export function plannedFor(plans: SplitPlan[], weekday: number) {
  const plan = plans.find((p) => p.active);
  const day = plan?.days[weekday];
  return plan && day ? { plan, day } : null;
}

export const plannedWeekdays = (plan: SplitPlan) => Object.keys(plan.days).map(Number).sort();
