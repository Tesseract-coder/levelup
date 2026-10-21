import clsx from 'clsx';
import { Check, ListPlus, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button, Card, Chip, EstimateBadge, Input, Skeleton } from '@/components/ui';
import { repo } from '@/db';
import type { StrengthSession } from '@/db/types';
import { useAllSessions, useExercises, useRoutines, useWeightUnit } from '@/hooks/strength';
import { dayTitle } from '@/domain/strength/dayTypes';
import { groupsOf, MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/strength/library';
import { exerciseVolume, sessionTotals, setE1rm } from '@/domain/strength/metrics';
import { PR_LABEL } from '@/domain/strength/prs';
import { compareToLastSameDay, routineFromSession } from '@/domain/strength/session';
import { fmtVolume, fmtWeight } from '@/domain/strength/units';
import { haptic } from '@/lib/haptics';
import { refresh } from '@/lib/queryClient';
import { useUI } from '@/stores/ui';
import { fmtPrevSets, fmtSet } from './format';

async function patchSession(s: StrengthSession, patch: Partial<StrengthSession>) {
  const next = { ...s, ...patch };
  const log = s.activityLogId ? await repo.getLog(s.activityLogId) : undefined;
  await repo.saveSession(next, log && 'notes' in patch ? { ...log, notes: patch.notes } : undefined);
  await refresh();
}

export default function WorkoutSummaryScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const unit = useWeightUnit();
  const { get } = useExercises();
  const { data: sessions = [] } = useAllSessions();
  const { data: routines = [] } = useRoutines(true);
  const { data: s } = useQuery({ queryKey: ['session', id], queryFn: async () => (await repo.getSession(id)) ?? null });
  const [notes, setNotes] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState<string | null>(null);

  const prs = useMemo(
    () => (s ? s.exercises.flatMap((e) => e.sets.filter((x) => x.isPR).flatMap((x) => (x.prTypes ?? []).map((t) => ({ entry: e, set: x, type: t })))) : []),
    [s],
  );
  useEffect(() => {
    if (prs.length) haptic([20, 60, 20, 60, 40]);
  }, [prs.length]);

  if (s === undefined) return <Skeleton className="m-4 h-64" />;
  if (s === null) return <Navigate to="/" replace />;
  const t = sessionTotals(s);
  const title = dayTitle(s.dayTypes, s.customDayName);
  const cmp = compareToLastSameDay(s, sessions);
  const muscles = [...new Set(s.exercises.flatMap((e) => groupsOf(get(e.exerciseId))))] as MuscleGroup[];
  const stats: [string, string][] = [
    ['min', String(s.durationMin)],
    ['exercises', String(t.exercises)],
    ['sets', String(t.sets)],
    ['reps', String(t.reps)],
  ];

  return (
    <div className="space-y-4 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div className="pt-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-good-soft text-good">
          <Check size={28} strokeWidth={3} aria-hidden />
        </span>
        <h1 className="mt-3 text-2xl font-extrabold">{title} done</h1>
        <p className="text-muted">{new Date(s.startedAt).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}</p>
      </div>

      <Card className="grid grid-cols-4 gap-1 text-center">
        {stats.map(([label, v]) => (
          <div key={label}>
            <p className="tabular text-xl font-extrabold">{v}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </Card>
      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">Total volume</span>
          <span className="tabular font-bold">{fmtVolume(s.totalVolumeKg, unit)}</span>
        </div>
        {cmp && (
          <p className={clsx('text-sm', cmp.pct >= 0 ? 'text-good' : 'text-muted')}>
            {cmp.pct >= 0 ? '+' : ''}
            {cmp.pct}% volume vs last {title} ({fmtVolume(cmp.last.totalVolumeKg, unit)})
          </p>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
          <span className="text-muted">Calories burned</span>
          <span className="tabular flex items-center gap-2 font-bold">
            ≈ {s.kcalLow}–{s.kcalHigh} kcal <EstimateBadge note="An estimate from MET values, your body weight and active time. See the breakdown below." />
          </span>
        </div>
      </Card>

      {prs.length > 0 && (
        <Card className="motion-safe:animate-rise bg-good-soft shadow-none" aria-live="polite">
          <h2 className="flex items-center gap-2 font-extrabold">
            <Trophy size={20} className="text-good" aria-hidden /> {prs.length === 1 ? 'New personal record' : `${prs.length} new personal records`} 🎉
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {prs.map(({ entry, set, type }) => (
              <li key={`${set.id}-${type}`}>
                <b>{get(entry.exerciseId).name}</b> · {PR_LABEL[type]}:{' '}
                {type === 'e1rm' ? `≈ ${fmtWeight(setE1rm(set, get(entry.exerciseId), { bodyWeightKg: s.bodyWeightKg }) ?? 0, unit)} (${fmtSet(set, get(entry.exerciseId), unit)})` : type === 'volume' ? fmtVolume(exerciseVolume(entry, get(entry.exerciseId), { bodyWeightKg: s.bodyWeightKg }), unit) : fmtSet(set, get(entry.exerciseId), unit)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {muscles.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted">Muscles worked</h2>
          <div className="flex flex-wrap gap-1.5">
            {muscles.map((m) => (
              <span key={m} className="rounded-full bg-surface-2 px-3 py-1 text-sm">
                {MUSCLE_GROUP_LABELS[m]}
              </span>
            ))}
          </div>
        </div>
      )}

      <Card>
        <h2 className="mb-1 font-bold">Exercises</h2>
        <ul className="divide-y divide-line">
          {s.exercises.map((e) => {
            const ex = get(e.exerciseId);
            return (
              <li key={e.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{ex.name}</span>
                  <span className="block truncate text-sm text-muted">{fmtPrevSets(e.sets, ex, unit)}</span>
                </span>
                {e.kcalShare != null && <span className="tabular shrink-0 text-sm text-muted">≈{e.kcalShare} kcal</span>}
              </li>
            );
          })}
        </ul>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold">How was your energy?</h2>
        <div role="radiogroup" aria-label="Energy rating" className="grid grid-cols-5 gap-2">
          {['Drained', 'Low', 'OK', 'Good', 'Great'].map((l, i) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={s.energyRating === i + 1}
              onClick={() => void patchSession(s, { energyRating: i + 1 })}
              className={clsx('flex min-h-14 flex-col items-center justify-center rounded-xl text-xs font-medium', s.energyRating === i + 1 ? 'bg-accent text-on-accent' : 'bg-surface-2')}
            >
              <span className="text-base font-bold">{i + 1}</span>
              {l}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Session notes</span>
        <textarea value={notes ?? s.notes ?? ''} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes != null && void patchSession(s, { notes: notes.trim() || undefined })} rows={2} maxLength={500} className="w-full rounded-2xl border border-line bg-surface p-3" />
      </label>

      {routineName == null ? (
        <Button block variant="secondary" onClick={() => setRoutineName(`${title}${routines.some((r) => r.name === title) ? ' B' : ''}`)}>
          <ListPlus size={18} /> Save as routine
        </Button>
      ) : (
        <Card className="space-y-2">
          <Input label="Routine name" value={routineName} maxLength={40} onChange={(e) => setRoutineName(e.target.value)} />
          <div className="flex gap-2">
            <Chip onClick={() => setRoutineName(null)}>Cancel</Chip>
            <Button
              className="flex-1"
              size="sm"
              disabled={!routineName.trim()}
              onClick={async () => {
                await repo.saveRoutine(routineFromSession(s, routineName, routines.length));
                await refresh();
                setRoutineName(null);
                useUI.getState().showSnack({ message: `Saved “${routineName.trim()}” — start it from the day picker` });
              }}
            >
              Save routine
            </Button>
          </div>
        </Card>
      )}
      <Button block size="lg" onClick={() => navigate('/', { replace: true })}>
        Done
      </Button>
    </div>
  );
}
