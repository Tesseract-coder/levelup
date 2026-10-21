import clsx from 'clsx';
import { Check, Plus, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { useCloseSheetThen } from '@/components/sheetHistory';
import { Button, Chip, Input, Segmented } from '@/components/ui';
import type { Equipment, Exercise, ExerciseTracking, Mechanic, Muscle } from '@/db/types';
import { useAllSessions, useExercisePrefs, useExercises, useWeightUnit } from '@/hooks/strength';
import { DAY_TYPE_LABELS } from '@/domain/strength/dayTypes';
import { findDuplicate, rankExercises } from '@/domain/strength/exerciseMatch';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS, MUSCLE_GROUP_OF, MUSCLE_GROUPS, MUSCLE_LABELS, groupsOf, type MuscleGroup } from '@/domain/strength/library';
import { customExercise } from '@/domain/strength/migrate';
import { suggestExercises } from '@/domain/strength/session';
import { fmtPrevSets } from './format';
import type { SheetSpec } from '@/stores/ui';
import { saveCustomExercise, updatePref } from './actions';

type Tab = 'suggested' | 'recent' | 'favorites' | 'all';

export default function ExercisePickerSheet({ spec }: { spec: Extract<SheetSpec, { type: 'exercisePicker' }> }) {
  const closeThen = useCloseSheetThen();
  const { index, get } = useExercises();
  const prefs = useExercisePrefs();
  const unit = useWeightUnit();
  const { data: sessions = [] } = useAllSessions();
  const hasDay = spec.dayTypes.some((d) => d !== 'custom') || !!spec.customDayName;
  const [tab, setTab] = useState<Tab>(hasDay ? 'suggested' : 'recent');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const exclude = useMemo(() => new Set(spec.excludeIds ?? []), [spec.excludeIds]);

  const all = useMemo(() => [...index.values()].filter((e) => !e.archived), [index]);
  const suggestions = useMemo(() => suggestExercises(spec.dayTypes, spec.customDayName, sessions, index), [spec.dayTypes, spec.customDayName, sessions, index]);
  const recent = useMemo(() => {
    const seen = new Map<string, number>();
    for (let i = sessions.length - 1; i >= 0 && seen.size < 30; i--) for (const e of sessions[i].exercises) if (!seen.has(e.exerciseId)) seen.set(e.exerciseId, i);
    return [...seen.keys()].map((id) => index.get(id)).filter((e): e is Exercise => !!e);
  }, [sessions, index]);
  const lastSets = useMemo(() => {
    const m = new Map<string, string>();
    for (let i = sessions.length - 1; i >= 0; i--)
      for (const e of sessions[i].exercises) if (!m.has(e.exerciseId)) m.set(e.exerciseId, fmtPrevSets(e.sets.filter((s) => s.completed), get(e.exerciseId), unit));
    return m;
  }, [sessions, get, unit]);

  const list: Exercise[] = useMemo(() => {
    let base: Exercise[];
    if (query.trim()) base = rankExercises(query, all, 40).map((m) => m.exercise);
    else if (tab === 'suggested') base = suggestions.map((s) => s.exercise);
    else if (tab === 'recent') base = recent;
    else if (tab === 'favorites') base = all.filter((e) => prefs.get(e.id)?.favorite);
    else base = [...all].sort((a, b) => a.name.localeCompare(b.name));
    return base.filter((e) => !exclude.has(e.id) && (!group || groupsOf(e).includes(group)) && (!equipment || e.equipment === equipment));
  }, [query, tab, all, suggestions, recent, prefs, group, equipment, exclude]);

  const lastTimeIds = new Set(suggestions.filter((s) => s.reason === 'last_time').map((s) => s.exercise.id));
  const exact = query.trim() && all.some((e) => e.name.toLowerCase() === query.trim().toLowerCase());
  const single = spec.mode === 'swap';

  const toggle = (id: string) => {
    if (single) {
      void closeThen(() => spec.onPick([id]));
      return;
    }
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  if (creating != null) {
    return (
      <CustomExerciseForm
        initialName={creating}
        pool={all}
        onCancel={() => setCreating(null)}
        onUse={(id) => {
          setCreating(null);
          setQuery('');
          toggle(id);
        }}
      />
    );
  }

  const dayLabel = spec.customDayName || spec.dayTypes.filter((d) => d !== 'custom').map((d) => DAY_TYPE_LABELS[d]).join(' + ');
  return (
    <Sheet
      title={single ? 'Swap exercise' : 'Add exercises'}
      description={dayLabel ? `For ${dayLabel}` : undefined}
      size="tall"
      footer={
        single ? undefined : (
          <Button block disabled={!picked.length} onClick={() => void closeThen(() => spec.onPick(picked))}>
            {picked.length ? `Add ${picked.length} exercise${picked.length > 1 ? 's' : ''}` : 'Tap exercises to add'}
          </Button>
        )
      }
    >
      <div className="sticky top-0 z-10 -mx-5 space-y-2 bg-surface px-5 pb-2">
        <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-3 focus-within:border-accent">
          <Search size={18} className="text-muted" aria-hidden />
          <span className="sr-only">Search exercises</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, e.g. incline press" className="min-w-0 flex-1 bg-transparent text-base outline-none" type="search" enterKeyHint="search" />
        </label>
        {!query && (
          <Segmented
            label="Exercise list"
            value={tab}
            onChange={setTab}
            options={[...(hasDay ? [{ value: 'suggested' as Tab, label: 'For today' }] : []), { value: 'recent', label: 'Recent' }, { value: 'favorites', label: 'Favorites' }, { value: 'all', label: 'All' }]}
          />
        )}
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" data-noswipe>
          {MUSCLE_GROUPS.map((g) => (
            <Chip key={g} selected={group === g} onClick={() => setGroup(group === g ? null : g)} className="shrink-0">
              {MUSCLE_GROUP_LABELS[g]}
            </Chip>
          ))}
        </div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" data-noswipe>
          {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((e) => (
            <Chip key={e} selected={equipment === e} onClick={() => setEquipment(equipment === e ? null : e)} className="shrink-0">
              {EQUIPMENT_LABELS[e]}
            </Chip>
          ))}
        </div>
      </div>

      {list.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          {tab === 'favorites' && !query ? 'Star exercises to find them here.' : tab === 'recent' && !query ? 'Exercises you log will show up here.' : 'No exercises match.'}
        </p>
      )}
      <ul className="divide-y divide-line">
        {list.map((e) => {
          const sel = picked.includes(e.id);
          const fav = !!prefs.get(e.id)?.favorite;
          const last = lastSets.get(e.id);
          return (
            <li key={e.id} className="flex items-center gap-1">
              <button type="button" onClick={() => toggle(e.id)} aria-pressed={single ? undefined : sel} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 text-left">
                {!single && (
                  <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2', sel ? 'border-accent bg-accent text-on-accent' : 'border-line')}>{sel && <Check size={16} strokeWidth={3} />}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {lastTimeIds.has(e.id) && tab === 'suggested' && !query ? 'Last time · ' : ''}
                    {last ?? `${e.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} · ${EQUIPMENT_LABELS[e.equipment]}`}
                  </span>
                </span>
              </button>
              <button type="button" aria-label={fav ? `Unfavorite ${e.name}` : `Favorite ${e.name}`} aria-pressed={fav} onClick={() => void updatePref(e.id, { favorite: !fav })} className="grid h-12 w-12 shrink-0 place-items-center text-muted">
                <Star size={20} className={fav ? 'fill-current text-carbs' : ''} />
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => setCreating(query.trim())} className="mt-2 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 text-left font-medium">
        <Plus size={20} className="text-accent-ink" /> {query.trim() && !exact ? `Create “${query.trim()}”` : 'Create custom exercise'}
      </button>
    </Sheet>
  );
}

// ------------------------------------------------------------ custom exercise

const GROUP_MUSCLE: Record<MuscleGroup, Muscle> = {
  chest: 'chest',
  back: 'lats',
  shoulders: 'side_delts',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  core: 'abs',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
};

const TRACKING_OPTIONS: { value: ExerciseTracking; label: string }[] = [
  { value: 'weight_reps', label: 'Weight × reps' },
  { value: 'bodyweight_reps', label: 'Bodyweight reps' },
  { value: 'duration', label: 'Time' },
  { value: 'weight_duration', label: 'Weight × time' },
];

function CustomExerciseForm({ initialName, pool, onCancel, onUse }: { initialName: string; pool: Exercise[]; onCancel: () => void; onUse: (id: string) => void }) {
  const [name, setName] = useState(initialName);
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<Equipment>('dumbbell');
  const [tracking, setTracking] = useState<ExerciseTracking>('weight_reps');
  const [mechanic, setMechanic] = useState<Mechanic>('compound');
  const dup = name.trim().length > 2 ? findDuplicate(name, pool) : null;

  const save = async () => {
    const muscles = groups.map((g) => GROUP_MUSCLE[g]);
    const ex: Exercise = {
      ...customExercise(name),
      primaryMuscles: muscles,
      equipment,
      trackingType: equipment === 'bodyweight' && tracking === 'weight_reps' ? 'bodyweight_reps' : tracking,
      mechanic,
      forceType: groups.some((g) => ['quads', 'hamstrings', 'glutes', 'calves'].includes(g)) ? 'legs' : groups.some((g) => ['back', 'biceps', 'forearms'].includes(g)) ? 'pull' : groups.includes('core') ? 'core' : 'push',
      bilateralDumbbell: equipment === 'dumbbell',
      defaultRestSec: mechanic === 'compound' ? 90 : 60,
      metCategory: mechanic === 'isolation' ? 'light' : groups.some((g) => MUSCLE_GROUP_OF[GROUP_MUSCLE[g]] === 'quads') ? 'vigorous' : 'moderate',
    };
    await saveCustomExercise(ex);
    onUse(ex.id);
  };

  return (
    <Sheet
      title="New exercise"
      size="tall"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Back</Button>
          <Button block className="flex-1" disabled={name.trim().length < 2 || !groups.length} onClick={save}>
            Create & add
          </Button>
        </div>
      }
    >
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Zottman curl" />
      {dup && (
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-caution-soft p-3 text-sm">
          <span className="min-w-0 flex-1">
            Looks like <b>{dup.name}</b> already exists.
          </span>
          <Button size="sm" variant="secondary" onClick={() => onUse(dup.id)}>Use it</Button>
        </div>
      )}
      <p className="mb-2 mt-5 text-sm font-semibold">Muscles worked</p>
      <div className="flex flex-wrap gap-2">
        {MUSCLE_GROUPS.map((g) => (
          <Chip key={g} selected={groups.includes(g)} onClick={() => setGroups((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]))}>
            {MUSCLE_GROUP_LABELS[g]}
          </Chip>
        ))}
      </div>
      <p className="mb-2 mt-5 text-sm font-semibold">Equipment</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((e) => (
          <Chip key={e} selected={equipment === e} onClick={() => setEquipment(e)}>
            {EQUIPMENT_LABELS[e]}
          </Chip>
        ))}
      </div>
      <p className="mb-2 mt-5 text-sm font-semibold">Track</p>
      <div className="grid grid-cols-2 gap-2">
        {TRACKING_OPTIONS.map((t) => (
          <Chip key={t.value} selected={tracking === t.value} onClick={() => setTracking(t.value)} className="justify-center">
            {t.label}
          </Chip>
        ))}
      </div>
      <p className="mb-2 mt-5 text-sm font-semibold">Type</p>
      <Segmented label="Exercise type" value={mechanic} onChange={setMechanic} options={[{ value: 'compound', label: 'Compound (multi-joint)' }, { value: 'isolation', label: 'Isolation' }]} />
    </Sheet>
  );
}
