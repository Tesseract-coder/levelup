import { ChevronRight, ListChecks, Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { useNavigateFromSheets } from '@/components/sheetHistory';
import { Button, Chip, Input, Segmented, Stepper } from '@/components/ui';
import type { DateKey, DayType, Routine } from '@/db/types';
import { useLatestWeight, useToday } from '@/hooks/data';
import { useAllSessions, useInProgressSession, useRoutines } from '@/hooks/strength';
import { DAY_TYPE_LABELS, DAY_TYPE_ROWS, dayTitle } from '@/domain/strength/dayTypes';
import { exercisesFromRoutine, newSession } from '@/domain/strength/session';
import { fromKey } from '@/domain/dates';
import { discardSession, startSession } from './actions';

const timeOf = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** Local date key + "HH:mm" → epoch ms. */
export const atTime = (date: DateKey, hm: string) => {
  const d = fromKey(date);
  const [h, m] = hm.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
};

export default function StartWorkoutSheet({ date }: { date: DateKey }) {
  const go = useNavigateFromSheets();
  const today = useToday();
  const { data: inProgress } = useInProgressSession();
  const { data: routines = [] } = useRoutines();
  const { data: sessions = [] } = useAllSessions();
  const { data: body } = useLatestWeight();
  const [days, setDays] = useState<DayType[]>([]);
  const [custom, setCustom] = useState<string | null>(null);
  const [mode, setMode] = useState<'live' | 'quick'>(date === today ? 'live' : 'quick');
  const [logDate, setLogDate] = useState(date);
  const [start, setStart] = useState(timeOf(Date.now() - 60 * 60_000));
  const [duration, setDuration] = useState(60);

  const toggle = (d: DayType) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));

  const begin = async (routine?: Routine) => {
    const dayTypes = routine ? routine.dayTypes : custom != null ? [...days.filter((d) => d !== 'custom'), 'custom' as DayType] : days;
    const live = mode === 'live';
    const s = newSession({
      date: live ? today : logDate,
      dayTypes,
      customDayName: routine ? (routine.dayTypes.length ? undefined : routine.name) : custom ?? undefined,
      mode,
      startedAt: live ? Date.now() : atTime(logDate, start),
      durationMin: live ? 0 : duration,
      routineId: routine?.id,
      bodyWeightKg: body?.weightKg,
    });
    if (routine) s.exercises = exercisesFromRoutine(routine, sessions, !live);
    await startSession(s);
    go(`/workout/${s.id}${routine ? '' : '?pick=1'}`);
  };

  if (inProgress) {
    return (
      <Sheet title="Workout in progress" description={`${dayTitle(inProgress.dayTypes, inProgress.customDayName)} · started ${new Date(inProgress.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}>
        <div className="space-y-2 pb-2">
          <Button block size="lg" onClick={() => go(`/workout/${inProgress.id}`)}>
            <Play size={18} /> Resume workout
          </Button>
          <Button block variant="danger" onClick={() => void discardSession(inProgress.id)}>
            Discard it and start over
          </Button>
        </div>
      </Sheet>
    );
  }

  const canStart = days.length > 0 || (custom != null && custom.trim().length > 0);
  return (
    <Sheet
      title="What are you training today?"
      size="tall"
      footer={
        <Button block size="lg" disabled={!canStart} onClick={() => void begin()}>
          {canStart ? `Start ${dayTitle(days, custom ?? undefined)}` : 'Pick a day type'}
          <ChevronRight size={18} />
        </Button>
      }
    >
      <div className="space-y-3">
        {DAY_TYPE_ROWS.map((row, i) => (
          <div key={i} className="flex flex-wrap gap-2" role="group" aria-label={['Muscle groups', 'Push / pull / legs', 'Splits'][i]}>
            {row.map((d) => (
              <Chip key={`${i}-${d}`} selected={days.includes(d)} onClick={() => toggle(d)}>
                {DAY_TYPE_LABELS[d]}
              </Chip>
            ))}
            {i === 0 && (
              <Chip selected={custom != null} onClick={() => setCustom((c) => (c == null ? '' : null))}>
                <Plus size={16} aria-hidden /> Custom day
              </Chip>
            )}
          </div>
        ))}
        {custom != null && <Input label="Name this day" placeholder="e.g. Chest + Triceps, Arms & Abs" value={custom} maxLength={40} onChange={(e) => setCustom(e.target.value)} autoFocus />}
      </div>

      {routines.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold">Or start from a routine</p>
          <ul className="space-y-2">
            {routines.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => void begin(r)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 text-left">
                  <ListChecks size={20} className="shrink-0 text-activity" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="block truncate text-sm text-muted">{r.exercises.length} exercises</span>
                  </span>
                  <ChevronRight size={18} className="text-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <Segmented label="Logging mode" value={mode} onChange={setMode} options={[{ value: 'live', label: 'Log as I train' }, { value: 'quick', label: 'Log a past workout' }]} />
        <p className="mt-2 text-sm text-muted">{mode === 'live' ? 'Timer, rest timer and screen kept awake while you train.' : 'Enter everything at once, with when you trained and for how long.'}</p>
        {mode === 'quick' && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Date" type="date" value={logDate} max={today} onChange={(e) => e.target.value && setLogDate(e.target.value)} />
              <Input label="Started at" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <Stepper label="Duration" value={duration} step={5} min={5} max={300} unit="minutes" onChange={setDuration} />
          </div>
        )}
      </div>
    </Sheet>
  );
}
