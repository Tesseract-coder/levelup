import { ArrowDown, ArrowLeft, ArrowUp, Play, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, Card, Chip, EmptyState, IconButton, Input, PageHeader, Skeleton } from '@/components/ui';
import type { DayType, Routine, RoutineExercise } from '@/db/types';
import { useToday } from '@/hooks/data';
import { useExercises, useRoutines } from '@/hooks/strength';
import { DAY_TYPE_LABELS, DAY_TYPE_ROWS } from '@/domain/strength/dayTypes';
import { moveItem } from '@/domain/strength/session';
import { fmtSec } from '@/domain/strength/units';
import { useUI } from '@/stores/ui';
import { saveRoutine, startWorkout } from './actions';

function Mini({ label, value, onChange, min, max, step = 1, fmt }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; fmt?: (v: number) => string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-surface-2 p-1" role="group" aria-label={label}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="flex items-center">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))} className="grid h-11 w-9 place-items-center text-lg font-bold">
          −
        </button>
        <span className="tabular min-w-8 text-center font-bold">{fmt ? fmt(value) : value}</span>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + step))} className="grid h-11 w-9 place-items-center text-lg font-bold text-accent-ink">
          +
        </button>
      </div>
    </div>
  );
}

export default function RoutineEditorScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const { get } = useExercises();
  const { data: all } = useRoutines(true);
  const openSheet = useUI((s) => s.openSheet);
  const [r, setR] = useState<Routine | null>(null);

  useEffect(() => {
    const found = all?.find((x) => x.id === id);
    if (found && !r) setR(found);
  }, [all, id, r]);
  // autosave edits
  useEffect(() => {
    if (!r) return;
    const t = setTimeout(() => void saveRoutine(r), 300);
    return () => clearTimeout(t);
  }, [r]);

  if (!all) return <Skeleton className="m-4 h-64" />;
  if (!r) return <EmptyState title="Routine not found" action={<Button onClick={() => navigate('/routines', { replace: true })}>All routines</Button>} />;

  const patchEx = (i: number, p: Partial<RoutineExercise>) => setR({ ...r, exercises: r.exercises.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const toggleDay = (d: DayType) => setR({ ...r, dayTypes: r.dayTypes.includes(d) ? r.dayTypes.filter((x) => x !== d) : [...r.dayTypes, d] });

  return (
    <div>
      <PageHeader title="Edit routine" left={<IconButton label="Back" onClick={() => navigate(-1)}><ArrowLeft size={22} /></IconButton>} />
      <div className="space-y-4 px-4 pb-6">
        <Input label="Name" value={r.name} maxLength={40} onChange={(e) => setR({ ...r, name: e.target.value })} />
        <div>
          <p className="mb-2 text-sm font-semibold">Day type</p>
          <div className="flex flex-wrap gap-2">
            {[...new Set(DAY_TYPE_ROWS.flat())].map((d) => (
              <Chip key={d} selected={r.dayTypes.includes(d)} onClick={() => toggleDay(d)}>
                {DAY_TYPE_LABELS[d]}
              </Chip>
            ))}
          </div>
        </div>

        <ul className="space-y-2">
          {r.exercises.map((e, i) => (
            <li key={`${e.exerciseId}-${i}`}>
              <Card className="p-3">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate font-bold">{get(e.exerciseId).name}</span>
                  <IconButton label={`Move ${get(e.exerciseId).name} up`} disabled={i === 0} onClick={() => setR({ ...r, exercises: moveItem(r.exercises, i, i - 1) })}><ArrowUp size={18} /></IconButton>
                  <IconButton label={`Move ${get(e.exerciseId).name} down`} disabled={i === r.exercises.length - 1} onClick={() => setR({ ...r, exercises: moveItem(r.exercises, i, i + 1) })}><ArrowDown size={18} /></IconButton>
                  <IconButton label={`Remove ${get(e.exerciseId).name}`} onClick={() => setR({ ...r, exercises: r.exercises.filter((_, j) => j !== i) })}><X size={18} /></IconButton>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  <Mini label="Sets" value={e.targetSets} min={1} max={10} onChange={(v) => patchEx(i, { targetSets: v })} />
                  <Mini label="Min reps" value={e.repMin} min={1} max={e.repMax} onChange={(v) => patchEx(i, { repMin: v })} />
                  <Mini label="Max reps" value={e.repMax} min={e.repMin} max={100} onChange={(v) => patchEx(i, { repMax: v })} />
                  <Mini label="Rest" value={e.restSec ?? get(e.exerciseId).defaultRestSec} min={0} max={600} step={15} fmt={fmtSec} onChange={(v) => patchEx(i, { restSec: v })} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
        <Button
          block
          variant="soft"
          onClick={() =>
            openSheet({
              type: 'exercisePicker',
              dayTypes: r.dayTypes,
              customDayName: r.dayTypes.length ? undefined : r.name,
              mode: 'add',
              excludeIds: r.exercises.map((e) => e.exerciseId),
              onPick: (ids) => setR((cur) => cur && { ...cur, exercises: [...cur.exercises, ...ids.map((exerciseId) => ({ exerciseId, targetSets: 3, repMin: 8, repMax: 12 }))] }),
            })
          }
        >
          <Plus size={18} /> Add exercises
        </Button>
        <Button block size="lg" disabled={!r.exercises.length} onClick={async () => { await saveRoutine(r); navigate(`/workout/${await startWorkout({ date: today, dayTypes: r.dayTypes, mode: 'live', routine: r })}`); }}>
          <Play size={18} /> Start this routine
        </Button>
      </div>
    </div>
  );
}
