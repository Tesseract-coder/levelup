import { ArrowLeft, Dumbbell, Star, Trophy, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, EmptyState, IconButton, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { useToday } from '@/hooks/data';
import { useAllSessions, useExercisePrefs, useExercises, useWeightUnit } from '@/hooks/strength';
import { AXIS, ChartCard, GRID, SimpleTable, Tip } from '@/features/insights/chartKit';
import { addDays, formatDay, formatShort } from '@/domain/dates';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '@/domain/strength/library';
import { averageRest, exerciseHistory, frequencyPerWeek, type ExercisePoint } from '@/domain/strength/progress';
import { fmtSec, fmtVolume, fmtWeight, toDisplay } from '@/domain/strength/units';
import { updatePref } from './actions';
import { fmtSet } from './format';
import { OverloadHint } from './OverloadHint';

type Range = '30' | '90' | '180' | '365' | 'all';
type Metric = 'weight' | 'e1rm' | 'volume' | 'reps';

export default function ExerciseDetailScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const unit = useWeightUnit();
  const { get, ready } = useExercises();
  const prefs = useExercisePrefs();
  const { data: sessions } = useAllSessions();
  const [range, setRange] = useState<Range>('90');
  const ex = get(id);
  const timed = ex.trackingType === 'duration' || ex.trackingType === 'weight_duration';
  const bodyweight = ex.trackingType === 'bodyweight_reps';
  const [metric, setMetric] = useState<Metric>(bodyweight || timed ? 'reps' : 'weight');

  const all = useMemo(() => (sessions ? exerciseHistory(id, sessions, get, (s) => ({ bodyWeightKg: s.bodyWeightKg, countBothHands: prefs.get(id)?.countBothHands })) : []), [sessions, id, get, prefs]);
  const shown = range === 'all' ? all : all.filter((p) => p.date >= addDays(today, -Number(range)));
  const mine = useMemo(() => (sessions ?? []).filter((s) => s.exerciseIds.includes(id)).reverse(), [sessions, id]);
  const fav = !!prefs.get(id)?.favorite;

  if (!sessions || !ready) return <Skeleton className="m-4 h-64" />;

  const conv = (kg: number | null) => (kg == null ? null : toDisplay(kg, unit));
  const val = (p: ExercisePoint) =>
    metric === 'weight' ? conv(p.maxWeightKg) : metric === 'e1rm' ? conv(p.e1rm) : metric === 'volume' ? Math.round(conv(p.volumeKg) ?? 0) : timed ? p.maxDurationSec : p.bestReps;
  const label = { weight: bodyweight ? `Added weight (${unit})` : `Max weight (${unit})`, e1rm: `Est. 1RM (${unit})`, volume: `Volume (${unit})`, reps: timed ? 'Longest set (s)' : 'Best reps' }[metric];
  const data = shown.map((p) => ({ date: p.date, [label]: val(p) }));

  const best = <K extends keyof ExercisePoint>(k: K) => all.reduce<ExercisePoint | null>((b, p) => (p[k] != null && (!b || (p[k] as number) > (b[k] as number)) ? p : b), null);
  const bw = best('maxWeightKg');
  const be = best('e1rm');
  const bv = best('volumeKg');
  const br = timed ? best('maxDurationSec') : best('bestReps');
  const rest = averageRest(id, sessions);
  const metrics: { value: Metric; label: string }[] = timed
    ? [{ value: 'reps', label: 'Time' }, { value: 'weight', label: 'Weight' }]
    : bodyweight
      ? [{ value: 'reps', label: 'Reps' }, { value: 'weight', label: '+Weight' }, { value: 'volume', label: 'Volume' }]
      : [{ value: 'weight', label: 'Weight' }, { value: 'e1rm', label: 'e1RM' }, { value: 'volume', label: 'Volume' }, { value: 'reps', label: 'Reps' }];

  return (
    <div>
      <PageHeader
        title={ex.name}
        subtitle={`${ex.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ') || 'Custom'} · ${EQUIPMENT_LABELS[ex.equipment]}`}
        left={<IconButton label="Back" onClick={() => navigate(-1)}><ArrowLeft size={22} /></IconButton>}
        right={
          <IconButton label={fav ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={fav} onClick={() => void updatePref(id, { favorite: !fav })}>
            <Star size={22} className={fav ? 'fill-current text-carbs' : ''} />
          </IconButton>
        }
      />
      <div className="space-y-4 px-4">
        {all.length === 0 ? (
          <Card>
            <EmptyState icon={<Dumbbell size={24} />} title="No sessions yet" body="Log this exercise in a workout and your progress charts and records will show up here." />
          </Card>
        ) : (
          <>
            <OverloadHint exerciseId={id} />
            <div className="grid grid-cols-2 gap-2">
              {!timed && !bodyweight && bw && <PRCard label="Heaviest" value={fmtWeight(bw.maxWeightKg, unit)} date={bw.date} today={today} />}
              {!timed && be?.e1rm && <PRCard label="Best est. 1RM" value={fmtWeight(be.e1rm, unit)} date={be.date} today={today} />}
              {bodyweight && bw && bw.maxWeightKg > 0 && <PRCard label="Most added" value={`+${fmtWeight(bw.maxWeightKg, unit)}`} date={bw.date} today={today} />}
              {br && <PRCard label={timed ? 'Longest hold' : 'Most reps'} value={timed ? fmtSec(br.maxDurationSec) : `${br.bestReps} reps`} date={br.date} today={today} />}
              {!timed && bv && bv.volumeKg > 0 && <PRCard label="Best volume" value={fmtVolume(bv.volumeKg, unit)} date={bv.date} today={today} />}
            </div>
            <Card className="grid grid-cols-3 gap-2 text-center">
              <Stat value={String(all.length)} label="sessions" />
              <Stat value={String(frequencyPerWeek(all, today))} label="per week (8 wk)" />
              <Stat value={rest ? fmtSec(rest) : '–'} label="avg rest" />
            </Card>

            <Segmented label="Time range" value={range} onChange={setRange} options={[{ value: '30', label: '1M' }, { value: '90', label: '3M' }, { value: '180', label: '6M' }, { value: '365', label: '1Y' }, { value: 'all', label: 'All' }]} />
            {metrics.length > 1 && <Segmented label="Metric" value={metric} onChange={setMetric} options={metrics} />}
            <ChartCard
              title={label}
              subtitle={metric === 'e1rm' ? 'Estimated with the Epley formula from sets of 12 reps or fewer' : undefined}
              empty={shown.length < 2 && 'Log this exercise in two or more sessions in this range to see a trend.'}
              table={<SimpleTable head={['Date', label]} rows={[...data].reverse().map((d) => [formatShort(d.date), (d[label] as number | null) ?? '–'])} />}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => formatShort(d)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} domain={['auto', 'auto']} />
                  <Tooltip content={<Tip format={(_, v) => (metric === 'reps' && timed ? fmtSec(v) : `${v.toLocaleString()}`)} />} />
                  <Line type="monotone" dataKey={label} stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--accent)' }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <section aria-labelledby="hist-h">
              <h2 id="hist-h" className="mb-2 px-1 font-bold">History</h2>
              <Card className="p-2">
                <ul className="divide-y divide-line">
                  {mine.map((s) =>
                    s.exercises
                      .filter((e) => e.exerciseId === id)
                      .map((e) => {
                        const sets = e.sets.filter((x) => x.completed);
                        return (
                          <li key={e.id}>
                            <button type="button" onClick={() => navigate(`/workout/${s.id}`)} className="w-full rounded-xl px-2 py-2.5 text-left">
                              <span className="flex items-center gap-2 text-sm font-semibold">
                                {formatDay(s.date, today)}
                                {e.pain && <TriangleAlert size={14} className="text-caution" aria-label="Pain flagged" />}
                                {sets.some((x) => x.isPR) && (
                                  <span className="flex items-center gap-0.5 rounded-full bg-good-soft px-2 text-xs text-good">
                                    <Trophy size={12} aria-hidden /> PR
                                  </span>
                                )}
                              </span>
                              <span className="tabular mt-1 flex flex-wrap gap-1.5 text-sm">
                                {sets.map((x) => (
                                  <span key={x.id} className={x.type === 'warmup' ? 'rounded-md bg-surface-2 px-1.5 text-muted' : 'rounded-md bg-surface-2 px-1.5'}>
                                    {x.type === 'warmup' ? 'W ' : ''}
                                    {fmtSet(x, ex, unit)}
                                  </span>
                                ))}
                              </span>
                              {e.notes && <span className="mt-1 block text-sm text-muted">{e.notes}</span>}
                            </button>
                          </li>
                        );
                      }),
                  )}
                </ul>
              </Card>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function PRCard({ label, value, date, today }: { label: string; value: ReactNode; date: string; today: string }) {
  return (
    <Card className="p-3">
      <p className="flex items-center gap-1 text-xs font-semibold text-muted">
        <Trophy size={12} className="text-good" aria-hidden /> {label}
      </p>
      <p className="tabular text-lg font-extrabold">{value}</p>
      <p className="text-xs text-muted">{formatDay(date, today)}</p>
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="tabular text-lg font-extrabold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
