import clsx from 'clsx';
import { Apple, Check, ChevronLeft, ChevronRight, Dumbbell, Flame, Moon, Plus, Sparkles, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Ring } from '@/components/Ring';
import { ActivityIcon } from '@/components/icons';
import { Button, Card, EmptyState, EstimateBadge, SectionHeader, Skeleton } from '@/components/ui';
import { useGoal, useProfile, useRangeData, useSelectedDate, useSettings, useToday } from '@/hooks/data';
import { useUI } from '@/stores/ui';
import { addDays, formatDay, fromKey, greeting, weekdayShort } from '@/domain/dates';
import { computeDay, STREAK_LOOKBACK, type HabitRow } from '@/domain/day';
import { formatValue, scheduleLabel } from '@/domain/habits';
import { dailyInsight } from '@/domain/insights';
import { groupByMeal, MEAL_LABEL } from '@/domain/nutrition';
import { setAvoidAnswer, toggleCheck } from '@/features/log/actions';
import { FastingCard } from './FastingCard';
import { SafetyNotice } from './SafetyNotice';

export function TodayScreen() {
  const today = useToday();
  const date = useSelectedDate();
  const setDate = useUI((s) => s.setSelectedDate);
  const settings = useSettings();
  const { data: goal } = useGoal();
  const { data: profile } = useProfile();
  const { data, isLoading } = useRangeData(addDays(date, -STREAK_LOOKBACK), date);
  const view = useMemo(() => (data ? computeDay(date, data, settings, goal) : null), [data, date, settings, goal]);
  const isToday = date === today;

  const go = (n: number) => {
    const next = addDays(date, n);
    if (next > today) return;
    setDate(next === today ? null : next);
  };
  const swipe = useSwipe(() => go(1), () => go(-1));

  return (
    <div {...swipe}>
      <header className="px-4 pt-4">
        <p className="text-sm font-medium text-muted">{isToday ? greeting() + (profile?.name ? `, ${profile.name}` : '') : 'Looking back'}</p>
        <div className="flex items-center gap-1">
          <h1 className="flex-1 text-2xl font-extrabold tracking-tight">{formatDay(date, today)}</h1>
          <Link to={`/summary/day/${date}`} className="flex min-h-11 items-center gap-1 rounded-full bg-accent-soft px-4 text-sm font-semibold text-accent-ink">
            <Sparkles size={16} aria-hidden /> Summary
          </Link>
        </div>
      </header>
      <DateStrip date={date} today={today} onPick={(d) => setDate(d === today ? null : d)} onPrev={() => go(-1)} onNext={() => go(1)} />

      <div className="space-y-4 px-4">
        {isLoading || !view ? (
          <>
            <Skeleton className="h-40" />
            <Skeleton className="h-24" />
            <Skeleton className="h-64" />
          </>
        ) : (
          <>
            <RingsCard view={view} goal={goal} />
            <Card className="flex gap-3 bg-accent-soft shadow-none" role="note" aria-label="Daily insight">
              <Sparkles size={20} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
              <p className="text-[15px] leading-snug">{dailyInsight(view, goal, new Date(), isToday)}</p>
            </Card>
            {isToday && <SafetyNotice />}
            {isToday && new Date().getDay() === settings.weeklySummaryDay && new Date().getHours() >= 17 && (
              <Link to={`/summary/week/${date}`} className="block">
                <Card className="flex items-center gap-3 bg-accent text-on-accent">
                  <Sparkles size={22} aria-hidden />
                  <span className="flex-1">
                    <span className="block font-bold">Your weekly summary is ready</span>
                    <span className="block text-sm opacity-90">Wins, misses and one focus for next week</span>
                  </span>
                  <ChevronRight size={20} aria-hidden />
                </Card>
              </Link>
            )}
            {isToday && settings.fasting && <FastingCard />}

            <section aria-labelledby="habits-h">
              <SectionHeader title="Habits" action={<Link to="/habits" className="min-h-11 content-center px-2 text-sm font-semibold text-accent-ink" id="habits-h-link">Manage</Link>} />
              <h2 id="habits-h" className="sr-only">Habits</h2>
              {view.habits.length === 0 ? (
                <Card>
                  <EmptyState title="No habits yet" body="Add one small habit you'd like to build — water or sleep are great starters." action={<HabitAddButton />} />
                </Card>
              ) : (
                <Card className="p-2">
                  <ul>
                    {view.habits.map((h) => (
                      <HabitItem key={h.def.id} row={h} date={date} />
                    ))}
                  </ul>
                </Card>
              )}
            </section>

            <WorkoutsSection view={view} date={date} />
            <FoodSection view={view} date={date} />

            <Link to={`/summary/day/${date}`} className="block">
              <Card className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                  <Sparkles size={20} aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{isToday ? 'How did today go?' : 'Daily summary'}</span>
                  <span className="block text-sm text-muted">Score, wins, misses and one thing to improve</span>
                </span>
                <ChevronRight size={20} className="text-muted" aria-hidden />
              </Card>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      // ignore swipes that begin inside horizontally scrollable areas
      if ((e.target as HTMLElement).closest('[data-noswipe]')) return;
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) (dx < 0 ? onLeft : onRight)();
    },
  };
}

