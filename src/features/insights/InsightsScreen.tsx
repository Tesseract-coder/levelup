import clsx from 'clsx';
import { Flame, Info, Moon, Scale, Sparkles, Table2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { Card, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { useGoal, useProfile, useRangeData, useSettings, useToday } from '@/hooks/data';
import { addDays, diffDays, formatShort, fromKey, rangeKeys, startOfWeek, weekdayShort } from '@/domain/dates';
import { computeRangeStats, dailySeries, movingAverage, scoreSeries, type DayPoint } from '@/domain/stats';
import { kgToLb } from '@/domain/targets';
import { GOAL_LABELS } from '@/domain/targets';

type RangeKey = '7' | '30' | '90' | 'custom';

const AXIS = { fontSize: 11, fill: 'var(--muted)' } as const;
const GRID = 'var(--line)';

export default function InsightsScreen() {
  const today = useToday();
  const settings = useSettings();
  const { data: goal } = useGoal();
  const { data: profile } = useProfile();
  const [range, setRange] = useState<RangeKey>('30');
  const [custom, setCustom] = useState({ start: addDays(today, -13), end: today });
  const days = range === 'custom' ? Math.max(1, diffDays(custom.end, custom.start) + 1) : Number(range);
  const end = range === 'custom' ? custom.end : today;
  const start = range === 'custom' ? custom.start : addDays(today, -(days - 1));
  // load extra history for streaks and previous-period comparison
  const { data, isLoading } = useRangeData(addDays(start, -Math.max(days, 180)), end);

  const model = useMemo(() => {
    if (!data) return null;
    const series = dailySeries(start, end, data);
    const stats = computeRangeStats(start, end, data, goal, settings, today);
    const prev = computeRangeStats(addDays(start, -days), addDays(start, -1), data, goal, settings, today);
    const scores = scoreSeries(start, end, data, goal, settings, today);
    return { series, stats, prev, scores };
  }, [data, start, end, goal, settings, today, days]);

  const imperial = profile?.units === 'imperial';

  return (
    <div>
      <PageHeader title="Insights" subtitle={goal ? `Tied to your goal: ${goal.type === 'custom' ? goal.customText : GOAL_LABELS[goal.type].label}` : undefined} />
      <div className="sticky top-0 z-10 bg-canvas/95 px-4 pb-2 pt-1 backdrop-blur" style={{ top: 'env(safe-area-inset-top)' }}>
        <Segmented
          label="Time range"
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: '7D' },
            { value: '30', label: '30D' },
            { value: '90', label: '90D' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        {range === 'custom' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">From</span>
              <input type="date" max={custom.end} value={custom.start} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, start: e.target.value }))} className="min-h-11 w-full rounded-xl border border-line bg-surface px-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">To</span>
              <input type="date" min={custom.start} max={today} value={custom.end} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, end: e.target.value }))} className="min-h-11 w-full rounded-xl border border-line bg-surface px-2" />
            </label>
          </div>
        )}
      </div>

      <div className="space-y-4 px-4 pt-2">
        {isLoading || !model ? (
          <>
            <Skeleton className="h-36" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </>
        ) : (
          <>
            <ScoreCard model={model} />
            <GoalLink stats={model.stats} goalType={goal?.type} />
            <CaloriesChart series={model.series} target={goal?.calorieTarget} />
            <MacroChart series={model.series} proteinTarget={goal?.proteinTarget} />
            <WeightChart series={model.series} target={goal?.targetWeightKg} imperial={imperial} />
            <WorkoutChart series={model.series} activities={data!.activities} weekStartsOn={settings.weekStartsOn} />
            <HabitHeatmap series={model.series} habits={model.stats.habits.filter((h) => h.kind === 'habit')} />
            <SleepChart series={model.series} targetH={model.stats.sleep.targetHours} sdMin={model.stats.sleep.bedtimeSdMin} />
            <MoodCard stats={model.stats} />
          </>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- building blocks

function ChartCard({ title, subtitle, children, table, empty, legend }: { title: string; subtitle?: ReactNode; children: ReactNode; table?: ReactNode; empty?: string | false; legend?: { label: string; color: string; kind?: 'bar' | 'line' | 'dash' | 'dot' }[] }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {table && !empty && (
          <button type="button" onClick={() => setShowTable((s) => !s)} aria-pressed={showTable} aria-label={`Show ${title} as table`} className="grid h-11 w-11 place-items-center rounded-full text-muted">
            <Table2 size={18} />
          </button>
        )}
      </div>
      {empty ? (
        <EmptyState title="Not enough data yet" body={empty} />
      ) : showTable ? (
        <div className="max-h-72 overflow-auto text-sm">{table}</div>
      ) : (
        <>
          {legend && legend.length > 1 && (
            <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={clsx(l.kind === 'line' ? 'h-0.5 w-4' : l.kind === 'dash' ? 'h-0 w-4 border-t-2 border-dashed' : l.kind === 'dot' ? 'h-2 w-2 rounded-full' : 'h-2.5 w-2.5 rounded-[3px]')}
                    style={l.kind === 'dash' ? { borderColor: l.color } : { background: l.color }}
                  />
                  {l.label}
                </li>
              ))}
            </ul>
          )}
          <div className="-mx-2 h-52" role="group" aria-label={`${title} chart. Use arrow keys to inspect points, or the table button for exact values.`}>
            {children}
          </div>
        </>
      )}
    </Card>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="tabular w-full text-left">
      <thead className="sticky top-0 bg-surface text-xs text-muted">
        <tr>{head.map((h) => <th key={h} className="py-1 pr-2 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line">
            {r.map((c, j) => <td key={j} className="py-1.5 pr-2">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tip({ active, payload, label, format }: Partial<TooltipContentProps<number, string>> & { format?: (name: string, v: number) => string }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && p.name !== 'hidden');
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-semibold text-ink">{typeof label === 'string' && /^\d{4}-/.test(label) ? fromKey(label).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : label}</p>
      {rows.map((p) => (
        <p key={String(p.name)} className="flex items-center gap-2 text-ink">
          <span className="h-2 w-2 rounded-full" style={{ background: (p.color as string) ?? (p.payload as { fill?: string })?.fill }} aria-hidden />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto font-semibold">{format ? format(String(p.name), Number(p.value)) : Math.round(Number(p.value)).toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

const tickDate = (days: number) => (d: string) => (days <= 7 ? weekdayShort(d) : formatShort(d));
const tickInterval = (n: number) => (n <= 7 ? 0 : n <= 31 ? 6 : 13);

// ------------------------------------------------------------------- score

function ScoreCard({ model }: { model: { stats: ReturnType<typeof computeRangeStats>; prev: ReturnType<typeof computeRangeStats>; scores: { date: string; score: number }[] } }) {
  const { stats, prev, scores } = model;
  const [open, setOpen] = useState(false);
  const delta = stats.score - prev.score;
  const streaks = [...stats.habits].filter((h) => h.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 4);
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div>
          <p className="text-sm font-semibold text-muted">Consistency score</p>
          <p className="tabular text-5xl font-extrabold leading-none">{stats.score}</p>
          {prev.days > 0 && (prev.nutrition.loggedDays || prev.activity.sessions) ? (
            <p className="mt-1 text-sm text-muted">{delta === 0 ? 'Same as' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs`} previous {stats.days} days</p>
          ) : null}
        </div>
        <div className="h-16 flex-1" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={scores} margin={{ top: 4, right: 4, bottom: 4, left: 4 }} accessibilityLayer={false}>
              <YAxis domain={[0, 100]} hide />
              <Line type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-ink">
        <Info size={16} /> How is this calculated?
      </button>
      {open && (
        <ul className="mt-1 space-y-2 text-sm">
          {stats.breakdown.map((b) => (
            <li key={b.key} className="rounded-xl bg-surface-2 p-3">
              <div className="flex justify-between font-semibold">
                <span>
                  {b.label} <span className="font-normal text-muted">· weight {b.weight}</span>
                </span>
                <span className="tabular">{b.score == null ? '—' : `${Math.round(b.score * 100)}%`}</span>
              </div>
              <p className="mt-0.5 text-muted">{b.detail}</p>
            </li>
          ))}
          <li className="text-muted">Score = weighted average of the included parts. Parts without data are left out instead of counting as zero.</li>
        </ul>
      )}
      {streaks.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-sm font-semibold">Current streaks</p>
          <ul className="flex flex-wrap gap-2">
            {streaks.map((s) => (
              <li key={s.id} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-sm">
                <Flame size={14} className="text-protein" aria-hidden /> <span className="font-semibold">{s.streak}</span> {s.streakUnit === 'weeks' ? 'wk' : 'd'} · {s.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function GoalLink({ stats, goalType }: { stats: ReturnType<typeof computeRangeStats>; goalType?: string }) {
  // One sentence connecting the period's numbers to the goal (Griply's point: tie habits to goals).
  let text: string | null = null;
  const n = stats.nutrition;
  if (goalType === 'lose_fat' && n.loggedDays >= 3) text = `For fat loss: you averaged ${n.avgCalories.toLocaleString()} kcal (${n.avgCaloriePct}% of target) and hit protein on ${n.proteinHitDays} of ${n.loggedDays} logged days${stats.weight.change != null ? `; weight moved ${stats.weight.change > 0 ? '+' : ''}${stats.weight.change} kg` : ''}.`;
  else if (goalType === 'build_muscle' && n.loggedDays >= 3) text = `For muscle gain: protein averaged ${n.avgProtein} g (${n.avgProteinPct}% of target) across ${stats.activity.sessions} training sessions.`;
  else if (goalType === 'endurance') text = `For stamina: ${stats.activity.minutes} active minutes over ${stats.activity.sessions} sessions${stats.activity.topName ? `, mostly ${stats.activity.topName.toLowerCase()}` : ''}.`;
  else if (goalType === 'discipline' || goalType === 'maintain' || goalType === 'custom') {
    const avg = stats.habits.filter((h) => h.kind === 'habit' && h.expected > 0);
    if (avg.length) text = `Habits completed ${Math.round(avg.reduce((t, h) => t + h.rate, 0) / avg.length)}% of the time on average — consistency is the goal.`;
  }
  if (!text) return null;
  return (
    <Link to="/goals">
      <Card className="flex gap-3 bg-accent-soft shadow-none">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
        <p className="text-sm">{text}</p>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------- calories

function CaloriesChart({ series, target }: { series: DayPoint[]; target?: number }) {
  const [burned, setBurned] = useState(false);
  const logged = series.filter((p) => p.calories != null);
  const data = series.map((p) => ({ date: p.date, Eaten: p.calories, Burned: burned ? p.burned || null : null }));
  return (
    <ChartCard
      title="Calories in vs target"
      subtitle={target ? `Target ${target.toLocaleString()} kcal · estimates` : 'Estimates'}
      empty={logged.length < 2 && 'Log food on a couple of days to see your intake trend.'}
      legend={[{ label: 'Eaten', color: 'var(--calories)' }, ...(target ? [{ label: 'Target', color: 'var(--muted)', kind: 'dash' as const }] : []), ...(burned ? [{ label: 'Burned in workouts', color: 'var(--activity)', kind: 'dot' as const }] : [])]}
      table={<SimpleTable head={['Date', 'Eaten', 'Burned']} rows={series.map((p) => [formatShort(p.date), p.calories?.toLocaleString() ?? '—', p.burned || '—'])} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap={series.length > 40 ? 1 : '20%'}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tickFormatter={tickDate(series.length)} interval={tickInterval(series.length)} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<Tip format={(_, v) => `${Math.round(v).toLocaleString()} kcal`} />} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="Eaten" fill="var(--calories)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          {burned && <Scatter dataKey="Burned" fill="var(--activity)" isAnimationActive={false} />}
          {target && <ReferenceLine y={target} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth={1.5} />}
        </ComposedChart>
      </ResponsiveContainer>
      <label className="mt-1 flex min-h-11 items-center gap-2 px-2 text-sm">
        <input type="checkbox" checked={burned} onChange={(e) => setBurned(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" /> Show calories burned (estimate)
      </label>
    </ChartCard>
  );
}

// ------------------------------------------------------------------ macros

function MacroChart({ series, proteinTarget }: { series: DayPoint[]; proteinTarget?: number }) {
  const [mode, setMode] = useState<'split' | 'protein'>('split');
  const logged = series.filter((p) => p.calories != null);
  const avg = (k: 'proteinG' | 'carbsG' | 'fatG') => (logged.length ? Math.round(logged.reduce((t, p) => t + (p[k] ?? 0), 0) / logged.length) : 0);
  const pK = avg('proteinG') * 4;
  const cK = avg('carbsG') * 4;
  const fK = avg('fatG') * 9;
  const tot = pK + cK + fK || 1;
  const data = series.map((p) => ({ date: p.date, Protein: p.proteinG, Carbs: p.carbsG, Fat: p.fatG }));
  // surface-coloured gap between stacked segments only when bars are wide enough to keep their fill
  const gap = series.length <= 31 ? 1 : 0;
  return (
    <ChartCard
      title={mode === 'split' ? 'Macro split' : 'Protein vs target'}
      subtitle={logged.length ? `Average: protein ${Math.round((pK / tot) * 100)}% · carbs ${Math.round((cK / tot) * 100)}% · fat ${Math.round((fK / tot) * 100)}% of calories` : undefined}
      empty={logged.length < 2 && 'Log food on a couple of days to see macros.'}
      legend={mode === 'split' ? [{ label: 'Protein (g)', color: 'var(--protein)' }, { label: 'Carbs (g)', color: 'var(--carbs)' }, { label: 'Fat (g)', color: 'var(--fat)' }] : [{ label: 'Protein (g)', color: 'var(--protein)', kind: 'line' }, { label: 'Target', color: 'var(--muted)', kind: 'dash' }]}
      table={<SimpleTable head={['Date', 'Protein g', 'Carbs g', 'Fat g']} rows={series.map((p) => [formatShort(p.date), p.proteinG ?? '—', p.carbsG ?? '—', p.fatG ?? '—'])} />}
    >
      <div className="px-2 pb-2">
        <Segmented label="Macro view" value={mode} onChange={setMode} options={[{ value: 'split', label: 'Split (g)' }, { value: 'protein', label: 'Protein trend' }]} />
      </div>
      <ResponsiveContainer width="100%" height="78%">
        {mode === 'split' ? (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap={series.length > 40 ? 1 : '20%'}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="date" tickFormatter={tickDate(series.length)} interval={tickInterval(series.length)} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<Tip format={(_, v) => `${Math.round(v)} g`} />} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="Protein" stackId="m" fill="var(--protein)" stroke="var(--surface)" strokeWidth={gap} isAnimationActive={false} maxBarSize={22} />
            <Bar dataKey="Carbs" stackId="m" fill="var(--carbs)" stroke="var(--surface)" strokeWidth={gap} isAnimationActive={false} maxBarSize={22} />
            <Bar dataKey="Fat" stackId="m" fill="var(--fat)" stroke="var(--surface)" strokeWidth={gap} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={22} />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="date" tickFormatter={tickDate(series.length)} interval={tickInterval(series.length)} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<Tip format={(_, v) => `${Math.round(v)} g`} />} />
            {proteinTarget && <ReferenceLine y={proteinTarget} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth={1.5} />}
            <Line type="monotone" dataKey="Protein" stroke="var(--protein)" strokeWidth={2} dot={series.length <= 31 ? { r: 3, strokeWidth: 0, fill: 'var(--protein)' } : false} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ------------------------------------------------------------------ weight

function WeightChart({ series, target, imperial }: { series: DayPoint[]; target?: number; imperial: boolean }) {
  const conv = (kg: number | null) => (kg == null ? null : imperial ? Math.round(kgToLb(kg) * 10) / 10 : kg);
  const ma = movingAverage(series.map((p) => ({ date: p.date, v: p.weightKg })), 7);
  const data = series.map((p, i) => ({ date: p.date, Weight: conv(p.weightKg), Trend: conv(ma[i]) }));
  const pts = data.filter((d) => d.Weight != null);
  const vals = [...pts.map((d) => d.Weight!), ...(target ? [conv(target)!] : [])];
  const min = Math.floor(Math.min(...vals) - 1);
  const max = Math.ceil(Math.max(...vals) + 1);
  const unit = imperial ? 'lb' : 'kg';
  const first = pts[0]?.Trend;
  const last = pts[pts.length - 1]?.Trend;
  return (
    <ChartCard
      title="Weight trend"
      subtitle={first != null && last != null && pts.length > 2 ? `7-day average ${last} ${unit} (${last - first > 0 ? '+' : ''}${Math.round((last - first) * 10) / 10} ${unit} this period). Daily dots wobble — watch the line.` : undefined}
      empty={pts.length < 2 && 'Log your weight a few times a week to see the trend.'}
      legend={[{ label: 'Daily', color: 'var(--muted)', kind: 'dot' }, { label: '7-day average', color: 'var(--accent)', kind: 'line' }, ...(target ? [{ label: 'Goal', color: 'var(--good)', kind: 'dash' as const }] : [])]}
      table={<SimpleTable head={['Date', `Weight ${unit}`, `7-day avg ${unit}`]} rows={data.filter((d) => d.Weight != null).map((d) => [formatShort(d.date), d.Weight!, d.Trend ?? '—'])} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tickFormatter={tickDate(series.length)} interval={tickInterval(series.length)} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis domain={[min, max]} tick={AXIS} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<Tip format={(_, v) => `${v} ${unit}`} />} />
          {target && <ReferenceLine y={conv(target)!} stroke="var(--good)" strokeDasharray="4 4" strokeWidth={1.5} />}
          <Scatter dataKey="Weight" fill="var(--muted)" isAnimationActive={false} />
          <Line type="monotone" dataKey="Trend" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------- workouts

function WorkoutChart({ series, activities, weekStartsOn }: { series: DayPoint[]; activities: { id: string; name: string; kind: string }[]; weekStartsOn: 0 | 1 }) {
  // Colour follows the entity: assigned by definition order, never by rank in this range.
  const workoutDefs = activities.filter((a) => a.kind === 'workout');
  const colorOf = new Map(workoutDefs.map((d, i) => [d.id, `var(--series-${(i % 8) + 1})`]));
  const weeks = new Map<string, Record<string, number>>();
  for (const p of series) {
    const w = startOfWeek(p.date, weekStartsOn);
    const row = weeks.get(w) ?? {};
    for (const [id, m] of Object.entries(p.minutesByActivity)) row[id] = (row[id] ?? 0) + m;
    weeks.set(w, row);
  }
  const used = workoutDefs.filter((d) => [...weeks.values()].some((r) => r[d.id]));
  // fold beyond 7 types into "Other"
  const shown = used.slice(0, 7);
  const other = used.slice(7);
  const data = [...weeks.entries()].map(([week, r]) => ({
    week,
    ...Object.fromEntries(shown.map((d) => [d.name, r[d.id] ?? 0])),
    ...(other.length ? { Other: other.reduce((t, d) => t + (r[d.id] ?? 0), 0) } : {}),
  }));
  const total = series.reduce((t, p) => t + p.activeMin, 0);
  return (
    <ChartCard
      title="Workout minutes per week"
      subtitle={`${total.toLocaleString()} minutes in this period`}
      empty={used.length === 0 && 'Log a few workouts to see your weekly volume by type.'}
      legend={[...shown.map((d) => ({ label: d.name, color: colorOf.get(d.id)! })), ...(other.length ? [{ label: 'Other', color: 'var(--muted)' }] : [])]}
      table={<SimpleTable head={['Week of', ...shown.map((d) => d.name), ...(other.length ? ['Other'] : [])]} rows={data.map((d) => [formatShort(d.week), ...shown.map((s) => (d as Record<string, number | string>)[s.name] as number), ...(other.length ? [(d as { Other?: number }).Other ?? 0] : [])])} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="week" tickFormatter={(w: string) => formatShort(w)} interval={data.length > 8 ? 1 : 0} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<Tip format={(_, v) => `${Math.round(v)} min`} />} cursor={{ fill: 'var(--surface-2)' }} labelFormatter={(w) => `Week of ${formatShort(String(w))}`} />
          {shown.map((d, i) => (
            <Bar key={d.id} dataKey={d.name} stackId="w" fill={colorOf.get(d.id)} stroke="var(--surface)" strokeWidth={1} radius={i === shown.length - 1 && !other.length ? [4, 4, 0, 0] : undefined} maxBarSize={36} isAnimationActive={false} />
          ))}
          {other.length > 0 && <Bar dataKey="Other" stackId="w" fill="var(--muted)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ----------------------------------------------------------------- habits

function HabitHeatmap({ series, habits }: { series: DayPoint[]; habits: ReturnType<typeof computeRangeStats>['habits'] }) {
  const [sel, setSel] = useState<DayPoint | null>(null);
  const withSched = series.filter((p) => p.habitsScheduled > 0);
  if (!habits.length || !withSched.length) {
    return (
      <Card>
        <h2 className="font-bold">Habit completion</h2>
        <EmptyState title="No habits tracked yet" body="Add a habit and check it off to see your calendar fill up." />
      </Card>
    );
  }
  // GitHub-style: columns = weeks, rows = weekdays (Mon..Sun)
  const first = startOfWeek(series[0].date, 1);
  const last = series[series.length - 1].date;
  const cells = rangeKeys(first, addDays(startOfWeek(last, 1), 6));
  const byDate = new Map(series.map((p) => [p.date, p]));
  const level = (p?: DayPoint) => {
    if (!p || p.habitsScheduled === 0) return -1;
    const r = p.habitsDone / p.habitsScheduled;
    return r === 0 ? 0 : r < 0.34 ? 1 : r < 0.67 ? 2 : r < 1 ? 3 : 4;
  };
  // single-hue sequential ramp (habit hue), light → dark
  const shade = ['var(--surface-3)', 'color-mix(in oklab, var(--habit) 30%, var(--surface))', 'color-mix(in oklab, var(--habit) 55%, var(--surface))', 'color-mix(in oklab, var(--habit) 78%, var(--surface))', 'var(--habit)'];
  const weeks = Math.ceil(cells.length / 7);
  return (
    <Card>
      <h2 className="font-bold">Habit completion</h2>
      <p className="mb-3 text-sm text-muted">Darker = more of that day's habits done. Tap a day.</p>
      <div className="overflow-x-auto pb-1" data-noswipe>
        <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: 'repeat(7, auto)', gridTemplateColumns: `repeat(${weeks}, minmax(10px, 18px))`, width: 'max-content', maxWidth: weeks <= 14 ? '100%' : undefined }} role="group" aria-label="Habit completion calendar">
          {cells.map((d) => {
            const p = byDate.get(d);
            const l = level(p);
            const inRange = !!p;
            return (
              <button
                key={d}
                type="button"
                disabled={!inRange || l < 0}
                onClick={() => setSel(p ?? null)}
                aria-label={inRange && p ? `${fromKey(d).toDateString()}: ${p.habitsDone} of ${p.habitsScheduled} habits` : fromKey(d).toDateString()}
                className={clsx('aspect-square rounded-[3px]', sel?.date === d && 'ring-2 ring-accent')}
                style={{ background: !inRange ? 'transparent' : l < 0 ? 'var(--surface-2)' : shade[l] }}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted" aria-hidden>
        Less {shade.map((s, i) => <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: s }} />)} More
      </div>
      {sel && (
        <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm" role="status">
          {fromKey(sel.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: {sel.habitsDone} of {sel.habitsScheduled} habits done
        </p>
      )}
      <h3 className="mb-2 mt-4 text-sm font-bold">Per habit</h3>
      <ul className="space-y-2.5">
        {habits.filter((h) => h.expected > 0).sort((a, b) => b.rate - a.rate).map((h) => (
          <li key={h.id}>
            <Link to={`/habits/${h.id}`} className="block">
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">{h.name}</span>
                <span className="tabular text-muted">
                  {h.rate}% · {h.done}/{Math.round(h.expected)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ring-track" role="progressbar" aria-label={`${h.name} ${h.rate}%`} aria-valuenow={h.rate} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-habit" style={{ width: `${h.rate}%` }} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------- sleep

function SleepChart({ series, targetH, sdMin }: { series: DayPoint[]; targetH: number; sdMin: number }) {
  const nights = series.filter((p) => p.sleepH != null);
  const data = series.map((p) => ({ date: p.date, Sleep: p.sleepH }));
  const consistency = sdMin <= 30 ? 'very consistent' : sdMin <= 60 ? 'fairly consistent' : 'quite variable';
  return (
    <ChartCard
      title="Sleep"
      subtitle={nights.length > 2 ? <span className="flex items-center gap-1"><Moon size={14} aria-hidden /> Bedtime is {consistency} (±{sdMin} min) · target {targetH} h</span> : `Target ${targetH} h`}
      empty={nights.length < 2 && 'Log sleep for a few nights to see duration and consistency.'}
      legend={[{ label: 'Hours slept', color: 'var(--sleep)' }, { label: 'Target', color: 'var(--muted)', kind: 'dash' }]}
      table={<SimpleTable head={['Morning of', 'Hours']} rows={nights.map((p) => [formatShort(p.date), p.sleepH!])} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap={series.length > 40 ? 1 : '20%'}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tickFormatter={tickDate(series.length)} interval={tickInterval(series.length)} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={AXIS} axisLine={false} tickLine={false} width={28} />
          <Tooltip content={<Tip format={(_, v) => `${v} h`} />} cursor={{ fill: 'var(--surface-2)' }} />
          <ReferenceLine y={targetH} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth={1.5} />
          <Bar dataKey="Sleep" fill="var(--sleep)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// -------------------------------------------------------------------- mood

function MoodCard({ stats }: { stats: ReturnType<typeof computeRangeStats> }) {
  const m = stats.mood;
  if (!m.entries) return null;
  const corr = m.energyGoodSleep != null && m.energyLowSleep != null && m.energyGoodSleep - m.energyLowSleep >= 0.5;
  return (
    <Card>
      <h2 className="font-bold">Mood & energy</h2>
      <p className="mt-1 text-sm text-muted">Average energy {m.avgEnergy}/5 across {m.entries} check-ins.</p>
      {corr && (
        <p className="mt-2 flex gap-2 rounded-xl bg-sleep-soft p-3 text-sm">
          <Scale size={16} className="mt-0.5 shrink-0 text-sleep" aria-hidden />
          You feel more energetic on days after 7+ h of sleep: {m.energyGoodSleep}/5 vs {m.energyLowSleep}/5.
        </p>
      )}
    </Card>
  );
}
