import { ChevronRight, Flame, Plus, Target } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { ActivityIcon } from '@/components/icons';
import { Button, Card, EmptyState, PageHeader, SectionHeader, Skeleton } from '@/components/ui';
import { useGoal, useRangeData, useSettings, useToday } from '@/hooks/data';
import { useUI } from '@/stores/ui';
import { addDays } from '@/domain/dates';
import { computeDay, STREAK_LOOKBACK, type HabitRow } from '@/domain/day';
import { adherence, scheduleLabel, targetLabel } from '@/domain/habits';
import { GOAL_LABELS } from '@/domain/targets';

export default function HabitsScreen() {
  const today = useToday();
  const settings = useSettings();
  const { data: goal } = useGoal();
  const { data } = useRangeData(addDays(today, -STREAK_LOOKBACK), today);
  const view = useMemo(() => (data ? computeDay(today, data, settings, goal) : null), [data, today, settings, goal]);
  const openSheet = useUI((s) => s.openSheet);
  const archived = data?.activities.filter((a) => a.archived) ?? [];

  return (
    <div>
      <PageHeader title="Habits & goals" />
      <div className="space-y-2 px-4">
        <Link to="/goals" className="block">
          <Card className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-2xl text-on-accent" aria-hidden>
              {goal ? GOAL_LABELS[goal.type].emoji : <Target />}
            </span>
            <span className="flex-1">
              <span className="block text-sm text-muted">Current goal</span>
              <span className="block font-bold">{goal ? (goal.type === 'custom' ? goal.customText : GOAL_LABELS[goal.type].label) : 'Set a goal'}</span>
              {goal && <span className="tabular block text-sm text-muted">{goal.calorieTarget.toLocaleString()} kcal · {goal.proteinTarget} g protein</span>}
            </span>
            <ChevronRight className="text-muted" aria-hidden />
          </Card>
        </Link>

        {!view ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <SectionHeader title="Habits" action={<Button size="sm" variant="ghost" onClick={() => openSheet({ type: 'activityEditor', kind: 'habit' })}><Plus size={18} /> New</Button>} />
            {view.habits.length ? <List rows={view.habits} data={data!} today={today} /> : <Card><EmptyState title="No habits yet" body="Start with one. Small and daily beats big and rare." /></Card>}
            <SectionHeader title="Workouts" action={<Button size="sm" variant="ghost" onClick={() => openSheet({ type: 'activityEditor', kind: 'workout' })}><Plus size={18} /> New</Button>} />
            {view.workoutDefs.length ? <List rows={view.workoutDefs} data={data!} today={today} /> : <Card><EmptyState title="No workout types yet" body="Add what you do so logging is one tap." /></Card>}
            {archived.length > 0 && (
              <details className="mt-4 rounded-2xl bg-surface-2 p-3">
                <summary className="min-h-8 cursor-pointer font-semibold">Archived ({archived.length})</summary>
                <ul className="mt-2">
                  {archived.map((a) => (
                    <li key={a.id}>
                      <button type="button" className="flex min-h-12 w-full items-center gap-3 text-left" onClick={() => openSheet({ type: 'activityEditor', activityId: a.id })}>
                        <ActivityIcon name={a.icon} className="text-muted" /> <span className="flex-1">{a.name}</span>
                        <span className="text-sm text-accent-ink">Restore</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function List({ rows, data, today }: { rows: HabitRow[]; data: NonNullable<ReturnType<typeof useRangeData>['data']>; today: string }) {
  const view = useMemo(() => computeDay(today, data, { graceDaysPerWeek: 1, weekStartsOn: 1 }), [today, data]);
  return (
    <Card className="p-2">
      <ul>
        {rows.map((r) => {
          const a = adherence(r.def, view.idx, addDays(today, -6), today, today);
          return (
            <li key={r.def.id}>
              <Link to={`/habits/${r.def.id}`} className="flex min-h-16 items-center gap-3 rounded-2xl px-2">
                <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${r.def.color}22`, color: r.def.color }}>
                  <ActivityIcon name={r.def.icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.def.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {scheduleLabel(r.def)}
                    {targetLabel(r.def) && ` · ${targetLabel(r.def)}`} · {Math.round(a.rate * 100)}% last 7 days
                  </span>
                </span>
                {r.streak.current > 0 && (
                  <span className="flex items-center gap-0.5 text-sm font-bold" aria-label={`${r.streak.current} ${r.streak.unit} streak`}>
                    <Flame size={16} className="text-protein" aria-hidden />
                    {r.streak.current}
                    <span className="text-xs font-medium text-muted">{r.streak.unit === 'weeks' ? 'wk' : 'd'}</span>
                  </span>
                )}
                <ChevronRight size={18} className="text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
