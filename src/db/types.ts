/** LevelUp data model. All `date` fields are local-date keys (`YYYY-MM-DD`) after applying the day-boundary setting. */

export type DateKey = string;
export type ID = string;

export type Sex = 'female' | 'male' | 'other';
export type UnitSystem = 'metric' | 'imperial';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type DietPreference = 'vegetarian' | 'non_vegetarian' | 'eggetarian' | 'vegan' | 'other';
export type GoalType = 'lose_fat' | 'build_muscle' | 'maintain' | 'endurance' | 'discipline' | 'custom';

export interface UserProfile {
  id: 'me';
  name?: string;
  sex: Sex;
  birthYear: number;
  heightCm: number;
  units: UnitSystem;
  activityLevel: ActivityLevel;
  dietPreference: DietPreference;
  dietNote?: string;
  avoidList: string[];
  eatingPattern?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Goal {
  id: ID;
  type: GoalType;
  customText?: string;
  startWeightKg: number;
  targetWeightKg?: number;
  targetDate?: DateKey;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  waterTargetMl: number;
  sleepTargetMin: number;
  stepsTarget: number;
  active: boolean;
  startedAt: number;
  endedAt?: number;
  /** Why this goal version was created (onboarding, user edit, accepted suggestion). */
  reason?: string;
}

export type TrackingType = 'check' | 'count' | 'duration' | 'numeric' | 'avoid';
export type ActivityKind = 'workout' | 'habit';
export type Special = 'sleep' | 'water' | 'steps';

export type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] } // 0 = Sunday … 6 = Saturday
  | { type: 'weekly'; times: number };

export interface ActivityDef {
  id: ID;
  name: string;
  kind: ActivityKind;
  trackingType: TrackingType;
  /** e.g. 'min', 'glasses', 'ml', 'h', 'steps', 'pages' */
  unit?: string;
  /** Per-day (habit) or per-session (workout) amount that counts as "done". */
  target?: number;
  schedule: Schedule;
  color: string;
  icon: string;
  archived: boolean;
  order: number;
  special?: Special;
  /** MET value for workouts (calorie-burn estimate). */
  met?: number;
  hasDistance?: boolean;
  isStrength?: boolean;
  /** How multiple logs on the same day combine. */
  aggregate: 'sum' | 'last';
  /** Quick-add presets shown in the entry sheet. */
  presets?: number[];
  createdAt: number;
}

export type Intensity = 'easy' | 'moderate' | 'hard';

export interface StrengthSet {
  reps: number;
  weightKg: number;
}

export interface StrengthExercise {
  name: string;
  sets: StrengthSet[];
}

export interface ActivityLog {
  id: ID;
  activityId: ID;
  date: DateKey;
  /** check: 1 · count: n · duration: minutes · numeric: value · avoid: 1 avoided / 0 slipped */
  value: number;
  durationMin?: number;
  distanceKm?: number;
  intensity?: Intensity;
  caloriesBurnedEst?: number;
  /** Legacy (pre-v3) free-text strength detail. New strength logs point to a StrengthSession instead. */
  exercises?: StrengthExercise[];
  /** Strength workouts: the StrengthSession this log summarises. */
  sessionId?: ID;
  notes?: string;
  createdAt: number;
}

export type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'other';
/** 'offline' = estimated from the built-in food database. 'ai' only appears in data from earlier versions. */
export type FoodSource = 'ai' | 'manual' | 'saved' | 'offline';

export interface Macros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
}

export interface FoodEntry extends Macros {
  id: ID;
  date: DateKey;
  meal: Meal;
  name: string;
  quantity: number;
  unit: string;
  gramsEst: number;
  confidence: number;
  assumptions?: string;
  source: FoodSource;
  createdAt: number;
}

export interface SavedFoodItem extends Macros {
  name: string;
  quantity: number;
  unit: string;
  gramsEst: number;
}

