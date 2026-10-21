import { Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { Button, Card, EstimateBadge, Skeleton } from '@/components/ui';
import { repo } from '@/db';
import { useExercises, useWeightUnit } from '@/hooks/strength';
import { dayTitle } from '@/domain/strength/dayTypes';
import { sessionTotals } from '@/domain/strength/metrics';
import { fmtVolume } from '@/domain/strength/units';
import { fmtPrevSets } from './format';

export default function WorkoutSummaryScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const unit = useWeightUnit();
  const { get } = useExercises();
  const { data: s } = useQuery({ queryKey: ['session', id], queryFn: async () => (await repo.getSession(id)) ?? null });
  if (!s) return <Skeleton className="m-4 h-64" />;
  const t = sessionTotals(s);
  return (
    <div className="space-y-4 p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div className="pt-4 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-good-soft text-good">
          <Check size={28} strokeWidth={3} />
        </span>
        <h1 className="mt-3 text-2xl font-extrabold">{dayTitle(s.dayTypes, s.customDayName)} done</h1>
        <p className="text-muted">{s.durationMin} min</p>
      </div>
      <Card className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="tabular text-xl font-extrabold">{t.sets}</p>
          <p className="text-xs text-muted">sets</p>
        </div>
        <div>
          <p className="tabular text-xl font-extrabold">{t.reps}</p>
          <p className="text-xs text-muted">reps</p>
        </div>
        <div>
          <p className="tabular text-xl font-extrabold">{fmtVolume(s.totalVolumeKg, unit)}</p>
          <p className="text-xs text-muted">volume</p>
        </div>
      </Card>
      <Card className="flex items-center justify-between">
        <span>Calories burned</span>
        <span className="flex items-center gap-2 font-bold">
          ≈ {s.kcalLow}–{s.kcalHigh} kcal <EstimateBadge note="Estimated from MET, your body weight and active time." />
        </span>
      </Card>
      <Card>
        <ul className="divide-y divide-line">
          {s.exercises.map((e) => (
            <li key={e.id} className="py-2">
              <p className="font-semibold">{get(e.exerciseId).name}</p>
              <p className="text-sm text-muted">{fmtPrevSets(e.sets, get(e.exerciseId), unit)}</p>
            </li>
          ))}
        </ul>
      </Card>
      <Button block size="lg" onClick={() => navigate('/', { replace: true })}>
        Done
      </Button>
    </div>
  );
}
