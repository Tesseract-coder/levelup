import { ChevronRight, Dumbbell, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, EmptyState, Notice, Segmented, Skeleton } from '@/components/ui';
import type { DayType } from '@/db/types';
import { useSettings, useToday } from '@/hooks/data';
import { useAllSessions, useExercises, useWeightUnit } from '@/hooks/strength';
import { AXIS, ChartCard, GRID, SimpleTable, Tip } from '@/features/insights/chartKit';
import { WEEKLY_SETS_GUIDE } from '@/config/strength';
import { addDays, formatShort, startOfWeek } from '@/domain/dates';
import { DAY_TYPE_LABELS } from '@/domain/strength/dayTypes';
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from '@/domain/strength/library';
import { balance, neglected, setsByMuscle, topImprovers, weeklyRows } from '@/domain/strength/progress';
import { fmtVolume, fmtWeight, toDisplay } from '@/domain/strength/units';
import { useUI } from '@/stores/ui';
import { BodyMap } from './BodyMap';

type Range = '28' | '84' | '182' | '365';
const DAY_COLORS: Partial<Record<DayType | 'other', string>> = {
  chest: 'var(--series-1)', back: 'var(--series-2)', legs: 'var(--series-3)', shoulders: 'var(--series-4)', arms: 'var(--series-5)',
  push: 'var(--series-1)', pull: 'var(--series-2)', upper: 'var(--series-7)', lower: 'var(--series-3)', full: 'var(--series-6)', core: 'var(--series-8)', glutes: 'var(--series-6)', other: 'var(--muted)',
};

