import { ArrowLeft, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useReducer } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, Card, EmptyState, Input, Skeleton, Stepper } from '@/components/ui';
import type { ExerciseSet, SessionExercise, StrengthSession } from '@/db/types';
import { useToday } from '@/hooks/data';
import { useAllSessions, useExercisePrefs, useExercises, useStrengthSettings, useWeightUnit } from '@/hooks/strength';
import { dayTitle } from '@/domain/strength/dayTypes';
import { unticked } from '@/domain/strength/finalize';
import { hasValues, moveItem, previousSets, sessionExercise, setsFromPrevious } from '@/domain/strength/session';
import { formatDay } from '@/domain/dates';
import { newId } from '@/lib/id';
import { useWakeLock } from '@/lib/wakeLock';
import { useUI } from '@/stores/ui';
import { deleteSessionWithUndo, discardSession, finishSession } from './actions';
import { ExerciseCard } from './ExerciseCard';
import { restFor } from './format';
import { useRestTimer } from './restTimer';
import { atTime } from './StartWorkoutSheet';
import { useSessionEditor } from './useSessionEditor';

function Elapsed({ since, pausedMs = 0 }: { since: number; pausedMs?: number }) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((Date.now() - since - pausedMs) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return <span role="timer" aria-label="Workout time">{`${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`}</span>;
}

