import { ArrowLeft, Dumbbell, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ActivityIcon } from '@/components/icons';
import { Button, Card, EmptyState, IconButton, PageHeader, Skeleton } from '@/components/ui';
import { useRangeData, useToday } from '@/hooks/data';
import { useUI } from '@/stores/ui';
import { addDays, formatDay, startOfWeek } from '@/domain/dates';

export default function WorkoutHistoryScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const openSheet = useUI((s) => s.openSheet);
  const { data } = useRangeData(addDays(today, -180), today);
  const groups = useMemo(() => {
    if (!data) return [];
    const defs = new Map(data.activities.map((a) => [a.id, a]));
    const logs = data.logs.filter((l) => defs.get(l.activityId)?.kind === 'workout').sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
    // PR detection: heaviest set per exercise, chronologically
    const best = new Map<string, number>();
    const prLogs = new Set<string>();
    for (const l of [...logs].reverse()) {
      for (const e of l.exercises ?? []) {
        const k = e.name.toLowerCase();
        const top = Math.max(0, ...e.sets.map((s) => s.weightKg));
        if (best.has(k) && top > best.get(k)!) prLogs.add(l.id);
        best.set(k, Math.max(best.get(k) ?? 0, top));
      }
    }
    const byWeek = new Map<string, typeof logs>();
    for (const l of logs) {
      const w = startOfWeek(l.date, 1);
      byWeek.set(w, [...(byWeek.get(w) ?? []), l]);
    }
    return [...byWeek.entries()].map(([week, ls]) => ({ week, logs: ls.map((l) => ({ log: l, def: defs.get(l.activityId)!, pr: prLogs.has(l.id) })), minutes: ls.reduce((t, l) => t + (l.durationMin ?? 0), 0) }));
  }, [data]);

  return (
    <div>
      <PageHeader title="Workout history" left={<IconButton label="Back" onClick={() => navigate(-1)}><ArrowLeft size={22} /></IconButton>} />
      <div className="space-y-4 px-4">
        {!data ? (
          <Skeleton className="h-64" />
        ) : groups.length === 0 ? (
          <Card>
            <EmptyState icon={<Dumbbell size={24} />} title="No workouts yet" body="Your sessions will show up here, grouped by week." action={<Button onClick={() => openSheet({ type: 'workout', date: today })}>Log a workout</Button>} />
          </Card>
        ) : (
          groups.map((g) => (
            <section key={g.week}>
              <h2 className="mb-2 flex justify-between px-1 text-sm font-bold text-muted">
                <span>Week of {formatDay(g.week, today)}</span>
                <span className="tabular">{g.logs.length} sessions · {g.minutes} min</span>
              </h2>
              <Card className="p-2">
                <ul>
                  {g.logs.map(({ log, def, pr }) => (
                    <li key={log.id}>
                      <button type="button" onClick={() => openSheet({ type: 'workout', logId: log.id, date: log.date })} className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-2 text-left">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-activity-soft text-activity"><ActivityIcon name={def.icon} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 font-semibold">
                            <span className="truncate">{def.name}</span>
                            {pr && <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-good-soft px-2 text-xs text-good"><Trophy size={12} /> PR</span>}
                          </span>
                          <span className="tabular block truncate text-sm text-muted">
                            {formatDay(log.date, today)} · {log.durationMin} min{log.distanceKm ? ` · ${log.distanceKm} km` : ''}{log.exercises?.length ? ` · ${log.exercises.length} exercises` : ''}
                          </span>
                        </span>
                        {log.caloriesBurnedEst ? <span className="tabular shrink-0 whitespace-nowrap text-sm text-muted">≈{log.caloriesBurnedEst} kcal</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
