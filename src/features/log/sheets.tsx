import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { Apple, ChevronRight, Dumbbell, GlassWater, ListChecks, MessageSquareText, Moon, Plus, Scale, Smile, Trash2, Trophy, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { useCloseSheet, useNavigateFromSheets } from '@/components/sheetHistory';
import { ActivityIcon } from '@/components/icons';
import { Button, Chip, EstimateBadge, Input, Segmented, Stepper } from '@/components/ui';
import { repo } from '@/db';
import type { ActivityDef, DateKey, Intensity, StrengthExercise } from '@/db/types';
import { removeWithUndo, useActivities, useGoal, useLatestWeight, useProfile } from '@/hooks/data';
import { useUI } from '@/stores/ui';
import { dayValue, formatValue, indexLogs } from '@/domain/habits';
import { caloriesBurned } from '@/domain/presets';
import { formatDuration, sleepDuration } from '@/domain/dates';
import { kgToLb, lbToKg } from '@/domain/targets';
import { findPRs, logValue, saveSleep, saveWorkout, setAvoidAnswer, toggleCheck } from './actions';
import { newId } from '@/lib/id';
import { refresh } from '@/lib/queryClient';
import { useSelectedDate } from '@/hooks/data';

// ------------------------------------------------------------------ Quick Add

export function QuickAddSheet() {
  const date = useSelectedDate();
  const openSheet = useUI((s) => s.openSheet);
  const go = useNavigateFromSheets();
  const { data: acts = [] } = useActivities();
  const water = acts.find((a) => a.special === 'water');
  const habits = acts.filter((a) => a.kind === 'habit' && a.special !== 'water');
  const [habitPicker, setHabitPicker] = useState(false);

  const items = [
    { label: 'Log food', hint: 'Type or speak what you ate', icon: Apple, color: 'var(--protein)', bg: 'var(--protein-soft)', onClick: () => go('/food/new') },
    { label: 'Log workout', hint: 'Duration, intensity, sets', icon: Dumbbell, color: 'var(--activity)', bg: 'var(--activity-soft)', onClick: () => openSheet({ type: 'workout', date }, { replace: true }) },
    { label: 'Log habit', hint: 'Check off or add a value', icon: ListChecks, color: 'var(--habit)', bg: 'var(--habit-soft)', onClick: () => setHabitPicker(true) },
    { label: 'Log weight', hint: 'Weight & measurements', icon: Scale, color: 'var(--accent-ink)', bg: 'var(--accent-soft)', onClick: () => openSheet({ type: 'weight', date }, { replace: true }) },
    { label: 'Log water', hint: water ? 'Quick-add glasses' : 'Track your water', icon: GlassWater, color: 'var(--water)', bg: 'var(--water-soft)', onClick: () => openSheet({ type: 'water', date }, { replace: true }) },
  ];

  if (habitPicker) {
    return (
      <Sheet title="Log a habit">
        <ul className="space-y-2 pb-2">
          {habits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 text-left"
                onClick={() => (h.special === 'sleep' ? openSheet({ type: 'sleep', date }, { replace: true }) : openSheet({ type: 'habit', activityId: h.id, date }, { replace: true }))}
              >
                <ActivityIcon name={h.icon} className="text-habit" />
                <span className="flex-1 font-medium">{h.name}</span>
                <ChevronRight size={18} className="text-muted" />
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 text-left" onClick={() => openSheet({ type: 'activityEditor', kind: 'habit' }, { replace: true })}>
              <Plus size={20} className="text-accent-ink" /> <span className="font-medium">New habit</span>
            </button>
          </li>
        </ul>
      </Sheet>
    );
  }

  return (
    <Sheet title="Quick add">
      <ul className="space-y-2 pb-2">
        {items.map((it) => (
          <li key={it.label}>
            <button type="button" onClick={it.onClick} className="flex min-h-16 w-full items-center gap-4 rounded-2xl bg-surface-2 px-4 text-left active:scale-[0.99]">
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: it.bg, color: it.color }}>
                <it.icon size={22} aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{it.label}</span>
                <span className="block text-sm text-muted">{it.hint}</span>
              </span>
              <ChevronRight size={18} className="text-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-2 pb-2">
        <Button variant="secondary" size="sm" onClick={() => openSheet({ type: 'activityText', date }, { replace: true })}>
          <MessageSquareText size={18} /> Describe your day
        </Button>
        <Button variant="secondary" size="sm" onClick={() => openSheet({ type: 'mood', date }, { replace: true })}>
          <Smile size={18} /> Mood & energy
        </Button>
      </div>
    </Sheet>
  );
}

// --------------------------------------------------------------- habit entry

function useDayIdx(date: DateKey, activityId?: string) {
  return useQuery({
    queryKey: ['dayIdx', date, activityId],
    queryFn: async () => {
      const [logs, sleep] = await Promise.all([repo.logsInRange(date, date, activityId), repo.sleepInRange(date, date)]);
      return { logs, idx: indexLogs(logs, sleep) };
    },
  });
}

export function HabitSheet({ activityId, date }: { activityId: string; date: DateKey }) {
  const close = useCloseSheet();
  const openSheet = useUI((s) => s.openSheet);
  const { data: acts = [] } = useActivities(true);
  const def = acts.find((a) => a.id === activityId);
  const { data } = useDayIdx(date, activityId);
  const current = def && data ? dayValue(def, date, data.idx) : null;
  const [value, setValue] = useState<number | null>(null);

  if (!def) return null;
  const isSet = def.aggregate === 'last';
  const shown = value ?? (isSet ? current ?? def.target ?? 0 : def.presets?.[0] ?? (def.trackingType === 'count' ? 1 : 10));

  if (def.trackingType === 'check') {
    return (
      <Sheet title={def.name}>
        <Button block size="lg" onClick={async () => { await toggleCheck(def, date); close(); }}>
          {current ? 'Mark as not done' : 'Mark as done'}
        </Button>
      </Sheet>
    );
  }
  if (def.trackingType === 'avoid') {
    return (
      <Sheet title={def.name} description="Did you avoid it today?">
        <div className="grid grid-cols-2 gap-3 pb-2">
          <Button size="lg" onClick={async () => { await setAvoidAnswer(def, date, true); close(); }}>Yes, avoided</Button>
          <Button size="lg" variant="secondary" onClick={async () => { await setAvoidAnswer(def, date, false); close(); }}>Not today</Button>
        </div>
        <p className="mt-2 text-sm text-muted">Either answer keeps your log honest — tomorrow is a fresh start.</p>
      </Sheet>
    );
  }

  const stepSize = def.special === 'steps' ? 500 : def.unit === 'h' ? 0.5 : def.unit === 'ml' ? 250 : def.trackingType === 'duration' ? 5 : 1;
  return (
    <Sheet
      title={def.name}
      description={
        current != null
          ? `Today so far: ${formatValue(def, current)}${def.target ? ` of ${formatValue(def, def.target)}` : ''}`
          : def.target
            ? `Target ${formatValue(def, def.target)}`
            : undefined
      }
      footer={
        <div className="flex gap-2">
          {current != null && (
            <Button variant="secondary" onClick={() => openSheet({ type: 'activityEditor', activityId: def.id }, { replace: true })}>Edit habit</Button>
          )}
          <Button
            block
            className="flex-1"
            onClick={async () => {
              await logValue(def, date, shown, isSet ? 'set' : 'add');
              close();
            }}
          >
            {isSet ? 'Save' : `Add ${formatValue(def, shown)}`}
          </Button>
        </div>
      }
    >
      <Stepper label={def.name} value={shown} step={stepSize} decimals={def.unit === 'h' ? 1 : 0} unit={def.unit} onChange={setValue} />
      {def.presets && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {def.presets.map((p) => (
            <Chip key={p} selected={shown === p} onClick={() => setValue(p)}>
              {isSet ? '' : '+'}
              {formatValue(def, p)}
            </Chip>
          ))}
        </div>
      )}
      <DayLogs def={def} date={date} />
    </Sheet>
  );
}

function DayLogs({ def, date }: { def: ActivityDef; date: DateKey }) {
  const { data } = useDayIdx(date, def.id);
  const logs = data?.logs ?? [];
  if (!logs.length || def.aggregate === 'last') return null;
  return (
    <div className="mt-5">
      <p className="mb-1 text-sm font-semibold text-muted">Logged today</p>
      <ul>
        {logs.map((l) => (
          <li key={l.id} className="flex min-h-11 items-center justify-between border-b border-line">
            <span className="tabular">
              {formatValue(def, l.value)} · {new Date(l.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
            <button type="button" aria-label="Delete entry" className="grid h-11 w-11 place-items-center text-muted" onClick={() => removeWithUndo('activityLogs', l.id, 'Entry')}>
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------- water

export function WaterSheet({ date }: { date: DateKey }) {
  const close = useCloseSheet();
  const { data: acts = [] } = useActivities();
  const { data: goal } = useGoal();
  const water = acts.find((a) => a.special === 'water');
  const { data } = useDayIdx(date, water?.id);
  const total = water && data ? dayValue(water, date, data.idx) ?? 0 : 0;
  const target = water?.target ?? goal?.waterTargetMl ?? 2500;
  const [custom, setCustom] = useState(250);

  async function ensureWater(): Promise<ActivityDef> {
    if (water) return water;
    const { HABIT_PRESETS, presetToDef } = await import('@/domain/presets');
    const def = presetToDef(HABIT_PRESETS.find((p) => p.special === 'water')!, acts.length, { target });
    await repo.saveActivity(def);
    return def;
  }
  const add = async (ml: number) => logValue(await ensureWater(), date, ml, 'add');

  const pct = Math.min(1, total / target);
  return (
    <Sheet title="Water" description={`${formatValue({ special: 'water', trackingType: 'numeric' }, total)} of ${formatValue({ special: 'water', trackingType: 'numeric' }, target)}`}>
      <div className="mx-auto mb-5 h-3 w-full overflow-hidden rounded-full bg-water-soft" role="progressbar" aria-label="Water progress" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-water transition-[width] duration-500" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          [250, 'Glass'],
          [500, 'Bottle'],
          [750, 'Large'],
        ].map(([ml, label]) => (
          <button key={ml} type="button" onClick={() => add(ml as number)} className="flex min-h-20 flex-col items-center justify-center rounded-2xl bg-water-soft text-ink active:scale-95">
            <GlassWater size={22} className="text-water" aria-hidden />
            <span className="mt-1 font-bold">+{ml} ml</span>
            <span className="text-xs">{label}</span>
          </button>
        ))}
      </div>
      <div className="mt-5">
        <Stepper label="Custom amount" value={custom} step={50} min={50} max={2000} unit="ml" onChange={setCustom} />
        <Button block variant="soft" className="mt-3" onClick={() => add(custom)}>
          Add {custom} ml
        </Button>
      </div>
      {water && <DayLogs def={water} date={date} />}
      <Button block variant="ghost" className="mt-3" onClick={close}>
        Done
      </Button>
    </Sheet>
  );
}

// ------------------------------------------------------------------- sleep

export function SleepSheet({ date }: { date: DateKey }) {
  const close = useCloseSheet();
  const { data: existing } = useQuery({ queryKey: ['sleep', date], queryFn: async () => (await repo.sleepInRange(date, date))[0] ?? null });
  const [bed, setBed] = useState<string | null>(null);
  const [wake, setWake] = useState<string | null>(null);
  const [quality, setQuality] = useState<number | undefined>(undefined);
  const b = bed ?? existing?.bedtime ?? '23:00';
  const w = wake ?? existing?.wake ?? '06:30';
  const q = quality ?? existing?.quality;
  const dur = sleepDuration(b, w);
  return (
    <Sheet
      title="Sleep"
      description="Logged for the morning you woke up"
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button variant="danger" aria-label="Delete sleep log" onClick={async () => { await removeWithUndo('sleepLogs', existing.id, 'Sleep log'); close(); }}>
              <Trash2 size={18} />
            </Button>
          )}
          <Button block className="flex-1" onClick={async () => { await saveSleep(date, b, w, q, existing?.id); close(); }}>
            Save {formatDuration(dur)}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <TimeField label="Bedtime" value={b} onChange={setBed} />
        <TimeField label="Woke up" value={w} onChange={setWake} />
      </div>
      <div className="mt-4 rounded-2xl bg-sleep-soft p-4 text-center">
        <Moon className="mx-auto text-sleep" aria-hidden />
        <p className="tabular mt-1 text-3xl font-extrabold">{formatDuration(dur)}</p>
        {dur > 14 * 60 && <p className="text-sm text-muted">That's a long one — double-check the times.</p>}
      </div>
      <p className="mb-2 mt-5 text-sm font-semibold">How well did you sleep? (optional)</p>
      <RatingRow value={q} onChange={setQuality} labels={['Poor', 'Fair', 'OK', 'Good', 'Great']} name="Sleep quality" />
    </Sheet>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="tabular min-h-14 w-full rounded-2xl border border-line bg-surface px-4 text-xl font-bold" />
    </label>
  );
}

function RatingRow({ value, onChange, labels, name }: { value?: number; onChange: (v: number) => void; labels: string[]; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-5 gap-2">
      {labels.map((l, i) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          onClick={() => onChange(i + 1)}
          className={clsx('flex min-h-14 flex-col items-center justify-center rounded-xl text-xs font-medium', value === i + 1 ? 'bg-accent text-on-accent' : 'bg-surface-2')}
        >
          <span className="text-base font-bold">{i + 1}</span>
          {l}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ weight

export function WeightSheet({ date }: { date: DateKey }) {
  const close = useCloseSheet();
  const { data: profile } = useProfile();
  const { data: latest } = useLatestWeight();
  const imperial = profile?.units === 'imperial';
  const [w, setW] = useState<number | null>(null);
  const [showMeasure, setShowMeasure] = useState(false);
  const [m, setM] = useState<Record<string, string>>({});
  const base = latest?.weightKg ?? 70;
  const shown = w ?? Number((imperial ? kgToLb(base) : base).toFixed(1));
  const fields = [
    ['waistCm', 'Waist'],
    ['hipCm', 'Hips'],
    ['chestCm', 'Chest'],
    ['armCm', 'Arm'],
    ['thighCm', 'Thigh'],
  ] as const;
  return (
    <Sheet
      title="Weight"
      description={latest ? `Last: ${imperial ? `${kgToLb(latest.weightKg!).toFixed(1)} lb` : `${latest.weightKg!.toFixed(1)} kg`} on ${latest.date}` : undefined}
      footer={
        <Button
          block
          onClick={async () => {
            const kg = imperial ? lbToKg(shown) : shown;
            const measurements = Object.fromEntries(fields.map(([k]) => [k, parseFloat(m[k])]).filter(([, v]) => Number.isFinite(v as number)));
            await repo.saveBody({ id: newId(), date, weightKg: Math.round(kg * 10) / 10, measurements: Object.keys(measurements).length ? measurements : undefined, createdAt: Date.now() });
            await refresh();
            close();
          }}
        >
          Save
        </Button>
      }
    >
      <Stepper label="Weight" value={shown} step={0.1} decimals={1} min={20} max={700} unit={imperial ? 'lb' : 'kg'} onChange={setW} />
      <p className="mt-3 text-center text-sm text-muted">Day-to-day changes are mostly water. The trend line in Insights is what matters.</p>
      <button type="button" className="mt-4 min-h-11 text-sm font-semibold text-accent-ink" onClick={() => setShowMeasure((s) => !s)} aria-expanded={showMeasure}>
        {showMeasure ? 'Hide' : 'Add'} body measurements (optional)
      </button>
      {showMeasure && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          {fields.map(([k, label]) => (
            <Input key={k} label={label} inputMode="decimal" suffix="cm" value={m[k] ?? ''} onChange={(e) => setM((x) => ({ ...x, [k]: e.target.value }))} />
          ))}
        </div>
      )}
    </Sheet>
  );
}

// -------------------------------------------------------------------- mood

export function MoodSheet({ date }: { date: DateKey }) {
  const close = useCloseSheet();
  const { data: existing } = useQuery({ queryKey: ['mood', date], queryFn: async () => (await repo.moodInRange(date, date))[0] ?? null });
  const [mood, setMood] = useState<number | undefined>();
  const [energy, setEnergy] = useState<number | undefined>();
  const md = mood ?? existing?.mood;
  const en = energy ?? existing?.energy;
  return (
    <Sheet
      title="Mood & energy"
      description="A 5-second check-in. Insights will show what helps."
      footer={
        <Button block disabled={!md || !en} onClick={async () => { await repo.saveMood({ id: existing?.id ?? newId(), date, mood: md!, energy: en!, createdAt: Date.now() }); await refresh(); close(); }}>
          Save
        </Button>
      }
    >
      <p className="mb-2 font-semibold">Mood</p>
      <RatingRow value={md} onChange={setMood} labels={['Low', 'Meh', 'OK', 'Good', 'Great']} name="Mood" />
      <p className="mb-2 mt-5 font-semibold">Energy</p>
      <RatingRow value={en} onChange={setEnergy} labels={['Drained', 'Low', 'OK', 'Good', 'Charged']} name="Energy" />
    </Sheet>
  );
}

// ----------------------------------------------------------------- workout

const emptyExercise = (): StrengthExercise => ({ name: '', sets: [{ reps: 10, weightKg: 0 }] });

export function WorkoutSheet({ activityId, logId, date }: { activityId?: string; logId?: string; date: DateKey }) {
  const close = useCloseSheet();
  const openSheet = useUI((s) => s.openSheet);
  const { data: acts = [] } = useActivities(true);
  const workouts = acts.filter((a) => a.kind === 'workout' && (!a.archived || a.id === activityId));
  const { data: latest } = useLatestWeight();
  const { data: profile } = useProfile();
  const { data: existing } = useQuery({ queryKey: ['log', logId], enabled: !!logId, queryFn: async () => (await repo.logsInRange('0000-00-00', '9999-12-31')).find((l) => l.id === logId) ?? null });

  const [picked, setPicked] = useState<string | undefined>(activityId);
  const def = workouts.find((w) => w.id === (picked ?? existing?.activityId));
  const [duration, setDuration] = useState<number | null>(null);
  const [distance, setDistance] = useState('');
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<StrengthExercise[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (existing && !hydrated) {
      setPicked(existing.activityId);
      setDuration(existing.durationMin ?? existing.value);
      setDistance(existing.distanceKm ? String(existing.distanceKm) : '');
      setIntensity(existing.intensity ?? 'moderate');
      setNotes(existing.notes ?? '');
      setExercises(existing.exercises ?? []);
      setHydrated(true);
    }
  }, [existing, hydrated]);

  const { data: history = [] } = useQuery({
    queryKey: ['workoutHistory', def?.id],
    enabled: !!def?.isStrength,
    queryFn: async () => (await repo.logsInRange('0000-00-00', '9999-12-31', def!.id)).filter((l) => l.id !== logId).sort((a, b) => (a.date < b.date ? 1 : -1)),
  });
  const lastSession = history.find((h) => h.exercises?.length);
  const weightKg = latest?.weightKg ?? 70;
  const dur = duration ?? def?.target ?? 30;
  const kcal = caloriesBurned(def?.met, weightKg, dur, intensity);
  const prs = useMemo(() => findPRs(exercises, history), [exercises, history]);
  const imperial = profile?.units === 'imperial';

  if (!def) {
    return (
      <Sheet title="Log a workout" description="Pick an activity">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {workouts.filter((w) => !w.archived).map((w) => (
            <button key={w.id} type="button" onClick={() => setPicked(w.id)} className="flex min-h-16 items-center gap-3 rounded-2xl bg-surface-2 px-3 text-left font-medium">
              <ActivityIcon name={w.icon} className="text-activity" /> <span className="min-w-0 flex-1 truncate">{w.name}</span>
            </button>
          ))}
          <button type="button" onClick={() => openSheet({ type: 'activityEditor', kind: 'workout' }, { replace: true })} className="flex min-h-16 items-center gap-3 rounded-2xl border border-dashed border-line px-3 text-left font-medium">
            <Plus size={20} className="text-accent-ink" /> New activity
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={def.name}
      size="tall"
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button variant="danger" aria-label="Delete workout" onClick={async () => { await removeWithUndo('activityLogs', existing.id, 'Workout'); close(); }}>
              <Trash2 size={18} />
            </Button>
          )}
          <Button
            block
            className="flex-1"
            onClick={async () => {
              await saveWorkout({ id: existing?.id, def, date: existing?.date ?? date, durationMin: dur, distanceKm: parseFloat(distance) || undefined, intensity, notes, exercises, weightKg });
              if (prs.length) useUI.getState().showSnack({ message: `New personal record: ${prs.join(', ')} 🎉` });
              close();
            }}
          >
            {existing ? 'Save changes' : 'Log workout'}
          </Button>
        </div>
      }
    >
      {!activityId && !existing && (
        <button type="button" className="mb-3 min-h-11 text-sm font-semibold text-accent-ink" onClick={() => setPicked(undefined)}>
          ← Change activity
        </button>
      )}
      <Stepper label="Duration" value={dur} step={5} min={1} max={600} unit="minutes" onChange={setDuration} />
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {[15, 30, 45, 60].map((m) => (
          <Chip key={m} selected={dur === m} onClick={() => setDuration(m)}>
            {m} min
          </Chip>
        ))}
      </div>
      <p className="mb-2 mt-5 text-sm font-semibold">Intensity</p>
      <Segmented label="Intensity" value={intensity} onChange={setIntensity} options={[{ value: 'easy', label: 'Easy' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }]} />
      {def.hasDistance && <Input className="mt-4" label="Distance (optional)" inputMode="decimal" suffix="km" value={distance} onChange={(e) => setDistance(e.target.value)} />}
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-activity-soft px-4 py-3">
        <span className="text-sm">Calories burned</span>
        <span className="flex items-center gap-2">
          <span className="tabular font-bold">≈ {kcal} kcal</span>
          <EstimateBadge note={`MET ${def.met ?? '—'} × ${weightKg.toFixed(0)} kg × ${(dur / 60).toFixed(2)} h, adjusted for intensity. Real burn varies a lot between people.`} />
        </span>
      </div>

      {def.isStrength && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Exercises (optional)</p>
            <Button size="sm" variant="ghost" onClick={() => setExercises((e) => [...e, emptyExercise()])}>
              <Plus size={18} /> Exercise
            </Button>
          </div>
          {lastSession && (
            <p className="mb-2 text-sm text-muted">
              Last session ({lastSession.date}):{' '}
              {lastSession.exercises!.map((e) => `${e.name} ${e.sets.length}×${e.sets[0]?.reps} @ ${fmtW(Math.max(...e.sets.map((s) => s.weightKg)), imperial)}`).join(' · ')}
            </p>
          )}
          {lastSession && exercises.length === 0 && (
            <Button size="sm" variant="secondary" onClick={() => setExercises(lastSession.exercises!.map((e) => ({ name: e.name, sets: e.sets.map((s) => ({ ...s })) })))}>
              Repeat last session
            </Button>
          )}
          <div className="space-y-3">
            {exercises.map((ex, i) => (
              <ExerciseEditor
                key={i}
                ex={ex}
                imperial={imperial}
                pr={prs.includes(ex.name.trim())}
                onChange={(n) => setExercises((all) => all.map((x, j) => (j === i ? n : x)))}
                onRemove={() => setExercises((all) => all.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        </div>
      )}
      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-semibold">Notes (optional)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} className="w-full rounded-2xl border border-line bg-surface p-3" />
      </label>
    </Sheet>
  );
}

const fmtW = (kg: number, imperial: boolean) => (imperial ? `${Math.round(kgToLb(kg))} lb` : `${kg} kg`);

function ExerciseEditor({ ex, onChange, onRemove, imperial, pr }: { ex: StrengthExercise; onChange: (e: StrengthExercise) => void; onRemove: () => void; imperial: boolean; pr: boolean }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <input
          aria-label="Exercise name"
          placeholder="e.g. Squat"
          value={ex.name}
          onChange={(e) => onChange({ ...ex, name: e.target.value })}
          className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3 font-medium"
        />
        {pr && (
          <span className="flex items-center gap-1 rounded-full bg-good-soft px-2 py-1 text-xs font-bold text-good">
            <Trophy size={14} /> PR
          </span>
        )}
        <button type="button" aria-label="Remove exercise" onClick={onRemove} className="grid h-11 w-11 place-items-center text-muted">
          <X size={18} />
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {ex.sets.map((s, j) => (
          <div key={j} className="flex items-center gap-2 text-sm">
            <span className="w-10 text-muted">Set {j + 1}</span>
            <label className="flex flex-1 items-center gap-1">
              <input aria-label={`Set ${j + 1} reps`} inputMode="numeric" value={s.reps} onChange={(e) => onChange({ ...ex, sets: ex.sets.map((x, k) => (k === j ? { ...x, reps: Number(e.target.value) || 0 } : x)) })} className="tabular min-h-11 w-14 rounded-lg border border-line bg-surface text-center" />
              reps
            </label>
            <label className="flex flex-1 items-center gap-1">
              <input
                aria-label={`Set ${j + 1} weight`}
                inputMode="decimal"
                value={imperial ? Math.round(kgToLb(s.weightKg)) : s.weightKg}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  onChange({ ...ex, sets: ex.sets.map((x, k) => (k === j ? { ...x, weightKg: imperial ? Math.round(lbToKg(v) * 10) / 10 : v } : x)) });
                }}
                className="tabular min-h-11 w-16 rounded-lg border border-line bg-surface text-center"
              />
              {imperial ? 'lb' : 'kg'}
            </label>
          </div>
        ))}
      </div>
      <button type="button" className="mt-1 min-h-11 text-sm font-semibold text-accent-ink" onClick={() => onChange({ ...ex, sets: [...ex.sets, { ...(ex.sets[ex.sets.length - 1] ?? { reps: 10, weightKg: 0 }) }] })}>
        + Add set
      </button>
    </div>
  );
}