function DateStrip({ date, today, onPick, onPrev, onNext }: { date: string; today: string; onPick: (d: string) => void; onPrev: () => void; onNext: () => void }) {
  // a week window ending at the later of (selected + 3) and today-capped
  const end = [addDays(date, 3), today].sort()[0];
  const days = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  return (
    <div className="flex items-center gap-1 px-2 py-3" data-noswipe>
      <button type="button" aria-label="Previous day" onClick={onPrev} className="grid h-11 w-9 place-items-center text-muted">
        <ChevronLeft size={20} />
      </button>
      <ol className="grid flex-1 grid-cols-7 gap-1" aria-label="Choose day">
        {days.map((d) => {
          const sel = d === date;
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => onPick(d)}
                aria-current={sel ? 'date' : undefined}
                aria-label={fromKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                className={clsx('flex min-h-14 w-full flex-col items-center justify-center rounded-2xl text-xs font-semibold transition-colors', sel ? 'bg-accent text-on-accent' : 'text-muted')}
              >
                {weekdayShort(d)}
                <span className={clsx('tabular text-base font-bold', sel ? '' : 'text-ink')}>{fromKey(d).getDate()}</span>
                {d === today && !sel && <span className="mt-0.5 h-1 w-1 rounded-full bg-accent" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ol>
      <button type="button" aria-label="Next day" onClick={onNext} disabled={date >= today} className="grid h-11 w-9 place-items-center text-muted disabled:opacity-30">
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

function RingsCard({ view, goal }: { view: NonNullable<ReturnType<typeof computeDay>>; goal: ReturnType<typeof useGoal>['data'] }) {
  const t = view.totals;
  const calT = goal?.calorieTarget ?? 2000;
  const proT = goal?.proteinTarget ?? 100;
  const rings = [
    { label: 'Calories', value: t.calories, target: calT, color: 'var(--calories)', unit: 'kcal' },
    { label: 'Protein', value: t.proteinG, target: proT, color: 'var(--protein)', unit: 'g' },
    { label: 'Active', value: view.activeMinutes, target: view.activeTarget, color: 'var(--activity)', unit: 'min' },
    { label: 'Habits', value: view.habitsDone, target: Math.max(1, view.habitsScheduled), color: 'var(--habit)', unit: '' },
  ];
  return (
    <Card>
      <div className="grid grid-cols-4 gap-1">
        {rings.map((r) => (
          <div key={r.label} className="flex flex-col items-center">
            <Ring value={r.value / r.target} color={r.color} label={`${r.label}: ${Math.round(r.value)} of ${Math.round(r.target)} ${r.unit}`} size={74} stroke={8}>
              <span className="tabular text-[15px] font-extrabold leading-none">{r.label === 'Habits' ? `${r.value}/${view.habitsScheduled}` : Math.round(r.value).toLocaleString()}</span>
            </Ring>
            <span className="mt-1.5 text-xs font-semibold">{r.label}</span>
            <span className="tabular text-[11px] text-muted">{r.label === 'Habits' ? 'done' : `of ${Math.round(r.target).toLocaleString()} ${r.unit}`}</span>
          </div>
        ))}
      </div>
      <MacroBar totals={t} goal={goal} />
      {view.burned > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
          <Flame size={16} className="text-activity" aria-hidden /> ≈ {view.burned} kcal burned in workouts <EstimateBadge note="Estimated from MET values, your weight and duration." />
        </p>
      )}
    </Card>
  );
}

export function MacroBar({ totals, goal }: { totals: { proteinG: number; carbsG: number; fatG: number }; goal: ReturnType<typeof useGoal>['data'] }) {
  const rows = [
    { label: 'Protein', v: totals.proteinG, t: goal?.proteinTarget ?? 100, c: 'var(--protein)', bg: 'var(--protein-soft)' },
    { label: 'Carbs', v: totals.carbsG, t: goal?.carbsTarget ?? 250, c: 'var(--carbs)', bg: 'var(--carbs-soft)' },
    { label: 'Fat', v: totals.fatG, t: goal?.fatTarget ?? 65, c: 'var(--fat)', bg: 'var(--fat-soft)' },
  ];
  return (
    <div className="mt-4 grid grid-cols-3 gap-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="text-xs leading-tight">
            <span className="block font-semibold">{r.label}</span>
            <span className="tabular block whitespace-nowrap text-muted">
              {Math.round(r.v)} / {r.t} g
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: r.bg }} role="progressbar" aria-label={`${r.label} ${Math.round(r.v)} of ${r.t} grams`} aria-valuenow={Math.round((r.v / r.t) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, (r.v / r.t) * 100)}%`, background: r.c }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function HabitAddButton() {
  const openSheet = useUI((s) => s.openSheet);
  return (
    <Button variant="soft" size="sm" onClick={() => openSheet({ type: 'activityEditor', kind: 'habit' })}>
      <Plus size={18} /> Add a habit
    </Button>
  );
}

function HabitItem({ row, date }: { row: HabitRow; date: string }) {
  const openSheet = useUI((s) => s.openSheet);
  const navigate = useNavigate();
  const { def, value, status, progress, streak, scheduled } = row;
  const [pulse, setPulse] = useState(false);
  const done = status === 'done';

  const primary = async () => {
    if (def.special === 'sleep') return openSheet({ type: 'sleep', date });
    if (def.special === 'water') return openSheet({ type: 'water', date });
    if (def.trackingType === 'check') {
      const nowDone = await toggleCheck(def, date);
      if (nowDone) {
        setPulse(true);
        setTimeout(() => setPulse(false), 260);
      }
      return;
    }
    if (def.trackingType === 'avoid') return; // inline buttons
    openSheet({ type: 'habit', activityId: def.id, date });
  };

  const sub =
    def.trackingType === 'check'
      ? scheduleLabel(def)
      : def.trackingType === 'avoid'
        ? status === 'done'
          ? 'Avoided today'
          : status === 'slipped'
            ? 'Not today — that’s okay'
            : 'Did you avoid it today?'
        : `${value != null ? formatValue(def, value) : '—'}${def.target ? ` / ${formatValue(def, def.target)}` : ''}`;

  return (
    <li className={clsx('flex min-h-16 items-center gap-3 rounded-2xl px-2', !scheduled && 'opacity-60')}>
      <button
        type="button"
        onClick={primary}
        aria-label={
          def.trackingType === 'check' ? `${def.name}: ${done ? 'done, tap to undo' : 'mark done'}` : def.trackingType === 'avoid' ? def.name : `Log ${def.name}`
        }
        aria-pressed={def.trackingType === 'check' ? done : undefined}
        className="relative grid h-12 w-12 shrink-0 place-items-center"
        disabled={def.trackingType === 'avoid'}
      >
        {def.trackingType === 'check' ? (
          <span
            className={clsx(
              'grid h-11 w-11 place-items-center rounded-full border-2 transition-colors duration-150',
              done ? 'border-transparent bg-good text-white' : 'border-line text-transparent',
              pulse && 'animate-pulse-check',
            )}
          >
            <Check size={22} strokeWidth={3} />
          </span>
        ) : (
          <Ring value={progress} color={done ? 'var(--good)' : def.color} size={44} stroke={5} label={`${Math.round(progress * 100)}%`}>
            <ActivityIcon name={def.icon} size={18} className={done ? 'text-good' : 'text-muted'} />
          </Ring>
        )}
      </button>
      <button type="button" className="min-w-0 flex-1 py-2 text-left" onClick={() => navigate(`/habits/${def.id}`)}>
        <span className={clsx('block truncate font-semibold', done && def.trackingType === 'check' && 'text-muted line-through decoration-2')}>{def.name}</span>
        <span className="tabular block truncate text-sm text-muted">{sub}</span>
      </button>
      {def.trackingType === 'avoid' ? (
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={`Yes, avoided ${def.name}`}
            aria-pressed={status === 'done'}
            onClick={() => setAvoidAnswer(def, date, true)}
            className={clsx('grid h-11 w-11 place-items-center rounded-full', status === 'done' ? 'bg-good text-white' : 'bg-surface-2 text-muted')}
          >
            <Check size={20} strokeWidth={3} />
          </button>
          <button
            type="button"
            aria-label={`No, didn't avoid ${def.name} today`}
            aria-pressed={status === 'slipped'}
            onClick={() => setAvoidAnswer(def, date, false)}
            className={clsx('grid h-11 w-11 place-items-center rounded-full', status === 'slipped' ? 'bg-caution-soft text-caution' : 'bg-surface-2 text-muted')}
          >
            <X size={20} strokeWidth={3} />
          </button>
        </div>
      ) : (
        streak.current > 1 && (
          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-surface-2 px-2 py-1 text-xs font-bold" aria-label={`${streak.current} ${streak.unit} streak`}>
            <Flame size={14} className="text-protein" aria-hidden /> {streak.current}
          </span>
        )
      )}
      {def.special === 'sleep' && value == null && <Moon size={18} className="sr-only" />}
    </li>
  );
}

function WorkoutsSection({ view, date }: { view: NonNullable<ReturnType<typeof computeDay>>; date: string }) {
  const openSheet = useUI((s) => s.openSheet);
  return (
    <section aria-labelledby="workouts-h">
      <SectionHeader
        title="Workouts"
        action={
          <Link to="/workouts" className="min-h-11 content-center px-2 text-sm font-semibold text-accent-ink">
            History
          </Link>
        }
      />
      <h2 id="workouts-h" className="sr-only">Workouts</h2>
      <Card className="p-2">
        {view.workouts.length > 0 && (
          <ul className="mb-1">
            {view.workouts.map(({ def, log }) => (
              <li key={log.id}>
                <button type="button" onClick={() => openSheet({ type: 'workout', logId: log.id, date })} className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-2 text-left">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-activity-soft text-activity">
                    <ActivityIcon name={def.icon} />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{def.name}</span>
                    <span className="tabular block text-sm text-muted">
                      {log.durationMin} min · {log.intensity ?? 'moderate'}
                      {log.distanceKm ? ` · ${log.distanceKm} km` : ''}
                      {log.caloriesBurnedEst ? ` · ≈${log.caloriesBurnedEst} kcal` : ''}
                    </span>
                  </span>
                  <ChevronRight size={18} className="text-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {view.workoutDefs.length > 0 ? (
          <div className="flex flex-wrap gap-2 p-2">
            {view.workoutDefs.map((w) => (
              <button
                key={w.def.id}
                type="button"
                onClick={() => openSheet({ type: 'workout', activityId: w.def.id, date })}
                className="flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm font-medium"
              >
                <Plus size={16} className="text-activity" aria-hidden />
                {w.def.name}
                {w.def.schedule.type === 'weekly' && (
                  <span className="tabular text-xs text-muted">
                    {w.weekCount}/{w.def.schedule.times} wk
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Dumbbell size={24} />} title="No workouts set up" body="Add the activities you do so logging is one tap." action={<Button size="sm" variant="soft" onClick={() => openSheet({ type: 'activityEditor', kind: 'workout' })}>Add workout type</Button>} />
        )}
      </Card>
    </section>
  );
}

function FoodSection({ view, date }: { view: NonNullable<ReturnType<typeof computeDay>>; date: string }) {
  const navigate = useNavigate();
  const groups = groupByMeal(view.food);
  return (
    <section aria-labelledby="food-h">
      <SectionHeader
        title="Food"
        action={
          <Link to={`/log?date=${date}`} className="min-h-11 content-center px-2 text-sm font-semibold text-accent-ink">
            Diary
          </Link>
        }
      />
      <h2 id="food-h" className="sr-only">Food</h2>
      <Card className="p-2">
        {groups.length === 0 ? (
          <EmptyState icon={<Apple size={24} />} title="No food logged" body="Describe everything you ate in one go — we'll break it down for you." />
        ) : (
          <ul>
            {groups.map((g) => {
              const kcal = g.items.reduce((t, i) => t + i.calories, 0);
              const p = g.items.reduce((t, i) => t + i.proteinG, 0);
              return (
                <li key={g.meal}>
                  <Link to={`/log?date=${date}`} className="flex min-h-14 items-center gap-3 rounded-2xl px-2">
                    <span className="flex-1">
                      <span className="block font-semibold">{MEAL_LABEL[g.meal]}</span>
                      <span className="block truncate text-sm text-muted">{g.items.map((i) => i.name).join(', ')}</span>
                    </span>
                    <span className="tabular text-right text-sm">
                      <span className="block font-bold">{Math.round(kcal).toLocaleString()} kcal</span>
                      <span className="block text-muted">{Math.round(p)} g protein</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="p-2">
          <Button block variant="soft" onClick={() => navigate(`/food/new?date=${date}`)}>
            <Plus size={18} /> Log food
          </Button>
        </div>
      </Card>
    </section>
  );
}
