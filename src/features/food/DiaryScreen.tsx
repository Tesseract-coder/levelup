import { ChevronLeft, ChevronRight, Copy, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Card, EmptyState, EstimateBadge, IconButton, PageHeader, Skeleton } from '@/components/ui';
import { repo } from '@/db';
import type { FoodEntry } from '@/db/types';
import { removeWithUndo, useFood, useGoal, useToday } from '@/hooks/data';
import { useUI } from '@/stores/ui';
import { addDays, formatDay } from '@/domain/dates';
import { groupByMeal, MEAL_LABEL, sumMacros } from '@/domain/nutrition';
import { newId } from '@/lib/id';
import { refresh } from '@/lib/queryClient';
import { MacroBar } from '@/features/today/TodayScreen';

export default function DiaryScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const today = useToday();
  const date = params.get('date') ?? today;
  const { data: food, isLoading } = useFood(date);
  const { data: goal } = useGoal();
  const openSheet = useUI((s) => s.openSheet);
  const totals = sumMacros(food ?? []);
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });

  async function copyMeal(entries: FoodEntry[]) {
    const now = Date.now();
    await repo.saveFood(entries.map((e, i) => ({ ...e, id: newId(), date: today, createdAt: now + i, source: 'saved' })));
    await refresh();
    useUI.getState().showSnack({ message: `Copied ${MEAL_LABEL[entries[0].meal]} to today` });
  }

  return (
    <div>
      <PageHeader
        title="Food diary"
        subtitle={formatDay(date, today)}
        right={
          <div className="flex">
            <IconButton label="Previous day" onClick={() => setDate(addDays(date, -1))}>
              <ChevronLeft size={22} />
            </IconButton>
            <IconButton label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} className="disabled:opacity-30">
              <ChevronRight size={22} />
            </IconButton>
          </div>
        }
      />
      <div className="space-y-4 px-4">
        <Card>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-muted">Eaten</p>
              <p className="tabular text-3xl font-extrabold">
                {totals.calories.toLocaleString()} <span className="text-base font-semibold text-muted">/ {goal?.calorieTarget.toLocaleString() ?? '—'} kcal</span>
              </p>
            </div>
            <EstimateBadge note="Food values are estimates — portion sizes and recipes vary." />
          </div>
          <MacroBar totals={totals} goal={goal} />
        </Card>

        {isLoading ? (
          <Skeleton className="h-48" />
        ) : !food?.length ? (
          <Card>
            <EmptyState title="Nothing logged for this day" body="Describe what you ate in one go and review it before saving." action={<Button onClick={() => navigate(`/food/new?date=${date}`)}>Log food</Button>} />
          </Card>
        ) : (
          groupByMeal(food).map((g) => {
            const t = sumMacros(g.items);
            return (
              <section key={g.meal}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="font-bold">{MEAL_LABEL[g.meal]}</h2>
                  <div className="flex items-center gap-1">
                    <span className="tabular text-sm text-muted">{t.calories.toLocaleString()} kcal · {t.proteinG} g P</span>
                    {date !== today && (
                      <IconButton label={`Copy ${MEAL_LABEL[g.meal]} to today`} onClick={() => copyMeal(g.items)}>
                        <Copy size={18} />
                      </IconButton>
                    )}
                  </div>
                </div>
                <Card className="p-1">
                  <ul>
                    {g.items.map((e) => (
                      <li key={e.id} className="flex items-center">
                        <button type="button" className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left" onClick={() => openSheet({ type: 'manualFood', date, entryId: e.id })}>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 font-medium">
                              <span className="truncate">{e.name}</span>
                              {e.source === 'ai' && <Sparkles size={14} className="shrink-0 text-accent-ink" aria-label="AI estimate" />}
                              {e.confidence < 0.5 && <span className="shrink-0 rounded-full bg-caution-soft px-1.5 text-[11px] font-bold text-caution">check</span>}
                            </span>
                            <span className="tabular block text-sm text-muted">
                              {e.quantity} {e.unit} · P {Math.round(e.proteinG)} · C {Math.round(e.carbsG)} · F {Math.round(e.fatG)}
                            </span>
                          </span>
                          <span className="tabular font-semibold">{Math.round(e.calories)}</span>
                        </button>
                        <IconButton label={`Delete ${e.name}`} onClick={() => removeWithUndo('foodEntries', e.id, e.name)}>
                          <Trash2 size={18} />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => navigate(`/food/new?date=${date}`)}>
            <Sparkles size={18} /> Describe food
          </Button>
          <Button variant="secondary" onClick={() => openSheet({ type: 'manualFood', date })}>
            <Plus size={18} /> Manual
          </Button>
        </div>
      </div>
    </div>
  );
}
