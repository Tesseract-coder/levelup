import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { useCloseSheet } from '@/components/sheetHistory';
import { ICONS, ActivityIcon } from '@/components/icons';
import { Button, Chip, Input, Segmented, Stepper } from '@/components/ui';
import { repo } from '@/db';
import type { ActivityDef, Schedule, TrackingType } from '@/db/types';
import { useActivities } from '@/hooks/data';
import { ACTIVITY_COLORS, ALL_PRESETS, customDef } from '@/domain/presets';
import { WEEKDAY_NAMES } from '@/domain/dates';
import { refresh } from '@/lib/queryClient';
import { useUI } from '@/stores/ui';

const TRACKING: { value: TrackingType; label: string; hint: string }[] = [
  { value: 'check', label: 'Checkbox', hint: 'Done / not done' },
  { value: 'count', label: 'Count', hint: 'e.g. glasses, pages' },
  { value: 'duration', label: 'Duration', hint: 'Minutes' },
  { value: 'numeric', label: 'Number', hint: 'e.g. hours, steps' },
  { value: 'avoid', label: 'Avoid', hint: '"Did you avoid it?"' },
];

export function ActivityEditorSheet({ activityId, kind: initialKind }: { activityId?: string; kind?: 'workout' | 'habit' }) {
  const close = useCloseSheet();
  const { data: acts = [] } = useActivities(true);
  const existing = acts.find((a) => a.id === activityId);
  const [d, setD] = useState<ActivityDef | null>(null);

  useEffect(() => {
    if (d) return;
    if (activityId && existing) setD({ ...existing });
    else if (!activityId) setD(customDef('', initialKind ?? 'habit', acts.length));
  }, [activityId, existing, initialKind, acts.length, d]);

  if (!d) return null;
  const set = (patch: Partial<ActivityDef>) => setD({ ...d, ...patch });
  const isWorkout = d.kind === 'workout';
  const special = !!d.special;

  const setSchedule = (s: Schedule) => set({ schedule: s });
  const save = async () => {
    const name = d.name.trim();
    if (!name) return;
    // Pick up MET/keywords when a custom name matches a known preset.
    const preset = !existing ? ALL_PRESETS.find((p) => p.name.toLowerCase() === name.toLowerCase()) : undefined;
    await repo.saveActivity({
      ...d,
      name,
      met: d.met ?? preset?.met ?? (isWorkout ? 5 : undefined),
      hasDistance: d.hasDistance ?? preset?.hasDistance,
      isStrength: d.isStrength ?? preset?.isStrength,
      unit: d.trackingType === 'duration' ? 'min' : d.unit,
      aggregate: d.trackingType === 'avoid' || d.unit === 'h' || d.special === 'steps' ? 'last' : d.aggregate,
    });
    await refresh();
    close();
  };

  return (
    <Sheet
      title={existing ? `Edit ${existing.name}` : isWorkout ? 'New workout type' : 'New habit'}
      size="tall"
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button
              variant="secondary"
              onClick={async () => {
                await repo.saveActivity({ ...existing, archived: !existing.archived });
                await refresh();
                useUI.getState().showSnack({ message: existing.archived ? `${existing.name} restored` : `${existing.name} archived — history is kept` });
                close();
              }}
            >
              {existing.archived ? 'Restore' : 'Archive'}
            </Button>
          )}
          <Button block className="flex-1" disabled={!d.name.trim()} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <Input label="Name" value={d.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder={isWorkout ? 'e.g. Pilates' : 'e.g. Stretch before bed'} disabled={special} />
      {!existing && (
        <div className="mt-4">
          <Segmented
            label="Kind"
            value={d.kind}
            onChange={(kind) => setD(customDef(d.name, kind, d.order))}
            options={[
              { value: 'habit', label: 'Habit' },
              { value: 'workout', label: 'Workout' },
            ]}
          />
        </div>
      )}

      {!isWorkout && !special && (
        <>
          <p className="mb-2 mt-5 text-sm font-semibold">How do you track it?</p>
          <div className="grid grid-cols-2 gap-2">
            {TRACKING.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={d.trackingType === t.value}
                onClick={() => set({ trackingType: t.value, target: t.value === 'check' || t.value === 'avoid' ? undefined : d.target ?? (t.value === 'duration' ? 15 : 1), unit: t.value === 'duration' ? 'min' : t.value === 'check' || t.value === 'avoid' ? undefined : d.unit })}
                className={clsx('min-h-14 rounded-2xl border-2 px-3 py-2 text-left', d.trackingType === t.value ? 'border-accent bg-accent-soft' : 'border-transparent bg-surface-2')}
              >
                <span className="block font-semibold">{t.label}</span>
                <span className="block text-xs text-muted">{t.hint}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {(isWorkout || d.trackingType === 'count' || d.trackingType === 'duration' || d.trackingType === 'numeric') && (
        <div className="mt-5">
          {(d.trackingType === 'count' || d.trackingType === 'numeric') && !special && (
            <Input className="mb-3" label="Unit" placeholder="e.g. pages, glasses, h" value={d.unit ?? ''} maxLength={12} onChange={(e) => set({ unit: e.target.value || undefined })} />
          )}
          <Stepper
            label={isWorkout ? 'Minutes per session' : 'Daily target'}
            value={d.target ?? 0}
            step={d.special === 'water' ? 250 : d.special === 'steps' ? 500 : d.unit === 'h' ? 0.5 : d.trackingType === 'duration' || isWorkout ? 5 : 1}
            decimals={d.unit === 'h' ? 1 : 0}
            min={0}
            max={100000}
            unit={isWorkout ? 'minutes per session' : d.unit}
            onChange={(target) => set({ target })}
          />
        </div>
      )}

      <p className="mb-2 mt-5 text-sm font-semibold">Schedule</p>
      <Segmented
        label="Schedule"
        value={d.schedule.type}
        onChange={(t) => setSchedule(t === 'daily' ? { type: 'daily' } : t === 'weekly' ? { type: 'weekly', times: 3 } : { type: 'weekdays', days: [1, 2, 3, 4, 5] })}
        options={[
          { value: 'daily', label: 'Every day' },
          { value: 'weekdays', label: 'Some days' },
          { value: 'weekly', label: 'X per week' },
        ]}
      />
      {d.schedule.type === 'weekdays' && (
        <div className="mt-3 flex justify-between gap-1" role="group" aria-label="Days of the week">
          {WEEKDAY_NAMES.map((n, i) => {
            const days = (d.schedule as { days: number[] }).days;
            const on = days.includes(i);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                aria-label={n}
                onClick={() => setSchedule({ type: 'weekdays', days: on ? days.filter((x) => x !== i) : [...days, i].sort() })}
                className={clsx('h-11 w-11 rounded-full text-sm font-bold', on ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted')}
              >
                {n[0]}
              </button>
            );
          })}
        </div>
      )}
      {d.schedule.type === 'weekly' && (
        <div className="mt-3">
          <Stepper label="Times per week" value={d.schedule.times} min={1} max={7} unit="times per week" onChange={(times) => setSchedule({ type: 'weekly', times })} />
        </div>
      )}

      <p className="mb-2 mt-5 text-sm font-semibold">Icon</p>
      <div className="flex flex-wrap gap-2">
        {Object.keys(ICONS).map((k) => (
          <button key={k} type="button" aria-label={`Icon ${k}`} aria-pressed={d.icon === k} onClick={() => set({ icon: k })} className={clsx('grid h-11 w-11 place-items-center rounded-xl', d.icon === k ? 'bg-accent text-on-accent' : 'bg-surface-2')}>
            <ActivityIcon name={k} />
          </button>
        ))}
      </div>
      <p className="mb-2 mt-5 text-sm font-semibold">Colour</p>
      <div className="flex flex-wrap gap-2 pb-2">
        {ACTIVITY_COLORS.map((c) => (
          <Chip key={c} selected={d.color === c} onClick={() => set({ color: c })} aria-label={`Colour ${c}`} className="w-11 justify-center px-0">
            <span className="h-5 w-5 rounded-full" style={{ background: c }} />
          </Chip>
        ))}
      </div>
    </Sheet>
  );
}
