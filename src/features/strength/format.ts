import type { Exercise, ExercisePref, ExerciseSet, StrengthSettings } from '@/db/types';
import { fmtSec, fmtWeight, toDisplay, type WeightUnit } from '@/domain/strength/units';

/** Compact one-set label for the "Previous" column: "22.5×10", "+10×8", "BW×12", "45 s". */
export function fmtSet(s: ExerciseSet, ex: Exercise, unit: WeightUnit): string {
  switch (ex.trackingType) {
    case 'bodyweight_reps': {
      const load = (s.addedWeightKg ?? 0) - (s.assistanceKg ?? 0);
      const w = load === 0 ? 'BW' : `${load > 0 ? '+' : '−'}${toDisplay(Math.abs(load), unit)}`;
      return `${w}×${s.reps ?? 0}`;
    }
    case 'duration':
      return fmtSec(s.durationSec);
    case 'weight_duration':
      return `${toDisplay(s.weightKg ?? 0, unit)}·${fmtSec(s.durationSec)}`;
    case 'distance':
      return `${toDisplay(s.weightKg ?? 0, unit)}·${s.distanceM ?? 0}m`;
    default:
      return `${toDisplay(s.weightKg ?? 0, unit)}×${s.reps ?? 0}`;
  }
}

/** Summary of a list of sets: "3 × 10 @ 20 kg" when uniform, else "20×12 · 22.5×10 · 25×8". */
export function fmtPrevSets(sets: ExerciseSet[], ex: Exercise, unit: WeightUnit): string {
  const work = sets.filter((s) => s.type !== 'warmup');
  const use = work.length ? work : sets;
  if (!use.length) return '';
  const labels = use.map((s) => fmtSet(s, ex, unit));
  if (labels.every((l) => l === labels[0])) {
    if (ex.trackingType === 'weight_reps') return `${use.length} × ${use[0].reps ?? 0} @ ${fmtWeight(use[0].weightKg ?? 0, unit)}`;
    return `${use.length} × ${labels[0]}`;
  }
  return labels.slice(0, 4).join(' · ') + (labels.length > 4 ? ' …' : '');
}

/** What the weight number means for this exercise. */
export function weightHint(ex: Exercise, pref: ExercisePref | undefined, settings: StrengthSettings, unit: WeightUnit): string {
  const both = pref?.countBothHands ?? ex.bilateralDumbbell;
  switch (ex.trackingType) {
    case 'duration':
      return 'Time per set';
    case 'bodyweight_reps':
      return /assist/i.test(ex.name) ? `Assistance in ${unit} (enter as −)` : `Bodyweight · add + ${unit} or − for assistance`;
    default:
      break;
  }
  switch (ex.equipment) {
    case 'dumbbell':
      return both ? `${unit} per hand` : `${unit} (one dumbbell)`;
    case 'barbell':
    case 'smith':
      return `Total ${unit} incl. bar (${fmtWeight(settings.barWeightKg, unit)})`;
    case 'machine':
    case 'cable':
      return `Stack weight${pref?.gymNote ? ` · ${pref.gymNote}` : ''}`;
    default:
      return unit;
  }
}

export function restFor(ex: Exercise, entryRest: number | undefined, pref: ExercisePref | undefined, settings: StrengthSettings): number {
  return entryRest ?? pref?.restSec ?? (settings.defaultRestSec || ex.defaultRestSec);
}
