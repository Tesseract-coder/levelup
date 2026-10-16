import type { ActivityLevel, GoalType, Sex } from '@/db/types';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, { label: string; hint: string }> = {
  sedentary: { label: 'Sedentary', hint: 'Desk job, little exercise' },
  light: { label: 'Lightly active', hint: 'Light exercise 1–3 days/week' },
  moderate: { label: 'Moderately active', hint: 'Exercise 3–5 days/week' },
  active: { label: 'Very active', hint: 'Hard exercise 6–7 days/week' },
  very_active: { label: 'Extremely active', hint: 'Physical job + training' },
};

export const GOAL_LABELS: Record<GoalType, { label: string; hint: string; emoji: string }> = {
  lose_fat: { label: 'Lose fat', hint: 'Gentle calorie deficit, high protein', emoji: '🔥' },
  build_muscle: { label: 'Build muscle', hint: 'Small surplus, progressive training', emoji: '💪' },
  maintain: { label: 'Maintain / general fitness', hint: 'Balanced intake, stay active', emoji: '⚖️' },
  endurance: { label: 'Improve stamina', hint: 'Fuel cardio, build endurance', emoji: '🏃' },
  discipline: { label: 'Discipline & growth', hint: 'Consistency across habits', emoji: '🧭' },
  custom: { label: 'Custom', hint: 'Describe your own goal', emoji: '✨' },
};

/** Calorie adjustment vs maintenance, as a fraction. Deliberately moderate. */
export const GOAL_CALORIE_ADJUST: Record<GoalType, number> = {
  lose_fat: -0.15,
  build_muscle: 0.08,
  maintain: 0,
  endurance: 0.05,
  discipline: 0,
  custom: 0,
};

/** Protein g per kg bodyweight. */
export const GOAL_PROTEIN_PER_KG: Record<GoalType, number> = {
  lose_fat: 1.8,
  build_muscle: 2.0,
  maintain: 1.4,
  endurance: 1.5,
  discipline: 1.4,
  custom: 1.4,
};

/** Safe calorie floors. 'other' uses the midpoint. */
export function calorieFloor(sex: Sex): number {
  return sex === 'male' ? 1500 : sex === 'female' ? 1200 : 1350;
}

/** Mifflin-St Jeor resting metabolic rate (kcal/day). */
export function bmr({ sex, weightKg, heightCm, age }: { sex: Sex; weightKg: number; heightCm: number; age: number }): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const s = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return base + s;
}

export function tdee(input: { sex: Sex; weightKg: number; heightCm: number; age: number; activityLevel: ActivityLevel }): number {
  return bmr(input) * ACTIVITY_FACTORS[input.activityLevel];
}

export const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export interface TargetInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number;
  activityLevel: ActivityLevel;
  goal: GoalType;
}

export interface ComputedTargets {
  bmr: number;
  tdee: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  sleepMin: number;
  steps: number;
  /** True when the goal adjustment was limited by the safety floor. */
  flooredToSafeMinimum: boolean;
  explanation: string[];
}