export interface SavedFood {
  id: ID;
  type: 'food' | 'meal';
  name: string;
  /** A 'food' has exactly one item; a 'meal'/recipe has several. */
  items: SavedFoodItem[];
  defaultMeal?: Meal;
  useCount: number;
  lastUsedAt: number;
  createdAt: number;
}

export interface BodyMeasurements {
  waistCm?: number;
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
}

export interface BodyLog {
  id: ID;
  date: DateKey;
  weightKg?: number;
  measurements?: BodyMeasurements;
  createdAt: number;
}

export interface SleepLog {
  id: ID;
  /** The date of the morning you woke up. */
  date: DateKey;
  bedtime: string; // HH:mm
  wake: string; // HH:mm
  durationMin: number;
  quality?: number; // 1–5
  createdAt: number;
}

export interface MoodLog {
  id: ID;
  date: DateKey;
  mood: number; // 1–5
  energy: number; // 1–5
  createdAt: number;
}

export interface SummaryItem {
  text: string;
  /** Fact ids the text is grounded in. */
  facts?: string[];
}

export interface ScoreComponent {
  key: 'nutrition' | 'activity' | 'habits' | 'sleep';
  label: string;
  weight: number;
  score: number | null; // 0–1, null = not included
  detail: string;
}

export interface Summary {
  id: string; // 'day:YYYY-MM-DD' | 'week:YYYY-MM-DD'
  kind: 'day' | 'week';
  rangeStart: DateKey;
  rangeEnd: DateKey;
  stats: unknown;
  score: number;
  breakdown: ScoreComponent[];
  wins: SummaryItem[];
  misses: SummaryItem[];
  improvements: SummaryItem[];
  nextFocus: NextFocus;
  /** Stat lines the summary text is built from. */
  facts?: { id: string; text: string }[];
  /** 'ai' only appears in data created by earlier versions. */
  generatedBy: 'ai' | 'rules';
  generatedAt: number;
}

export interface NextFocus {
  text: string;
  /** A habit the user can create with one tap. */
  habit?: Pick<ActivityDef, 'name' | 'trackingType' | 'unit' | 'target' | 'schedule' | 'icon'>;
  accepted?: boolean;
}

export interface ReminderSettings {
  enabled: boolean;
  meals?: string; // HH:mm
  workout?: string;
  evening?: string;
}

export interface Settings {
  id: 'app';
  theme: 'system' | 'light' | 'dark';
  dayBoundaryHour: number; // 0–6; logs before this hour belong to the previous day
  weekStartsOn: 0 | 1;
  weeklySummaryDay: number; // 0–6
  graceDaysPerWeek: number;
  reminders: ReminderSettings;
  onboarded: boolean;
  disclaimerAccepted: boolean;
  haptics: boolean;
  fasting?: { startedAt: number; targetHours: number } | null;
  demoData?: boolean;
  strength?: Partial<StrengthSettings>;
}

// ---------------------------------------------------------------- strength

export type Muscle =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'lats'
  | 'upper_back'
  | 'traps'
  | 'lower_back'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'adductors';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'smith' | 'other';
export type Mechanic = 'compound' | 'isolation';
export type ForceType = 'push' | 'pull' | 'legs' | 'core';
export type ExerciseTracking = 'weight_reps' | 'bodyweight_reps' | 'duration' | 'weight_duration' | 'distance';
export type StrengthIntensity = 'light' | 'moderate' | 'vigorous';

export interface Exercise {
  id: ID;
  name: string;
  aliases: string[];
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment;
  mechanic: Mechanic;
  forceType: ForceType;
  /** Weight is entered per dumbbell; volume counts both hands. */
  bilateralDumbbell: boolean;
  trackingType: ExerciseTracking;
  defaultRestSec: number;
  /** Typical effort when this exercise dominates a session (feeds intensity derivation). */
  metCategory: StrengthIntensity;
  isCustom: boolean;
  archived?: boolean;
  createdAt?: number;
}

