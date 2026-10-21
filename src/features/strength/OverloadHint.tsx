import { TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { useGoal } from '@/hooks/data';
import { useAllSessions, useExercisePrefs, useExercises, useWeightUnit } from '@/hooks/strength';
import { defaultRepRange, suggestOverload } from '@/domain/strength/overload';
import { exerciseHistory } from '@/domain/strength/progress';
import { lastSessionWith } from '@/domain/strength/session';
import { fmtSec, fmtWeight } from '@/domain/strength/units';

/** "How to progress" for an exercise, from the last session's numbers. */
export function OverloadHint({ exerciseId, excludeSessionId, compact }: { exerciseId: string; excludeSessionId?: string; compact?: boolean }) {
  const { get } = useExercises();
  const prefs = useExercisePrefs();
  const unit = useWeightUnit();
  const { data: goal } = useGoal();
  const { data: sessions = [] } = useAllSessions();
  const ex = get(exerciseId);
  const last = lastSessionWith(exerciseId, sessions, excludeSessionId);
  if (!last) return null;
  const pref = prefs.get(exerciseId);
  const range: [number, number] = pref?.repMin && pref.repMax ? [pref.repMin, pref.repMax] : defaultRepRange(goal?.type);
  const history = exerciseHistory(exerciseId, sessions.filter((s) => s.id !== excludeSessionId), get, (s) => ({ bodyWeightKg: s.bodyWeightKg }));
  const sug = suggestOverload({ ex, lastSets: last.entry.sets, history, repRange: range, unit });
  if (!sug) return null;
  const per = ex.equipment === 'dumbbell' && ex.bilateralDumbbell ? ' per hand' : '';
  const w = sug.weightKg != null ? `${ex.trackingType === 'bodyweight_reps' ? '+' : ''}${fmtWeight(sug.weightKg, unit)}${per}` : '';
  let text: string;
  switch (sug.kind) {
    case 'increase':
      text = sug.durationSec ? `You held every set last time — aim for ${fmtSec(sug.durationSec)}.` : `You hit the top of your ${range[0]}–${range[1]} rep range. Try ${w} for ${sug.reps}+ reps.`;
      break;
    case 'more_reps':
      text = w ? `Stay at ${w} and aim for ${sug.reps} reps on each set.` : `Aim for ${sug.reps} reps per set, then add weight.`;
      break;
    case 'hold':
      text = `Reps dipped below ${range[0]} last time. Keep ${w} and build back up to ${sug.reps}+.`;
      break;
    case 'deload':
      text = 'Performance dropped two sessions in a row. Try a lighter session (about 10% less) and check your sleep and calories.';
      break;
  }
  const goalTip =
    goal?.type === 'build_muscle' ? 'Most growth comes from sets of 6–12 reps close to failure.' : goal?.type === 'lose_fat' ? 'Holding your strength in a calorie deficit is a win — keep protein high.' : goal?.type === 'endurance' ? 'For stamina, try supersets or shorter rests (about 60 s).' : null;
  return (
    <div className={compact ? 'mx-1 mb-1 flex gap-2 rounded-lg bg-accent-soft px-2 py-1.5 text-sm' : 'flex gap-3 rounded-2xl bg-accent-soft p-3 text-sm'} role="note" aria-label="How to progress">
      <TrendingUp size={compact ? 16 : 18} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
      <p className="min-w-0">
        {text}
        {sug.kind === 'deload' && !compact && (
          <>
            {' '}
            <Link to="/insights" className="font-semibold text-accent-ink underline">
              See sleep & nutrition
            </Link>
          </>
        )}
        {!compact && goalTip && <span className="mt-1 block text-muted">{goalTip}</span>}
      </p>
    </div>
  );
}