export function computeTargets(i: TargetInput): ComputedTargets {
  const rest = bmr(i);
  const maint = rest * ACTIVITY_FACTORS[i.activityLevel];
  const adjust = GOAL_CALORIE_ADJUST[i.goal];
  let calories = maint * (1 + adjust);
  // Never more than a 500 kcal/day deficit or 300 kcal/day surplus.
  if (adjust < 0) calories = Math.max(calories, maint - 500);
  if (adjust > 0) calories = Math.min(calories, maint + 300);
  const floor = calorieFloor(i.sex);
  const flooredToSafeMinimum = calories < floor;
  calories = roundTo(Math.max(calories, floor), 10);

  // For fat loss with a meaningfully lower target weight, base protein on a weight between current and target
  // so recommendations stay realistic for larger bodies.
  const proteinWeight =
    i.goal === 'lose_fat' && i.targetWeightKg && i.targetWeightKg < i.weightKg
      ? (i.weightKg + i.targetWeightKg) / 2
      : i.weightKg;
  let proteinG = roundTo(proteinWeight * GOAL_PROTEIN_PER_KG[i.goal], 5);
  const fatG = roundTo(Math.max((calories * 0.27) / 9, i.weightKg * 0.6), 5);
  let carbsG = (calories - proteinG * 4 - fatG * 9) / 4;
  if (carbsG < 80) {
    // Keep a sensible carb minimum by easing protein.
    proteinG = roundTo(Math.max(i.weightKg * 1.2, (calories - fatG * 9 - 80 * 4) / 4), 5);
    carbsG = (calories - proteinG * 4 - fatG * 9) / 4;
  }
  carbsG = roundTo(Math.max(0, carbsG), 5);

  const waterMl = Math.max(2000, Math.min(4000, roundTo(i.weightKg * 35, 250)));
  const sleepMin = i.age < 18 ? 540 : 450;
  const steps = i.goal === 'lose_fat' ? 9000 : i.goal === 'endurance' ? 10000 : 8000;

  const pct = Math.round(adjust * 100);
  const explanation = [
    `Resting burn (Mifflin-St Jeor): ${Math.round(rest)} kcal`,
    `× activity factor ${ACTIVITY_FACTORS[i.activityLevel]} = ${Math.round(maint)} kcal maintenance`,
    pct === 0 ? 'No goal adjustment' : `${pct > 0 ? '+' : ''}${pct}% for your goal (capped for safety)`,
    `Protein ${GOAL_PROTEIN_PER_KG[i.goal]} g/kg, fat ≈27% of calories, carbs fill the rest`,
  ];
  if (flooredToSafeMinimum) explanation.push(`Raised to the safe minimum of ${floor} kcal`);

  return {
    bmr: Math.round(rest),
    tdee: Math.round(maint),
    calories,
    proteinG,
    carbsG,
    fatG,
    waterMl,
    sleepMin,
    steps,
    flooredToSafeMinimum,
    explanation,
  };
}

/** Gentle caution messages for user-entered targets / goals. Empty array = fine. */
export function targetCautions(opts: {
  sex: Sex;
  calories: number;
  weightKg: number;
  targetWeightKg?: number;
  targetDate?: string;
  today: string;
}): string[] {
  const out: string[] = [];
  const floor = calorieFloor(opts.sex);
  if (opts.calories < floor) {
    out.push(
      `${opts.calories} kcal is below the commonly recommended minimum of ${floor} kcal. Very low intake can make progress harder to sustain — consider talking to a doctor or dietitian first.`,
    );
  }
  if (opts.targetWeightKg && opts.targetDate) {
    const weeks = (new Date(opts.targetDate).getTime() - new Date(opts.today).getTime()) / (7 * 86_400_000);
    const delta = opts.weightKg - opts.targetWeightKg;
    if (weeks > 0 && delta > 0) {
      const perWeek = delta / weeks;
      const pctPerWeek = perWeek / opts.weightKg;
      if (pctPerWeek > 0.01) {
        out.push(
          `That pace is about ${perWeek.toFixed(1)} kg per week. Most guidance suggests up to ~0.5–1% of body weight per week — a later date may feel much easier.`,
        );
      }
    } else if (weeks > 0 && delta < 0 && -delta / weeks > 0.5) {
      out.push('Gaining more than ~0.5 kg per week is mostly not muscle. A later target date may suit you better.');
    }
  }
  return out;
}

// ---------- units ----------
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return { ft, in: inch };
}
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * CM_PER_IN;

export function formatWeight(kg: number | undefined, units: 'metric' | 'imperial'): string {
  if (kg == null) return '—';
  return units === 'imperial' ? `${kgToLb(kg).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
}

export function ageFromBirthYear(birthYear: number, now = new Date()): number {
  return now.getFullYear() - birthYear;
}