const hm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function WorkoutScreen() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const today = useToday();
  const editor = useSessionEditor(id);
  const { update } = editor;
  const s = editor.session;
  const { get, ready } = useExercises();
  const prefs = useExercisePrefs();
  const settings = useStrengthSettings();
  const unit = useWeightUnit();
  const { data: sessions = [] } = useAllSessions();
  const openSheet = useUI((x) => x.openSheet);
  const inProgress = s?.status === 'in_progress';
  const live = inProgress && s?.mode === 'live';
  useWakeLock(!!live);

  const addExercises = useCallback(
    (ids: string[]) =>
      update((cur) => ({
        ...cur,
        exercises: [
          ...cur.exercises,
          ...ids.map((exId) => {
            const prev = previousSets(exId, sessions, cur.id);
            return sessionExercise(exId, setsFromPrevious(prev, 3).map((x) => ({ ...x, weightKg: undefined, reps: undefined, durationSec: undefined, distanceM: undefined, addedWeightKg: undefined, assistanceKg: undefined })));
          }),
        ],
      })),
    [update, sessions],
  );

  const openPicker = useCallback(
    (cur: StrengthSession, swapFor?: SessionExercise) =>
      openSheet({
        type: 'exercisePicker',
        dayTypes: cur.dayTypes,
        customDayName: cur.customDayName,
        mode: swapFor ? 'swap' : 'add',
        excludeIds: cur.exercises.map((e) => e.exerciseId),
        onPick: (ids) => {
          if (!swapFor) addExercises(ids);
          else update((c) => ({ ...c, exercises: c.exercises.map((e) => (e.id === swapFor.id ? { ...e, exerciseId: ids[0], restSec: undefined } : e)) }));
        },
      }),
    [openSheet, addExercises, update],
  );

  // opened straight from the day picker: go to the exercise picker
  useEffect(() => {
    if (!s || params.get('pick') !== '1') return;
    setParams({}, { replace: true });
    if (!s.exercises.length) openPicker(s);
  }, [s, params, setParams, openPicker]);

  const changeEntry = useCallback((entryId: string, fn: (e: SessionExercise) => SessionExercise) => update((cur) => ({ ...cur, exercises: cur.exercises.map((e) => (e.id === entryId ? fn(e) : e)) })), [update]);

  const onSetDone = useCallback(
    (entry: SessionExercise, _set: ExerciseSet) => {
      const cur = editor.current();
      if (!cur || cur.status !== 'in_progress' || cur.mode !== 'live') return;
      const i = cur.exercises.findIndex((e) => e.id === entry.id);
      const next = cur.exercises[i + 1];
      // supersets: go straight to the next exercise of the group, rest after the last one
      if (entry.supersetGroup && next?.supersetGroup === entry.supersetGroup) return;
      const ex = get(entry.exerciseId);
      const remaining = entry.sets.filter((x) => !x.completed && x.id !== _set.id).length;
      const upNext = remaining ? ex.name : next ? get(next.exerciseId).name : undefined;
      useRestTimer.getState().start(restFor(ex, entry.restSec, prefs.get(ex.id), settings), upNext);
    },
    [editor, get, prefs, settings],
  );

  const onMenu = useCallback(
    (entry: SessionExercise) => {
      const cur = editor.current();
      if (!cur) return;
      const i = cur.exercises.findIndex((e) => e.id === entry.id);
      const next = cur.exercises[i + 1];
      const linked = !!entry.supersetGroup && next?.supersetGroup === entry.supersetGroup;
      const prevLinked = !!entry.supersetGroup && cur.exercises[i - 1]?.supersetGroup === entry.supersetGroup;
      openSheet({
        type: 'exerciseMenu',
        entry,
        canMoveUp: i > 0,
        canMoveDown: i < cur.exercises.length - 1,
        superset: linked || prevLinked ? 'linked' : next ? 'can_link' : 'none',
        onChange: (patch) => changeEntry(entry.id, (e) => ({ ...e, ...patch })),
        onMove: (dir) => update((c) => ({ ...c, exercises: moveItem(c.exercises, i, i + dir) })),
        onSwap: () => openPicker(cur, entry),
        onRemove: () => update((c) => ({ ...c, exercises: c.exercises.filter((e) => e.id !== entry.id) })),
        onSuperset: () =>
          update((c) => {
            if (linked || prevLinked) {
              const g = entry.supersetGroup;
              const members = c.exercises.filter((e) => e.supersetGroup === g);
              // unlinking this one; a group of one is no group
              return { ...c, exercises: c.exercises.map((e) => (e.id === entry.id || (members.length <= 2 && e.supersetGroup === g) ? { ...e, supersetGroup: undefined } : e)) };
            }
            const g = entry.supersetGroup ?? next?.supersetGroup ?? newId();
            return { ...c, exercises: c.exercises.map((e) => (e.id === entry.id || e.id === next?.id ? { ...e, supersetGroup: g } : e)) };
          }),
      });
    },
    [editor, openSheet, changeEntry, update, openPicker],
  );

  const onOpenDetail = useCallback((_exerciseId: string) => {}, []);

  if (s === undefined || !ready) {
    return (
      <div className="space-y-4 p-4" aria-busy="true">
        <Skeleton className="h-12" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (s === null) {
    return (
      <div className="p-4">
        <EmptyState title="Workout not found" body="It may have been discarded or deleted." action={<Button onClick={() => navigate('/', { replace: true })}>Back to Today</Button>} />
      </div>
    );
  }

  const leave = () => {
    if (inProgress) navigate('/');
    else if (editor.isDirty())
      openSheet({ type: 'confirm', title: 'Discard your changes?', actions: [{ label: 'Discard changes', variant: 'danger', onClick: () => navigate(-1) }] });
    else navigate(-1);
  };

  const finish = async () => {
    await editor.flush();
    const cur = editor.current()!;
    const doFinish = async (mark: boolean) => {
      const saved = await finishSession(editor.current()!, { markFilledDone: mark });
      if (inProgress) {
        useRestTimer.getState().skip();
        navigate(`/workout/${saved.id}/summary`, { replace: true });
      } else {
        useUI.getState().showSnack({ message: 'Workout updated' });
        navigate(-1);
      }
    };
    if (!cur.exercises.some((e) => e.sets.some(hasValues))) {
      openSheet({
        type: 'confirm',
        title: 'Nothing logged yet',
        body: 'Add at least one set, or discard this workout.',
        actions: [{ label: inProgress ? 'Discard workout' : 'Delete workout', variant: 'danger', onClick: async () => { await (inProgress ? discardSession(cur.id) : deleteSessionWithUndo(cur.id)); navigate('/', { replace: true }); } }],
      });
      return;
    }
    const n = unticked(cur);
    if (live && n > 0) {
      openSheet({
        type: 'confirm',
        title: `${n} set${n > 1 ? 's' : ''} not ticked off`,
        body: 'They have numbers filled in. Did you do them?',
        actions: [
          { label: 'Yes, count them', variant: 'primary', onClick: () => doFinish(true) },
          { label: 'No, leave them out', onClick: () => doFinish(false) },
        ],
      });
      return;
    }
    await doFinish(true);
  };

  const title = dayTitle(s.dayTypes, s.customDayName);
  const doneSets = s.exercises.reduce((t, e) => t + e.sets.filter((x) => x.completed).length, 0);
  const startTime = hm(s.startedAt);

  return (
    <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}>
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur" style={{ marginTop: 'calc(-1 * env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-1 px-2 py-2">
          <button type="button" onClick={leave} aria-label={inProgress ? 'Minimise workout (keeps running)' : 'Back'} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted">
            {inProgress ? <ChevronDown size={24} /> : <ArrowLeft size={22} />}
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight">{inProgress ? title : `Edit · ${title}`}</h1>
            <p className="tabular truncate text-sm text-muted">
              {live ? <Elapsed since={s.startedAt} pausedMs={s.pausedMs} /> : formatDay(s.date, today)}
              {doneSets > 0 && ` · ${doneSets} sets done`}
            </p>
          </div>
          <Button size="sm" onClick={() => void finish()}>
            {inProgress ? 'Finish' : 'Save'}
          </Button>
        </div>
      </header>

      <div className="space-y-3 px-4 pt-3">
        {!live && (
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Date"
                type="date"
                value={s.date}
                max={today}
                onChange={(e) => e.target.value && update((c) => ({ ...c, date: e.target.value, startedAt: atTime(e.target.value, hm(c.startedAt)) }))}
              />
              <Input label="Started at" type="time" value={startTime} onChange={(e) => e.target.value && update((c) => ({ ...c, startedAt: atTime(c.date, e.target.value), endedAt: undefined }))} />
            </div>
            <Stepper label="Duration" value={s.durationMin || 45} step={5} min={5} max={300} unit="minutes" onChange={(v) => update((c) => ({ ...c, durationMin: v, endedAt: undefined }))} />
          </Card>
        )}

        {s.exercises.length === 0 && (
          <Card>
            <EmptyState title="No exercises yet" body="Pick what you're doing today — your last numbers come along." />
          </Card>
        )}
        {s.exercises.map((entry, i) => {
          const g = entry.supersetGroup;
          const before = g && s.exercises[i - 1]?.supersetGroup === g;
          const after = g && s.exercises[i + 1]?.supersetGroup === g;
          const pos = before && after ? 'middle' : before ? 'last' : after ? 'first' : undefined;
          return (
            <ExerciseCard
              key={entry.id}
              entry={entry}
              ex={get(entry.exerciseId)}
              pref={prefs.get(entry.exerciseId)}
              prev={previousSets(entry.exerciseId, sessions, s.id)}
              unit={unit}
              settings={settings}
              superset={pos}
              onChange={changeEntry}
              onSetDone={onSetDone}
              onMenu={onMenu}
              onOpenDetail={onOpenDetail}
            />
          );
        })}
        <Button block variant="soft" size="lg" onClick={() => openPicker(s)}>
          <Plus size={20} /> Add exercises
        </Button>

        <label className="block pt-2">
          <span className="mb-1.5 block text-sm font-semibold">Workout notes (optional)</span>
          <textarea value={s.notes ?? ''} onChange={(e) => update((c) => ({ ...c, notes: e.target.value || undefined }))} rows={2} maxLength={500} className="w-full rounded-2xl border border-line bg-surface p-3" />
        </label>

        <Button
          block
          variant="ghost"
          className="text-danger"
          onClick={() =>
            openSheet({
              type: 'confirm',
              title: inProgress ? 'Discard this workout?' : 'Delete this workout?',
              body: inProgress ? 'Everything logged in this session will be removed.' : 'You can undo right after.',
              actions: [
                {
                  label: inProgress ? 'Discard workout' : 'Delete workout',
                  variant: 'danger',
                  onClick: async () => {
                    if (inProgress) {
                      useRestTimer.getState().skip();
                      await discardSession(s.id);
                    } else await deleteSessionWithUndo(s.id);
                    navigate('/', { replace: true });
                  },
                },
              ],
            })
          }
        >
          <Trash2 size={18} /> {inProgress ? 'Discard workout' : 'Delete workout'}
        </Button>
      </div>
    </div>
  );
}