/** Per-exercise user preferences (built-in and custom). */
export interface ExercisePref {
  exerciseId: ID;
  favorite?: boolean;
  restSec?: number;
  /** Override the library's bilateral-dumbbell volume rule. */
  countBothHands?: boolean;
  /** e.g. "Gym A – Hammer Strength machine"; machine numbers aren't comparable across gyms. */
  gymNote?: string;
  /** Target rep range used by progressive-overload hints. */
  repMin?: number;
  repMax?: number;
}

export type DayType = 'chest' | 'back' | 'shoulders' | 'legs' | 'arms' | 'core' | 'glutes' | 'push' | 'pull' | 'upper' | 'lower' | 'full' | 'custom';
export type SetType = 'warmup' | 'working' | 'drop' | 'failure';
export type PRType = 'weight' | 'e1rm' | 'reps' | 'volume';

export interface ExerciseSet {
  id: ID;
  type: SetType;
  /** Always kg. Dumbbells: per hand. Barbell: total. Machine: stack value. */
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
  /** Bodyweight exercises: extra load (+) … */
  addedWeightKg?: number;
  /** … or machine/band assistance. */
  assistanceKg?: number;
  rpe?: number;
  rir?: number;
  tempo?: string;
  notes?: string;
  completed: boolean;
  completedAt?: number;
  isPR?: boolean;
  prTypes?: PRType[];
}

export interface SessionExercise {
  id: ID;
  exerciseId: ID;
  /** Exercises sharing a group id are performed as a superset. */
  supersetGroup?: string;
  notes?: string;
  pain?: boolean;
  restSec?: number;
  /** Allocated share of the session's calorie estimate. */
  kcalShare?: number;
  sets: ExerciseSet[];
}

export interface StrengthSession {
  id: ID;
  date: DateKey;
  status: 'in_progress' | 'done';
  mode: 'live' | 'quick';
  startedAt: number;
  endedAt?: number;
  /** Live mode: total time spent in pauses longer than 10 min (excluded from active time). */
  pausedMs?: number;
  durationMin: number;
  dayTypes: DayType[];
  customDayName?: string;
  routineId?: ID;
  intensity: StrengthIntensity;
  intensityOverridden: boolean;
  kcalEstimate: number;
  kcalLow: number;
  kcalHigh: number;
  kcalMethod: 'met' | 'heart_rate';
  totalVolumeKg: number;
  /** Body weight used for bodyweight-exercise volume and calories. */
  bodyWeightKg?: number;
  notes?: string;
  energyRating?: number;
  source: 'manual' | 'text' | 'import' | 'migrated';
  /** In order. Sets are embedded so a session saves (and undoes) atomically. */
  exercises: SessionExercise[];
  /** Denormalised for the multi-entry index (per-exercise history). */
  exerciseIds: ID[];
  /** The ActivityLog that represents this session in Today, charts and the score. */
  activityLogId?: ID;
  createdAt: number;
  updatedAt: number;
}

export interface RoutineExercise {
  exerciseId: ID;
  targetSets: number;
  repMin: number;
  repMax: number;
  restSec?: number;
  supersetGroup?: string;
}

export interface Routine {
  id: ID;
  name: string;
  dayTypes: DayType[];
  exercises: RoutineExercise[];
  archived: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** Weekday (0 = Sunday … 6) → what's planned. Missing days are rest days. */
export type SplitDay = { routineId?: ID; dayTypes: DayType[]; label?: string };

export interface SplitPlan {
  id: ID;
  name: string;
  days: Partial<Record<number, SplitDay>>;
  active: boolean;
  createdAt: number;
}

export interface StrengthSettings {
  weightStepKg: number;
  weightStepLb: number;
  barWeightKg: number;
  /** Default rest when an exercise has no own value; 0 = use the exercise default. */
  defaultRestSec: number;
  includeWarmupsInVolume: boolean;
  restSound: boolean;
  restVibrate: boolean;
  restNotify: boolean;
}