export default function StrengthInsights() {
  const today = useToday();
  const settings = useSettings();
  const unit = useWeightUnit();
  const { get, ready } = useExercises();
  const { data: sessions } = useAllSessions();
  const openSheet = useUI((s) => s.openSheet);
  const [range, setRange] = useState<Range>('84');
  const [setsView, setSetsView] = useState<'week' | 'avg'>('week');
  const start = addDays(today, -Number(range) + 1);

  const m = useMemo(() => {
    if (!sessions) return null;
    const inRange = sessions.filter((s) => s.date >= start && s.date <= today);
    const weekStart = startOfWeek(today, settings.weekStartsOn);
    const thisWeek = sessions.filter((s) => s.date >= weekStart && s.date <= today);
    const weeks = weeklyRows(sessions, start, today, settings.weekStartsOn);
    const avgSets = setsByMuscle(inRange, get);
    const nWeeks = Math.max(1, weeks.length);
    const counts = new Map<string, number>();
    for (const s of inRange) for (const id of s.exerciseIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return {
      inRange,
      weeks,
      weekSets: setsByMuscle(thisWeek, get),
      avgSets: Object.fromEntries(Object.entries(avgSets).map(([k, v]) => [k, Math.round((v / nWeeks) * 10) / 10])) as typeof avgSets,
      balance: balance(inRange, get),
      neglected: neglected(sessions, get, today),
      improvers: topImprovers(sessions, get, today, 6, 3, (s) => ({ bodyWeightKg: s.bodyWeightKg })),
      lifts: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
      volume: inRange.reduce((t, s) => t + s.totalVolumeKg, 0),
    };
  }, [sessions, start, today, settings.weekStartsOn, get]);

  if (!m || !ready) return <Skeleton className="h-64" />;
  if (!sessions!.length) {
    return (
      <Card>
        <EmptyState icon={<Dumbbell size={24} />} title="No strength workouts yet" body="Log a workout with exercises and sets to see weekly sets per muscle, balance and your top lifts." action={<Button onClick={() => openSheet({ type: 'strengthStart', date: today })}>Start a workout</Button>} />
      </Card>
    );
  }

  const dayKeys = [...new Set(m.weeks.flatMap((w) => Object.keys(w.byDayType)))] as (DayType | 'other')[];
  const weekData = m.weeks.map((w) => ({ week: w.week, ...Object.fromEntries(dayKeys.map((k) => [k === 'other' ? 'Other' : DAY_TYPE_LABELS[k as DayType], w.byDayType[k] ?? 0])) }));
  const sets = setsView === 'week' ? m.weekSets : m.avgSets;
  const setRows = MUSCLE_GROUPS.map((g) => ({ name: MUSCLE_GROUP_LABELS[g], sets: sets[g] ?? 0 }));
  const volData = m.weeks.map((w) => ({ week: w.week, Volume: Math.round(toDisplay(w.volumeKg, unit)) }));
  const b = m.balance;

  return (
    <div className="space-y-4">
      <Segmented label="Strength range" value={range} onChange={setRange} options={[{ value: '28', label: '4W' }, { value: '84', label: '12W' }, { value: '182', label: '6M' }, { value: '365', label: '1Y' }]} />
      <Card className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="tabular text-xl font-extrabold">{m.inRange.length}</p>
          <p className="text-xs text-muted">workouts</p>
        </div>
        <div>
          <p className="tabular text-xl font-extrabold">{(m.inRange.length / Math.max(1, m.weeks.length)).toFixed(1)}</p>
          <p className="text-xs text-muted">per week</p>
        </div>
        <div>
          <p className="tabular text-xl font-extrabold">{fmtVolume(m.volume, unit, true)}</p>
          <p className="text-xs text-muted">volume</p>
        </div>
      </Card>
      <Link to="/routines" className="flex min-h-12 items-center justify-between rounded-2xl bg-surface px-4 font-semibold shadow-card">
        Routines & weekly split <ChevronRight size={18} className="text-muted" aria-hidden />
      </Link>
      {m.neglected.map((n) => (
        <Notice key={n.label} tone="caution">
          No {n.label} training in {n.daysSince} days.
        </Notice>
      ))}

      <ChartCard
        title="Workouts per week"
        subtitle="By day type"
        empty={!m.inRange.length && 'No workouts in this range.'}
        legend={dayKeys.map((k) => ({ label: k === 'other' ? 'Other' : DAY_TYPE_LABELS[k as DayType], color: DAY_COLORS[k] ?? 'var(--muted)' }))}
        table={<SimpleTable head={['Week of', 'Workouts']} rows={m.weeks.map((w) => [formatShort(w.week), w.sessions])} />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weekData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="week" tickFormatter={(w: string) => formatShort(w)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
            <Tooltip content={<Tip />} cursor={{ fill: 'var(--surface-2)' }} labelFormatter={(w) => `Week of ${formatShort(String(w))}`} />
            {dayKeys.map((k) => (
              <Bar key={k} dataKey={k === 'other' ? 'Other' : DAY_TYPE_LABELS[k as DayType]} stackId="d" fill={DAY_COLORS[k] ?? 'var(--muted)'} stroke="var(--surface)" strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card>
        <div className="mb-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">Hard sets per muscle</h2>
            <p className="text-sm text-muted">
              Shaded band: {WEEKLY_SETS_GUIDE.min}–{WEEKLY_SETS_GUIDE.max} sets/week, a general guideline only. Secondary muscles count as ½.
            </p>
          </div>
        </div>
        <Segmented label="Sets view" value={setsView} onChange={setSetsView} options={[{ value: 'week', label: 'This week' }, { value: 'avg', label: 'Weekly average' }]} />
        <div className="-mx-2 mt-2 h-80" role="group" aria-label="Hard sets per muscle chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={setRows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <ReferenceArea x1={WEEKLY_SETS_GUIDE.min} x2={WEEKLY_SETS_GUIDE.max} fill="var(--good)" fillOpacity={0.12} ifOverflow="extendDomain" />
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={78} interval={0} />
              <Tooltip content={<Tip format={(_, v) => `${v} sets`} />} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="sets" name="Sets" fill="var(--accent)" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">This week's muscles</h2>
        <BodyMap sets={m.weekSets} />
      </Card>

      <Card className="space-y-4">
        <h2 className="font-bold">Balance</h2>
        <SplitBar left="Push" right="Pull" a={b.push} b={b.pull} />
        <SplitBar left="Upper" right="Lower" a={b.upper} b={b.lower} />
        <p className="text-xs text-muted">Working sets in this range. Roughly even is a reasonable default unless you're training something on purpose.</p>
      </Card>

      <ChartCard title={`Volume per week (${unit})`} empty={!m.inRange.length && 'No workouts in this range.'} table={<SimpleTable head={['Week of', `Volume ${unit}`]} rows={volData.map((d) => [formatShort(d.week), d.Volume.toLocaleString()])} />}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={volData} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="week" tickFormatter={(w: string) => formatShort(w)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
            <Tooltip content={<Tip format={(_, v) => `${v.toLocaleString()} ${unit}`} />} labelFormatter={(w) => `Week of ${formatShort(String(w))}`} />
            <Line type="monotone" dataKey="Volume" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card>
        <h2 className="mb-2 flex items-center gap-2 font-bold">
          <TrendingUp size={18} className="text-good" aria-hidden /> Top improving lifts
        </h2>
        {m.improvers.length === 0 ? (
          <p className="text-sm text-muted">Log a lift 3+ times in 6 weeks to see how its estimated 1RM is moving.</p>
        ) : (
          <ul className="space-y-1">
            {m.improvers.map((x) => (
              <li key={x.exerciseId}>
                <Link to={`/exercises/${x.exerciseId}`} className="flex min-h-12 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{get(x.exerciseId).name}</span>
                  <span className="tabular text-sm text-muted">
                    {fmtWeight(x.from, unit, false)} → {fmtWeight(x.to, unit)}
                  </span>
                  <span className="tabular rounded-full bg-good-soft px-2 text-sm font-bold text-good">+{x.pct}%</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted">Estimated 1RM, last 6 weeks.</p>
      </Card>

      {m.lifts.length > 0 && (
        <Card className="p-2">
          <h2 className="px-2 pb-1 pt-2 font-bold">Your lifts</h2>
          <ul>
            {m.lifts.map(([id, n]) => (
              <li key={id}>
                <Link to={`/exercises/${id}`} className="flex min-h-12 items-center gap-2 rounded-xl px-2">
                  <span className="min-w-0 flex-1 truncate">{get(id).name}</span>
                  <span className="tabular text-sm text-muted">{n}×</span>
                  <ChevronRight size={18} className="text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SplitBar({ left, right, a, b }: { left: string; right: string; a: number; b: number }) {
  const total = a + b;
  const pct = total ? Math.round((a / total) * 100) : 50;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>
          {left} <span className="tabular text-muted">{a}</span>
        </span>
        <span>
          <span className="tabular text-muted">{b}</span> {right}
        </span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${left} ${a} sets, ${right} ${b} sets`}>
        {total > 0 && (
          <>
            <span style={{ width: `${pct}%`, background: 'var(--series-1)' }} />
            <span style={{ width: `${100 - pct}%`, background: 'var(--series-2)' }} />
          </>
        )}
      </div>
    </div>
  );
}
