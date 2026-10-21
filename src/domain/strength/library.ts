import raw from '@/data/exercises.json';
import type { Equipment, Exercise, ExerciseTracking, ForceType, Mechanic, Muscle, StrengthIntensity } from '@/db/types';

interface RawExercise {
  id: string;
  name: string;
  aliases: string[];
  primary: string[];
  secondary: string[];
  equipment: string;
  mechanic: string;
  force: string;
  bilateral?: boolean;
  tracking?: string;
  rest?: number;
  met?: string;
}

export const LIBRARY_VERSION: number = raw.version;

function normalise(r: RawExercise): Exercise {
  const equipment = r.equipment as Equipment;
  const mechanic = r.mechanic as Mechanic;
  const forceType = r.force as ForceType;
  return {
    id: r.id,
    name: r.name,
    aliases: r.aliases,
    primaryMuscles: r.primary as Muscle[],
    secondaryMuscles: r.secondary as Muscle[],
    equipment,
    mechanic,
    forceType,
    bilateralDumbbell: r.bilateral ?? equipment === 'dumbbell',
    trackingType: (r.tracking as ExerciseTracking) ?? (equipment === 'bodyweight' ? 'bodyweight_reps' : 'weight_reps'),
    defaultRestSec: r.rest ?? (mechanic === 'compound' ? 90 : 60),
    metCategory: (r.met as StrengthIntensity) ?? (mechanic === 'isolation' ? 'light' : forceType === 'legs' ? 'vigorous' : 'moderate'),
    isCustom: false,
  };
}

/** The bundled exercise library (read-only; custom exercises live in the `customExercises` table). */
export const LIBRARY: readonly Exercise[] = (raw.exercises as RawExercise[]).map(normalise);

const byId = new Map(LIBRARY.map((e) => [e.id, e]));
export const libraryExercise = (id: string) => byId.get(id);

/** Lookup across the library and the user's custom exercises. */
export function exerciseIndex(custom: Exercise[] = []): Map<string, Exercise> {
  const m = new Map(byId);
  for (const c of custom) m.set(c.id, c);
  return m;
}

/** Placeholder for an id that no longer resolves (e.g. a custom exercise from a partial import). */
export function unknownExercise(id: string): Exercise {
  return { id, name: 'Unknown exercise', aliases: [], primaryMuscles: [], secondaryMuscles: [], equipment: 'other', mechanic: 'isolation', forceType: 'push', bilateralDumbbell: false, trackingType: 'weight_reps', defaultRestSec: 60, metCategory: 'light', isCustom: true };
}

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'Chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  lower_back: 'Lower back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  adductors: 'Adductors',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
  smith: 'Smith machine',
  other: 'Other',
};

/** Coarse groups used for filters, weekly-sets charts and the body map. */
export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'core' | 'quads' | 'hamstrings' | 'glutes' | 'calves';
export const MUSCLE_GROUP_OF: Record<Muscle, MuscleGroup> = {
  chest: 'chest',
  front_delts: 'shoulders',
  side_delts: 'shoulders',
  rear_delts: 'shoulders',
  lats: 'back',
  upper_back: 'back',
  traps: 'back',
  lower_back: 'back',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  abs: 'core',
  obliques: 'core',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  adductors: 'quads',
};
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  core: 'Core',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
};
export const MUSCLE_GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];

export const groupsOf = (e: Pick<Exercise, 'primaryMuscles'>) => [...new Set(e.primaryMuscles.map((m) => MUSCLE_GROUP_OF[m]))];
