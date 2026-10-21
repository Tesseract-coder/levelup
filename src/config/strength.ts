import type { StrengthIntensity, StrengthSettings } from '@/db/types';

/**
 * Tunable numbers behind strength calorie estimates and suggestions.
 * MET values: Compendium of Physical Activities (resistance training codes 02050–02054).
 */
export const STRENGTH_MET: Record<StrengthIntensity, number> = {
  light: 3.5, // machines, long rests, low effort
  moderate: 5.0, // typical gym session
  vigorous: 6.0, // heavy compounds, short rests, supersets/circuits, high RPE
};

/** The range shown is MET ± this value around the chosen intensity. */
export const MET_RANGE = 1;

/** Load factors used to split a session estimate between exercises. */
export const LOAD_FACTOR = {
  compoundLower: 1.3,
  compoundUpper: 1.1,
  isolation: 0.9,
} as const;

/** Seconds per rep when estimating working time. */
export const SEC_PER_REP = 3;
/** Live mode: gaps longer than this are treated as a pause and excluded from active time. */
export const PAUSE_THRESHOLD_MIN = 10;
/** Sets with more reps than this are excluded from e1RM (Epley gets unreliable). */
export const E1RM_MAX_REPS = 12;

/** Sanity limits: values beyond these are flagged "check this" rather than saved silently. */
export const LIMITS = { maxReps: 100, maxWeightKg: 500, maxDurationSec: 3600, maxDistanceM: 5000 } as const;

/** General guideline for weekly hard sets per muscle — shown as guidance only. */
export const WEEKLY_SETS_GUIDE = { min: 10, max: 20 } as const;

export const DEFAULT_STRENGTH_SETTINGS: StrengthSettings = {
  weightStepKg: 2.5,
  weightStepLb: 5,
  barWeightKg: 20,
  defaultRestSec: 0,
  includeWarmupsInVolume: false,
  restSound: true,
  restVibrate: true,
  restNotify: false,
};

export const WEIGHT_STEPS_KG = [1, 1.25, 2.5, 5];
export const WEIGHT_STEPS_LB = [2.5, 5, 10];

/** Typical dumbbell increments in kg, for "next dumbbell" suggestions. */
export const DUMBBELL_STEPS_KG = [1, 2, 2.5, 3, 4, 5, 6, 7, 7.5, 8, 9, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20, 22, 22.5, 24, 25, 26, 27.5, 28, 30, 32, 32.5, 34, 35, 36, 37.5, 40, 42.5, 45, 47.5, 50];
