import clsx from 'clsx';
import { ArrowLeft, Check, Plus, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { VoiceButton } from '@/components/VoiceButton';
import { Button, Card, Chip, IconButton, Input, Notice, PageHeader, Stepper } from '@/components/ui';
import type { DayType, ExerciseSet } from '@/db/types';
import { useToday } from '@/hooks/data';
import { useExercises, useStrengthSettings, useWeightUnit } from '@/hooks/strength';
import { LIMITS } from '@/config/strength';
import { DAY_TYPE_LABELS, DAY_TYPE_ROWS, dayTitle } from '@/domain/strength/dayTypes';
import { newSession } from '@/domain/strength/session';
import { parseWorkoutText, type ParsedExercise, type ParsedSet } from '@/domain/strength/workoutParser';
import { newId } from '@/lib/id';
import { useUI } from '@/stores/ui';
import { finishSession, startSession } from './actions';
import { fieldsFor } from './ExerciseCard';
import { atTime } from './StartWorkoutSheet';

const EXAMPLE = 'Chest day. Flat dumbbell press 3 sets 12, 10, 8 with 15, 17.5, 20 kg. Incline press 3x10 at 15kg. Cable fly 3x12 at 10kg. Push-ups 2 sets till failure 18 and 14.';
const DAY_TYPES = [...new Set(DAY_TYPE_ROWS.flat())] as DayType[];

interface Draft extends ParsedExercise {
  key: string;
}

/** Re-validate a set after the user edits it. */
function check(s: ParsedSet): string | undefined {
  if ((s.reps ?? 0) > LIMITS.maxReps) return `${s.reps} reps looks too high`;
  if ((s.weightKg ?? 0) > LIMITS.maxWeightKg) return `${Math.round(s.weightKg!)} kg looks too heavy`;
  if (s.reps == null && s.durationSec == null) return 'no reps found';
  return undefined;
}

export default function WorkoutTextScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const unit = useWeightUnit();
  const settings = useStrengthSettings();
  const { index, get } = useExercises();
  const openSheet = useUI((s) => s.openSheet);
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [dayTypes, setDayTypes] = useState<DayType[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(() => {
    const d = new Date(Date.now() - 60 * 60_000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);

  const read = () => {
    const r = parseWorkoutText(text, index.values(), unit);
    setDrafts(r.exercises.map((e) => ({ ...e, key: newId() })));
    setDayTypes(r.dayTypes);
    setAssumptions(r.assumptions);
  };
  const patch = (key: string, p: Partial<Draft>) => setDrafts((d) => d && d.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const patchSet = (key: string, i: number, p: Partial<ParsedSet>) =>
    setDrafts((d) => d && d.map((x) => (x.key === key ? { ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, ...p, check: check({ ...s, ...p }) } : s)) } : x)));

  const unresolved = drafts?.filter((d) => !d.exerciseId).length ?? 0;
  const flagged = drafts?.reduce((t, d) => t + d.sets.filter((s) => s.check).length, 0) ?? 0;

  const build = () => {
    const s = newSession({ date, dayTypes, mode: 'quick', startedAt: atTime(date, start), durationMin: duration });
    s.source = 'text';
    s.exercises = drafts!.filter((d) => d.exerciseId).map((d) => ({
      id: newId(),
      exerciseId: d.exerciseId!,
      sets: d.sets.map((x): ExerciseSet => ({ id: newId(), type: x.type, weightKg: x.weightKg, reps: x.reps, durationSec: x.durationSec, addedWeightKg: x.addedWeightKg, assistanceKg: x.assistanceKg, completed: true })),
    }));
    return s;
  };

  return (
    <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <PageHeader title={drafts ? 'Review workout' : 'Type a workout'} left={<IconButton label="Back" onClick={() => (drafts ? setDrafts(null) : navigate(-1))}><ArrowLeft size={22} /></IconButton>} />
      <div className="space-y-4 px-4">
        {!drafts ? (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Describe what you did</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={EXAMPLE} className="w-full rounded-2xl border border-line bg-surface p-3 text-base" />
            </label>
            <div className="flex items-center justify-between gap-2">
              <VoiceButton onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} />
              <Button disabled={text.trim().length < 3} onClick={read}>
                <Sparkles size={18} /> Read it
              </Button>
            </div>
            <Notice>
              Write sets like <b>3x10 at 60kg</b>, <b>3 sets 12, 10, 8 with 15, 17.5, 20 kg</b>, <b>60x8, 62.5x6</b>, <b>plank 3x60s</b> or <b>pull-ups +10kg 3x6</b>. Everything is read on your device and you'll review it before saving.
            </Notice>
          </>
        ) : (
          <>
            <Notice tone="info">Check everything below — nothing is saved until you tap Save.</Notice>
            {assumptions.length > 0 && (
              <ul className="space-y-1 text-sm text-muted">
                {assumptions.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
            )}
            <div>
              <p className="mb-2 text-sm font-semibold">Day type</p>
              <div className="flex flex-wrap gap-2">
                {DAY_TYPES.map((d) => (
                  <Chip key={d} selected={dayTypes.includes(d)} onClick={() => setDayTypes((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>
                    {DAY_TYPE_LABELS[d]}
                  </Chip>
                ))}
              </div>
            </div>
            <Card className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Date" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
                <Input label="Started at" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              {duration > 0 ? (
                <Stepper label="Duration" value={duration} step={5} min={5} max={300} unit="minutes" onChange={setDuration} />
              ) : (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted">Duration: estimated from your sets</span>
                  <Button size="sm" variant="secondary" onClick={() => setDuration(60)}>Set it</Button>
                </div>
              )}
            </Card>

            {drafts.length === 0 && <Notice tone="caution">No exercises found. Go back and add something like “bench 3x10 at 60kg”.</Notice>}
            {drafts.map((d) => {
              const ex = d.exerciseId ? get(d.exerciseId) : null;
              const fields = ex ? fieldsFor(ex, unit, settings) : fieldsFor(get('barbell_bench_press'), unit, settings);
              return (
                <section key={d.key} aria-label={ex?.name ?? d.name} className="rounded-[var(--radius-card)] bg-surface p-3 shadow-card">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {ex ? (
                        <h3 className="flex items-center gap-1.5 font-bold">
                          <Check size={16} className="shrink-0 text-good" aria-hidden /> <span className="truncate">{ex.name}</span>
                        </h3>
                      ) : (
                        <h3 className="flex items-center gap-1.5 font-bold text-caution">
                          <TriangleAlert size={16} aria-hidden /> “{d.name}”
                        </h3>
                      )}
                      <p className="truncate text-xs text-muted">from “{d.phrase}”</p>
                    </div>
                    <IconButton label={`Remove ${ex?.name ?? d.name}`} onClick={() => setDrafts((x) => x && x.filter((y) => y.key !== d.key))}>
                      <X size={18} />
                    </IconButton>
                  </div>
                  {!ex && d.candidates.length > 0 && <p className="mt-2 text-sm font-semibold">Did you mean…</p>}
                  <div className="mt-1 flex flex-wrap gap-2">
                    {!ex && d.candidates.slice(0, 3).map((c) => (
                      <Chip key={c.exercise.id} onClick={() => patch(d.key, { exerciseId: c.exercise.id })}>
                        {c.exercise.name}
                      </Chip>
                    ))}
                    <Chip
                      onClick={() =>
                        openSheet({ type: 'exercisePicker', dayTypes, mode: 'swap', initialQuery: ex ? '' : d.name, onPick: ([id]) => patch(d.key, { exerciseId: id }) })
                      }
                    >
                      {ex ? 'Change' : 'Search or create…'}
                    </Chip>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {d.sets.map((s, i) => (
                      <li key={i} className={clsx('flex items-center gap-2 rounded-xl px-1', s.check && 'bg-caution-soft')}>
                        <span className="w-7 text-center text-sm font-bold text-muted">{s.type === 'warmup' ? 'W' : s.type === 'failure' ? 'F' : i + 1}</span>
                        {fields.map((f) => (
                          <label key={`${f.key}-${d.exerciseId}`} className="flex items-center gap-1 text-sm text-muted">
                            <input
                              aria-label={`${ex?.name ?? d.name} set ${i + 1} ${f.header}`}
                              inputMode="decimal"
                              defaultValue={f.get(s as Partial<ExerciseSet>) ?? ''}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value.replace(',', '.'));
                                patchSet(d.key, i, f.set(Number.isFinite(v) ? v : undefined) as Partial<ParsedSet>);
                              }}
                              className="tabular h-11 w-16 rounded-lg bg-surface-2 text-center text-base font-semibold text-ink"
                            />
                            {f.header}
                          </label>
                        ))}
                        <span className="flex-1" />
                        <IconButton label={`Delete set ${i + 1}`} onClick={() => patch(d.key, { sets: d.sets.filter((_, j) => j !== i) })}>
                          <X size={16} />
                        </IconButton>
                        {s.check && (
                          <span className="sr-only" role="alert">
                            Check this: {s.check}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {d.sets.some((s) => s.check) && (
                    <p className="mt-1 flex items-center gap-1 text-sm text-caution">
                      <TriangleAlert size={14} aria-hidden /> Check this: {d.sets.find((s) => s.check)!.check} — fix or delete the set.
                    </p>
                  )}
                  <button type="button" onClick={() => patch(d.key, { sets: [...d.sets, { ...d.sets[d.sets.length - 1], type: 'working' } as ParsedSet] })} className="mt-1 flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-ink">
                    <Plus size={16} /> Add set
                  </button>
                </section>
              );
            })}

            {(unresolved > 0 || flagged > 0) && (
              <Notice tone="caution">
                {unresolved > 0 && `${unresolved} exercise${unresolved > 1 ? 's need' : ' needs'} a match. `}
                {flagged > 0 && `${flagged} set${flagged > 1 ? 's' : ''} to check.`}
              </Notice>
            )}
            <Button
              block
              size="lg"
              disabled={busy || !drafts.length || unresolved > 0 || flagged > 0}
              onClick={async () => {
                setBusy(true);
                const saved = await finishSession({ ...build(), status: 'in_progress' }, { markFilledDone: true });
                navigate(`/workout/${saved.id}/summary`, { replace: true });
              }}
            >
              Save {dayTitle(dayTypes)}
            </Button>
            <Button
              block
              variant="ghost"
              disabled={busy || !drafts.length}
              onClick={async () => {
                setBusy(true);
                const s = build();
                s.exercises.forEach((e) => e.sets.forEach((x) => (x.completed = false)));
                navigate(`/workout/${await startSession(s)}`, { replace: true });
              }}
            >
              Open in the set-by-set logger instead
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
