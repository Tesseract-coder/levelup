import type { DateKey, Exercise, SplitPlan, StrengthSession } from '@/db/types';
import { rangeKeys, toKey, weekday } from '@/domain/dates';
import { exerciseIndex, MUSCLE_GROUP_OF, unknownExercise, type MuscleGroup } from './library';
import { dayTitle } from './dayTypes';
import { PR_LABEL } from './prs';
import { setVolume } from './metrics';

export interface StrengthRangeStats {
  sessions: number;
  volumeKg: number;
  /** Volume attributed to each muscle group by primary muscles (split evenly). */
  volumeByGroup: Partial<Record<MuscleGroup, number>>;
  prs: { exercise: string; label: string; detail: string }[];
  /** Planned split days in the range (before today) with no strength session. */
  missedPlanned: { date: DateKey; label: string }[];
}

const kg = (v: number) => `${Math.round(v * 10) / 10} kg`;

export function strengthRangeStats(start: DateKey, end: DateKey, sessions: StrengthSession[], custom: Exercise[], plans: SplitPlan[], today: DateKey): StrengthRangeStats {
  const idx = exerciseIndex(custom);
  const get = (id: string) => idx.get(id) ?? unknownExercise(id);
  const inRange = sessions.filter((s) => s.status === 'done' && s.date >= start && s.date <= end);
  const volumeByGroup: Partial<Record<MuscleGroup, number>> = {};
  const prs: StrengthRangeStats['prs'] = [];
  for (const s of inRange)
    for (const e of s.exercises) {
      const ex = get(e.exerciseId);
      const groups = [...new Set(ex.primaryMuscles.map((m) => MUSCLE_GROUP_OF[m]))];
      const v = e.sets.reduce((t, x) => t + setVolume(x, ex, { bodyWeightKg: s.bodyWeightKg }), 0);
      for (const g of groups) volumeByGroup[g] = (volumeByGroup[g] ?? 0) + v / groups.length;
      for (const x of e.sets)
        for (const t of x.prTypes ?? []) {
          if (t === 'volume') continue; // weight/e1RM/reps read better in a summary
          const w = ex.trackingType === 'bodyweight_reps' ? (x.addedWeightKg ? `+${kg(x.addedWeightKg)}` : 'bodyweight') : kg(x.weightKg ?? 0);
          prs.push({ exercise: ex.name, label: PR_LABEL[t], detail: `${w} × ${x.reps ?? 0}` });
        }
    }
  // one line per exercise
  const seen = new Set<string>();
  const uniquePrs = prs.filter((p) => !seen.has(p.exercise) && seen.add(p.exercise));

  const plan = plans.find((p) => p.active);
  const missedPlanned: StrengthRangeStats['missedPlanned'] = [];
  if (plan) {
    const done = new Set(sessions.filter((s) => s.status === 'done').map((s) => s.date));
    for (const d of rangeKeys(start, end)) {
      if (d >= today || d < toKey(new Date(plan.createdAt))) continue;
      const day = plan.days[weekday(d)];
      if (day && !done.has(d)) missedPlanned.push({ date: d, label: day.label ?? dayTitle(day.dayTypes) });
    }
  }
  return { sessions: inRange.length, volumeKg: Math.round(inRange.reduce((t, s) => t + s.totalVolumeKg, 0)), volumeByGroup, prs: uniquePrs, missedPlanned };
}
