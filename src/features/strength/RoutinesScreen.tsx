import { Archive, ArrowDown, ArrowLeft, ArrowUp, CalendarDays, ChevronRight, Copy, Play, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, EmptyState, IconButton, PageHeader, SectionHeader, Skeleton } from '@/components/ui';
import type { Routine } from '@/db/types';
import { useToday } from '@/hooks/data';
import { useRoutines, useSplitPlans } from '@/hooks/strength';
import { dayTitle } from '@/domain/strength/dayTypes';
import { TEMPLATES } from '@/domain/strength/templates';
import { newId } from '@/lib/id';
import { useUI } from '@/stores/ui';
import { addTemplate, duplicateRoutine, saveRoutine, startWorkout } from './actions';

export default function RoutinesScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const { data: all } = useRoutines(true);
  const { data: plans = [] } = useSplitPlans();
  const [showArchived, setShowArchived] = useState(false);
  const active = plans.find((p) => p.active);

  if (!all) return <Skeleton className="m-4 h-64" />;
  const routines = all.filter((r) => !r.archived);
  const archived = all.filter((r) => r.archived);

  const move = async (r: Routine, dir: -1 | 1) => {
    const i = routines.indexOf(r);
    const other = routines[i + dir];
    if (!other) return;
    await saveRoutine({ ...r, order: other.order });
    await saveRoutine({ ...other, order: r.order });
  };
  const create = async () => {
    const now = Date.now();
    const r: Routine = { id: newId(), name: 'New routine', dayTypes: [], exercises: [], archived: false, order: all.length, createdAt: now, updatedAt: now };
    await saveRoutine(r);
    navigate(`/routines/${r.id}`);
  };

  return (
    <div>
      <PageHeader title="Routines" left={<IconButton label="Back" onClick={() => navigate(-1)}><ArrowLeft size={22} /></IconButton>} />
      <div className="space-y-3 px-4">
        <button type="button" onClick={() => navigate('/split')} className="block w-full text-left">
          <Card className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-activity-soft text-activity">
              <CalendarDays size={20} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Weekly split</span>
              <span className="block truncate text-sm text-muted">{active ? `${active.name} · ${Object.keys(active.days).length} days a week` : 'Plan which day you train what'}</span>
            </span>
            <ChevronRight size={18} className="text-muted" aria-hidden />
          </Card>
        </button>

        <SectionHeader title="Your routines" action={<Button size="sm" variant="ghost" onClick={() => void create()}><Plus size={18} /> New</Button>} />
        {routines.length === 0 ? (
          <Card>
            <EmptyState title="No routines yet" body="Save a finished workout as a routine, build one from scratch, or start from a program below." />
          </Card>
        ) : (
          <ul className="space-y-2">
            {routines.map((r, i) => (
              <li key={r.id}>
                <Card className="p-3">
                  <button type="button" onClick={() => navigate(`/routines/${r.id}`)} className="block w-full text-left">
                    <span className="block font-bold">{r.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {r.dayTypes.length ? `${dayTitle(r.dayTypes)} · ` : ''}
                      {r.exercises.length} exercises · {r.exercises.reduce((t, e) => t + e.targetSets, 0)} sets
                    </span>
                  </button>
                  <div className="mt-2 flex items-center gap-1">
                    <Button size="sm" disabled={!r.exercises.length} onClick={async () => navigate(`/workout/${await startWorkout({ date: today, dayTypes: r.dayTypes, mode: 'live', routine: r })}`)}>
                      <Play size={16} /> Start
                    </Button>
                    <span className="flex-1" />
                    <IconButton label={`Move ${r.name} up`} disabled={i === 0} onClick={() => void move(r, -1)}><ArrowUp size={18} /></IconButton>
                    <IconButton label={`Move ${r.name} down`} disabled={i === routines.length - 1} onClick={() => void move(r, 1)}><ArrowDown size={18} /></IconButton>
                    <IconButton label={`Duplicate ${r.name}`} onClick={() => void duplicateRoutine(r, all.length)}><Copy size={18} /></IconButton>
                    <IconButton
                      label={`Archive ${r.name}`}
                      onClick={async () => {
                        await saveRoutine({ ...r, archived: true });
                        useUI.getState().showSnack({ message: `${r.name} archived`, actionLabel: 'Undo', onAction: () => void saveRoutine({ ...r, archived: false }) });
                      }}
                    >
                      <Archive size={18} />
                    </IconButton>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <SectionHeader title="Starter programs" />
        <ul className="space-y-2">
          {TEMPLATES.map((t) => (
            <li key={t.key}>
              <Card className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.name}</span>
                  <span className="block text-sm text-muted">{t.description}</span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const plan = await addTemplate(t.key);
                    useUI.getState().showSnack({ message: `Added ${t.days.length} routines — review the split, then turn it on` });
                    navigate(`/split?plan=${plan.id}`);
                  }}
                >
                  Add
                </Button>
              </Card>
            </li>
          ))}
        </ul>

        {archived.length > 0 && (
          <>
            <button type="button" onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived} className="min-h-11 text-sm font-semibold text-muted">
              {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
            </button>
            {showArchived && (
              <ul className="space-y-2 pb-4">
                {archived.map((r) => (
                  <li key={r.id}>
                    <Card className="flex items-center gap-2 p-3">
                      <span className="min-w-0 flex-1 truncate text-muted">{r.name}</span>
                      <Button size="sm" variant="ghost" onClick={() => void saveRoutine({ ...r, archived: false })}>
                        <RotateCcw size={16} /> Restore
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
