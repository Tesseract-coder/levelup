import clsx from 'clsx';
import { ArrowLeft, Flame, Pencil, Shield, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ActivityIcon } from '@/components/icons';
import { Button, Card, EmptyState, IconButton, Notice, PageHeader, Skeleton } from '@/components/ui';
import { useRangeData, useSettings, useToday } from '@/hooks/data';
import { useUI } from '@/stores/ui';
import { addDays, formatShort, fromKey, rangeKeys, startOfWeek } from '@/domain/dates';
import { activeFrom, adherence, computeStreak, dayStatus, dayValue, doneDatesFor, formatValue, indexLogs, isScheduledOn, scheduleLabel, targetLabel } from '@/domain/habits';

const WEEKS = 12;

export default function HabitDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const settings = useSettings();
  const openSheet = useUI((s) => s.openSheet);
  const start = addDays(startOfWeek(today, settings.weekStartsOn), -7 * (WEEKS - 1));
  const { data } = useRangeData(addDays(today, -365), today);
  const def = data?.activities.find((a) => a.id === id);

  const stats = useMemo(() => {
    if (!data || !def) return null;
    const idx = indexLogs(data.logs, data.sleep);
    const done = doneDatesFor(def, idx, addDays(today, -365), today);
    const first = activeFrom(def, idx);
    const streak = computeStreak(def, done, first, today, settings.graceDaysPerWeek, settings.weekStartsOn);
    const a7 = adherence(def, idx, addDays(today, -6), today, today);
    const a30 = adherence(def, idx, addDays(today, -29), today, today);
    const values = rangeKeys(addDays(today, -29), today).map((d) => dayValue(def, d, idx)).filter((v): v is number => v != null);
    const avg = values.length ? values.reduce((t, v) => t + v, 0) / values.length : null;
    const recent = data.logs.filter((l) => l.activityId === def.id).sort((x, y) => (x.date === y.date ? y.createdAt - x.createdAt : x.date < y.date ? 1 : -1)).slice(0, 10);
    return { idx, done, streak, a7, a30, avg, recent, total: done.size, from: first };
  }, [data, def, today, settings]);

  if (!data) return <div className="p-4"><Skeleton className="h-64" /></div>;
  if (!def || !stats) return <EmptyState title="Habit not found" action={<Button onClick={() => navigate('/habits')}>Back to habits</Button>} />;

  const days = rangeKeys(start, addDays(startOfWeek(today, settings.weekStartsOn), 6));
  const graceSet = new Set(stats.streak.graceDays);

  return (
    <div>
      <PageHeader
        title={def.name}
        subtitle={`${scheduleLabel(def)}${targetLabel(def) ? ` · ${targetLabel(def)}` : ''}`}
        left={<IconButton label="Back" onClick={() => navigate(-1)}><ArrowLeft size={22} /></IconButton>}
        right={<IconButton label="Edit habit" onClick={() => openSheet({ type: 'activityEditor', activityId: def.id })}><Pencil size={20} /></IconButton>}
      />
      <div className="space-y-4 px-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<Flame size={18} className="text-protein" />} label="Streak" value={stats.streak.current} unit={plural(stats.streak.current, stats.streak.unit)} />
          <Stat icon={<Trophy size={18} className="text-carbs" />} label="Best" value={stats.streak.best} unit={plural(stats.streak.best, stats.streak.unit)} />
          <Stat icon={<ActivityIcon name={def.icon} size={18} className="text-accent-ink" />} label="Total" value={stats.total} unit={plural(stats.total, def.kind === 'workout' ? 'sessions' : 'days')} />
        </div>
        {stats.streak.graceDays.length > 0 && (
          <Notice tone="good" icon={<Shield size={18} />}>
            A grace day protected your streak ({stats.streak.graceDays.map(formatShort).join(', ')}). You get {settings.graceDaysPerWeek} per week — one miss never wipes your progress.
          </Notice>
        )}

        <Card>
          <h2 className="mb-3 font-bold">Last {WEEKS} weeks</h2>
          <div className="grid grid-flow-col grid-rows-7 gap-1" role="group" aria-label="Completion calendar">
            {days.map((d) => {
              const st = d > today ? 'future' : d < stats.from ? 'before' : dayStatus(def, d, stats.idx);
              const sched = isScheduledOn(def, d);
              return (
                <div
                  key={d}
                  role="img"
                  aria-label={`${fromKey(d).toDateString()}: ${st === 'done' ? 'done' : graceSet.has(d) ? 'grace day' : st === 'future' ? 'upcoming' : sched ? 'not done' : 'not scheduled'}`}
                  className={clsx(
                    'aspect-square rounded-[4px]',
                    st === 'done' ? 'bg-good' : st === 'partial' ? 'bg-good/40' : graceSet.has(d) ? 'border-2 border-dashed border-good' : st === 'future' ? 'bg-transparent' : st === 'before' ? 'bg-surface-2/60' : sched ? 'bg-surface-3' : 'bg-surface-2',
                    d === today && 'ring-2 ring-accent',
                  )}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
            <Legend className="bg-good" label="Done" />
            <Legend className="bg-good/40" label="Partial" />
            <Legend className="border-2 border-dashed border-good" label="Grace day" />
            <Legend className="bg-surface-3" label="Open" />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Last 7 days" value={`${Math.round(stats.a7.rate * 100)}%`} unit={stats.a7.expected ? `${stats.a7.done} of ${stats.a7.expected}` : 'just started'} />
          <Stat label="Last 30 days" value={`${Math.round(stats.a30.rate * 100)}%`} unit={stats.a30.expected ? `${stats.a30.done} of ${stats.a30.expected}` : 'just started'} />
          {stats.avg != null && def.trackingType !== 'check' && def.trackingType !== 'avoid' && (
            <Stat label="30-day average" value={formatValue(def, stats.avg)} unit="on logged days" />
          )}
        </div>

        <Card>
          <h2 className="mb-2 font-bold">Recent entries</h2>
          {stats.recent.length === 0 ? (
            <p className="text-sm text-muted">Nothing logged yet.</p>
          ) : (
            <ul>
              {stats.recent.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center justify-between border-b border-line text-left last:border-0"
                    onClick={() => (def.kind === 'workout' ? openSheet({ type: 'workout', logId: l.id, date: l.date }) : openSheet({ type: 'habit', activityId: def.id, date: l.date }))}
                  >
                    <span>{formatShort(l.date)}</span>
                    <span className="tabular text-muted">
                      {def.kind === 'workout' ? `${l.durationMin} min${l.distanceKm ? ` · ${l.distanceKm} km` : ''}` : def.trackingType === 'check' ? 'Done' : def.trackingType === 'avoid' ? (l.value ? 'Avoided' : 'Not today') : formatValue(def, l.value)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Button block variant="secondary" onClick={() => (def.kind === 'workout' ? openSheet({ type: 'workout', activityId: def.id, date: today }) : def.special === 'sleep' ? openSheet({ type: 'sleep', date: today }) : openSheet({ type: 'habit', activityId: def.id, date: today }))}>
          Log for today
        </Button>
      </div>
    </div>
  );
}

const plural = (n: number, unit: string) => (n === 1 ? unit.replace(/s$/, '') : unit);

function Stat({ icon, label, value, unit }: { icon?: React.ReactNode; label: string; value: React.ReactNode; unit?: string }) {
  return (
    <Card className="p-3">
      <p className="flex items-center gap-1 text-xs font-semibold text-muted">
        {icon}
        {label}
      </p>
      <p className="tabular mt-1 text-2xl font-extrabold">{value}</p>
      {unit && <p className="text-xs text-muted">{unit}</p>}
    </Card>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={clsx('h-3 w-3 rounded-[3px]', className)} aria-hidden /> {label}
    </span>
  );
}
