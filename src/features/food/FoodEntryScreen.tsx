import clsx from 'clsx';
import { ArrowLeft, Bookmark, Check, ChevronDown, Info, Plus, Repeat, Search, Sparkles, Trash2 } from 'lucide-react';
import { VoiceButton } from '@/components/VoiceButton';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Card, Chip, EstimateBadge, IconButton, Input, Notice, ProgressBar } from '@/components/ui';
import { repo } from '@/db';
import type { FoodEntry, FoodSource, Meal, SavedFood } from '@/db/types';

type MealName = Meal;
import { useFood, useGoal, useSavedFoods, useToday } from '@/hooks/data';
import { newId } from '@/lib/id';
import { refresh } from '@/lib/queryClient';
import { haptic } from '@/lib/haptics';
import { useUI } from '@/stores/ui';
import { addDays, formatDay } from '@/domain/dates';
import { groupByMeal, guessMeal, MEAL_LABEL, MEAL_ORDER, sumMacros } from '@/domain/nutrition';
import { itemFromFood, parseFoodTextLocally, rescaleItem, searchFoods, type ParsedFoodItem } from '@/domain/localFoodParser';

type ReviewItem = ParsedFoodItem & { key: string; source: FoodSource };

const EXAMPLE =
  'Breakfast: 2 boiled eggs, 2 slices of brown bread with peanut butter, black coffee. Lunch: 2 rotis, 1 katori dal, mixed veg sabzi, curd. Snack: banana and a handful of almonds. Dinner: paneer bhurji and 1 roti.';

export default function FoodEntryScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = useToday();
  const date = params.get('date') ?? today;
  const [text, setText] = useState('');
  const [defaultMeal, setDefaultMeal] = useState<MealName | 'auto'>('auto');
  const [items, setItems] = useState<ReviewItem[] | null>(null);

  const meal: MealName = defaultMeal === 'auto' ? (date === today ? guessMeal() : 'other') : defaultMeal;

  // Parsed on the device against the built-in food database — instant and private.
  function breakDown() {
    if (text.trim().length < 2) return;
    const parsed = parseFoodTextLocally(text.trim().replace(/\s+/g, ' '), meal);
    setItems(parsed.map((i) => ({ ...i, key: newId(), source: 'offline' })));
  }

  function applySaved(s: SavedFood) {
    const m = (s.defaultMeal as MealName) ?? meal;
    const add = s.items.map((i) => ({ ...i, meal: m, confidence: 0.9, assumptions: `From ${s.type === 'meal' ? 'saved meal' : 'My foods'}: ${s.name}`, key: newId(), source: 'saved' as const }));
    setItems((cur) => [...(cur ?? []), ...add]);
    void repo.saveSaved({ ...s, useCount: s.useCount + 1, lastUsedAt: Date.now() });
  }

  if (items) {
    return <Review date={date} items={items} setItems={setItems} onBack={() => setItems(null)} defaultMeal={meal} />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2 px-2 pt-3">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft size={22} />
        </IconButton>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold">Log food</h1>
          <p className="text-sm text-muted">{formatDay(date, today)}</p>
        </div>
      </header>
      <div className="flex-1 space-y-4 px-4 pb-6 pt-3">
        <div>
          <label htmlFor="food-text" className="mb-2 block font-semibold">
            What did you eat?
          </label>
          <div className="relative">
            <textarea
              id="food-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder={'e.g. ' + EXAMPLE}
              className="w-full resize-none rounded-[var(--radius-card)] border border-line bg-surface p-4 pb-14 leading-relaxed shadow-card placeholder:text-muted/70 focus:border-accent focus:outline-none"
            />
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <VoiceButton onText={(t) => setText((cur) => (cur ? cur.trimEnd() + ' ' : '') + t)} />
              <span className="text-xs text-muted">Write it the way you'd say it</span>
            </div>
          </div>
          {!text && (
            <button type="button" className="mt-1 min-h-11 text-sm font-semibold text-accent-ink" onClick={() => setText(EXAMPLE)}>
              Try an example
            </button>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Unlabelled items go to</p>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" data-noswipe>
            {(['auto', ...MEAL_ORDER] as const).map((m) => (
              <Chip key={m} selected={defaultMeal === m} onClick={() => setDefaultMeal(m)} className="shrink-0">
                {m === 'auto' ? `Auto (${MEAL_LABEL[meal]})` : MEAL_LABEL[m]}
              </Chip>
            ))}
          </div>
        </div>
        <Button block size="lg" onClick={breakDown} disabled={text.trim().length < 2}>
          <Sparkles size={20} /> Break it down
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => setItems([])}>
            <Search size={18} /> Search foods
          </Button>
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => useUI.getState().openSheet({ type: 'manualFood', date, meal })}>
            <Plus size={18} /> Manual entry
          </Button>
        </div>
        <QuickPicks date={date} onPick={applySaved} onRepeat={(entries) => {
          setItems(entries.map((e) => ({ meal: (e.meal as MealName), name: e.name, quantity: e.quantity, unit: e.unit, gramsEst: e.gramsEst, calories: e.calories, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG, fiberG: e.fiberG, confidence: Math.max(0.8, e.confidence), assumptions: e.assumptions ?? '', key: newId(), source: 'saved' })));
        }} />
        <p className="text-xs text-muted">Estimates come from LevelUp's built-in food list and are calculated on this device. Nothing you type leaves your phone.</p>
      </div>
    </div>
  );
}

// ----------------------------------------------------- recent / saved picks

function QuickPicks({ date, onPick, onRepeat }: { date: string; onPick: (s: SavedFood) => void; onRepeat: (e: FoodEntry[]) => void }) {
  const { data: saved = [] } = useSavedFoods();
  const { data: recent = [] } = useFood(addDays(date, -14), addDays(date, -1));
  const recentMeals = useMemo(() => {
    // distinct (date, meal) groups, most recent first; dedupe identical item lists
    const groups = new Map<string, FoodEntry[]>();
    for (const e of recent) groups.set(`${e.date}|${e.meal}`, [...(groups.get(`${e.date}|${e.meal}`) ?? []), e]);
    const seen = new Set<string>();
    const out: { label: string; entries: FoodEntry[] }[] = [];
    for (const [k, entries] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
      const sig = entries.map((e) => e.name).sort().join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      const [d, m] = k.split('|');
      out.push({ label: `${MEAL_LABEL[m as Meal]} · ${formatDay(d, date)}`, entries });
      if (out.length >= 4) break;
    }
    return out;
  }, [recent, date]);
  const frequent = [...saved].sort((a, b) => b.useCount - a.useCount).slice(0, 8);

  if (!frequent.length && !recentMeals.length) return null;
  return (
    <div className="space-y-4">
      {frequent.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-bold"><Bookmark size={18} className="text-accent-ink" /> My foods & meals</h2>
          <div className="flex flex-wrap gap-2">
            {frequent.map((s) => (
              <Chip key={s.id} onClick={() => onPick(s)}>
                {s.name} <span className="tabular text-xs text-muted">{Math.round(s.items.reduce((t, i) => t + i.calories, 0))} kcal</span>
              </Chip>
            ))}
          </div>
        </section>
      )}
      {recentMeals.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-bold"><Repeat size={18} className="text-accent-ink" /> Recent meals</h2>
          <ul className="space-y-2">
            {recentMeals.map((r) => (
              <li key={r.label}>
                <button type="button" onClick={() => onRepeat(r.entries)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface px-4 py-2 text-left shadow-card">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{r.label}</span>
                    <span className="block truncate text-sm text-muted">{r.entries.map((e) => e.name).join(', ')}</span>
                  </span>
                  <span className="tabular shrink-0 whitespace-nowrap text-sm font-bold">{Math.round(r.entries.reduce((t, e) => t + e.calories, 0))} kcal</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ review

function Review({
  date,
  items,
  setItems,
  onBack,
  defaultMeal,
}: {
  date: string;
  items: ReviewItem[];
  setItems: (f: (cur: ReviewItem[] | null) => ReviewItem[] | null) => void;
  onBack: () => void;
  defaultMeal: MealName;
}) {
  const navigate = useNavigate();
  const today = useToday();
  const { data: goal } = useGoal();
  const { data: already = [] } = useFood(date);
  const [saveAsMeal, setSaveAsMeal] = useState(false);
  const [mealName, setMealName] = useState('');
  const [adding, setAdding] = useState(items.length === 0);
  const [saving, setSaving] = useState(false);

  const update = (key: string, patch: Partial<ReviewItem>) => setItems((cur) => cur!.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string) => setItems((cur) => cur!.filter((i) => i.key !== key));
  const totals = sumMacros(items);
  const dayTotals = sumMacros([...already, ...items]);
  const lowConf = items.filter((i) => i.confidence < 0.5).length;
  const unmatched = items.filter((i) => i.calories === 0 && i.confidence < 0.2).length;

  async function save() {
    setSaving(true);
    const now = Date.now();
    const entries: FoodEntry[] = items
      .filter((i) => i.name.trim())
      .map((i, n) => ({
        id: newId(),
        date,
        meal: i.meal,
        name: i.name.trim(),
        quantity: i.quantity,
        unit: i.unit,
        gramsEst: i.gramsEst,
        calories: Math.round(i.calories),
        proteinG: i.proteinG,
        carbsG: i.carbsG,
        fatG: i.fatG,
        fiberG: i.fiberG,
        confidence: i.confidence,
        assumptions: i.assumptions || undefined,
        source: i.source,
        createdAt: now + n,
      }));
    await repo.saveFood(entries);
    if (saveAsMeal && mealName.trim()) {
      const meals = new Set(items.map((i) => i.meal));
      await repo.saveSaved({
        id: newId(),
        type: items.length === 1 ? 'food' : 'meal',
        name: mealName.trim(),
        items: items.map(({ name, quantity, unit, gramsEst, calories, proteinG, carbsG, fatG, fiberG }) => ({ name, quantity, unit, gramsEst, calories, proteinG, carbsG, fatG, fiberG })),
        defaultMeal: meals.size === 1 ? [...meals][0] : undefined,
        useCount: 1,
        lastUsedAt: now,
        createdAt: now,
      });
    }
    haptic([10, 40, 10]);
    await refresh();
    useUI.getState().showSnack({ message: `${entries.length} item${entries.length === 1 ? '' : 's'} logged · ${totals.calories.toLocaleString()} kcal` });
    navigate(`/log?date=${date}`, { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2 px-2 pt-3">
        <IconButton label="Back to text" onClick={onBack}>
          <ArrowLeft size={22} />
        </IconButton>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold">Review</h1>
          <p className="text-sm text-muted">{formatDay(date, today)} · tap anything to adjust</p>
        </div>
      </header>
      <div className="flex-1 space-y-4 px-4 pb-4 pt-3">
        {items.length > 0 && (
          <Notice>
            <span className="font-semibold">Estimates.</span> Portions and recipes vary — check the numbers and adjust anything that looks off.
          </Notice>
        )}
        {unmatched > 0 && (
          <Notice tone="caution">
            {unmatched} item{unmatched === 1 ? ' isn’t' : 's aren’t'} in the food list yet — tap {unmatched === 1 ? 'it' : 'them'} to enter calories, or swap for a similar food.
          </Notice>
        )}
        {lowConf > unmatched && <p className="text-sm text-caution">{lowConf - unmatched} item{lowConf - unmatched === 1 ? '' : 's'} marked “check this”.</p>}

        {groupByMeal(items).map((g) => {
          const t = sumMacros(g.items);
          return (
            <section key={g.meal} aria-label={MEAL_LABEL[g.meal]}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="font-bold">{MEAL_LABEL[g.meal]}</h2>
                <span className="tabular text-sm text-muted">
                  {t.calories.toLocaleString()} kcal · P {t.proteinG} · C {t.carbsG} · F {t.fatG}
                </span>
              </div>
              <ul className="space-y-2">
                {g.items.map((i) => (
                  <ItemRow key={i.key} item={i} onChange={(p) => update(i.key, p)} onRemove={() => remove(i.key)} />
                ))}
              </ul>
            </section>
          );
        })}

        {adding ? (
          <AddItem
            meal={defaultMeal}
            onAdd={(it) => {
              setItems((cur) => [...(cur ?? []), { ...it, key: newId(), source: 'offline' }]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button variant="secondary" block onClick={() => setAdding(true)}>
            <Plus size={18} /> Add item
          </Button>
        )}

        {items.length > 0 && (
          <Card>
            <h2 className="mb-3 font-bold">Day total with these</h2>
            <TotalRow label="Calories" value={dayTotals.calories} target={goal?.calorieTarget} unit="kcal" color="var(--calories)" adding={totals.calories} />
            <TotalRow label="Protein" value={dayTotals.proteinG} target={goal?.proteinTarget} unit="g" color="var(--protein)" adding={totals.proteinG} />
            <TotalRow label="Carbs" value={dayTotals.carbsG} target={goal?.carbsTarget} unit="g" color="var(--carbs)" adding={totals.carbsG} />
            <TotalRow label="Fat" value={dayTotals.fatG} target={goal?.fatTarget} unit="g" color="var(--fat)" adding={totals.fatG} />
            <p className="mt-2 text-xs text-muted">All values are estimates.</p>
          </Card>
        )}

        {items.length > 0 && (
          <Card>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={saveAsMeal} onChange={(e) => setSaveAsMeal(e.target.checked)} className="h-6 w-6 accent-[var(--accent)]" />
              <span className="font-medium">Save as a meal for one-tap logging</span>
            </label>
            {saveAsMeal && <Input className="mt-2" aria-label="Meal name" placeholder="e.g. My usual breakfast" value={mealName} maxLength={40} onChange={(e) => setMealName(e.target.value)} />}
          </Card>
        )}
      </div>
      <div className="sticky bottom-0 border-t border-line bg-canvas px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <Button block size="lg" onClick={save} disabled={saving || items.length === 0 || (saveAsMeal && !mealName.trim())}>
          <Check size={20} /> Save {items.length} item{items.length === 1 ? '' : 's'} · {totals.calories.toLocaleString()} kcal
        </Button>
      </div>
    </div>
  );
}

/** Macro value in ink with a coloured dot — colour carries identity, text stays readable. */
function Macro({ c, l, v }: { c: string; l: string; v: number }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 first:ml-0">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} aria-hidden />
      {l} {Math.round(v)}
    </span>
  );
}

function TotalRow({ label, value, target, unit, color, adding }: { label: string; value: number; target?: number; unit: string; color: string; adding: number }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular text-muted">
          {value.toLocaleString()}
          {target ? ` / ${target.toLocaleString()}` : ''} {unit}
          <span className="ml-1 text-xs">(+{Math.round(adding)})</span>
        </span>
      </div>
      {target ? <ProgressBar value={value / target} color={color} label={`${label} ${value} of ${target} ${unit}`} /> : null}
    </div>
  );
}

function ItemRow({ item, onChange, onRemove }: { item: ReviewItem; onChange: (p: Partial<ReviewItem>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [swap, setSwap] = useState(false);
  const low = item.confidence < 0.5;
  const step = item.quantity >= 10 ? 10 : item.quantity < 1 ? 0.25 : 0.5;
  return (
    <li className={clsx('rounded-2xl bg-surface p-3 shadow-card', low && 'ring-2 ring-caution/60')}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{item.name}</span>
            {low && <span className="rounded-full bg-caution-soft px-2 py-0.5 text-xs font-bold text-caution">check this</span>}
          </span>
          <span className="tabular block text-sm text-muted">
            {item.quantity} {item.unit}
            {item.gramsEst ? ` · ~${item.gramsEst} g` : ''}
          </span>
        </button>
        <div className="text-right">
          <span className="tabular block font-bold">{Math.round(item.calories)} kcal</span>
          <span className="tabular block text-xs text-muted">
            <Macro c="var(--protein)" l="P" v={item.proteinG} /> <Macro c="var(--carbs)" l="C" v={item.carbsG} /> <Macro c="var(--fat)" l="F" v={item.fatG} />
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <div className="flex items-center rounded-xl bg-surface-2" role="group" aria-label={`Quantity of ${item.name}`}>
          <button type="button" aria-label="Less" className="grid h-11 w-11 place-items-center text-lg font-bold" onClick={() => item.quantity - step > 0 && onChange(rescaleItem(item, Math.round((item.quantity - step) * 100) / 100))}>
            −
          </button>
          <span className="tabular w-10 text-center font-semibold">{item.quantity}</span>
          <button type="button" aria-label="More" className="grid h-11 w-11 place-items-center text-lg font-bold" onClick={() => onChange(rescaleItem(item, Math.round((item.quantity + step) * 100) / 100))}>
            +
          </button>
        </div>
        <EstimateBadge note={item.assumptions || 'Typical portion assumed.'} />
        <span className="flex-1" />
        <IconButton label={`Edit ${item.name}`} onClick={() => setOpen((o) => !o)}>
          <ChevronDown size={20} className={clsx('transition-transform', open && 'rotate-180')} />
        </IconButton>
        <IconButton label={`Delete ${item.name}`} onClick={onRemove}>
          <Trash2 size={18} />
        </IconButton>
      </div>
      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {item.assumptions && (
            <p className="flex gap-2 text-sm text-muted">
              <Info size={16} className="mt-0.5 shrink-0" /> {item.assumptions}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Input label="Name" value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Meal</span>
              <select value={item.meal} onChange={(e) => onChange({ meal: e.target.value as Meal })} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3">
                {MEAL_ORDER.map((m) => (
                  <option key={m} value={m}>
                    {MEAL_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ['calories', 'kcal'],
                ['proteinG', 'Protein'],
                ['carbsG', 'Carbs'],
                ['fatG', 'Fat'],
              ] as const
            ).map(([k, l]) => (
              <Input key={k} label={l} inputMode="decimal" value={String(Math.round(item[k] * 10) / 10)} onChange={(e) => onChange({ [k]: parseFloat(e.target.value) || 0, confidence: Math.max(item.confidence, 0.8) })} />
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSwap((s) => !s)}>
            <Repeat size={16} /> Swap for a different food
          </Button>
          {swap && (
            <FoodSearch
              onPick={(f) => {
                const next = itemFromFood(f, item.meal, 1);
                onChange({ ...next });
                setSwap(false);
              }}
            />
          )}
        </div>
      )}
    </li>
  );
}

function FoodSearch({ onPick, autoFocus }: { onPick: (f: ReturnType<typeof searchFoods>[number]) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const results = searchFoods(q);
  return (
    <div>
      <Input aria-label="Search foods" placeholder="Search e.g. idli, oats, chicken" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} />
      {results.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-line">
          {results.map((f) => (
            <li key={f.id}>
              <button type="button" className="flex min-h-12 w-full items-center justify-between border-b border-line px-3 text-left last:border-0" onClick={() => onPick(f)}>
                <span>{f.name}</span>
                <span className="tabular text-xs text-muted">
                  {Math.round((f.per100[0] * (f.units[f.defaultUnit] ?? 100)) / 100)} kcal / {f.defaultUnit === 'g' ? '100 g' : `1 ${f.defaultUnit}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.length > 1 && results.length === 0 && <p className="mt-2 text-sm text-muted">Not in the offline list — use Manual entry instead.</p>}
    </div>
  );
}

function AddItem({ meal, onAdd, onCancel }: { meal: MealName; onAdd: (i: ParsedFoodItem) => void; onCancel: () => void }) {
  const [m, setM] = useState<MealName>(meal);
  const [manual, setManual] = useState(false);
  const [f, setF] = useState({ name: '', calories: '', proteinG: '', carbsG: '', fatG: '' });
  useEffect(() => setM(meal), [meal]);
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Add an item</h2>
        <select aria-label="Meal" value={m} onChange={(e) => setM(e.target.value as MealName)} className="min-h-11 rounded-xl border border-line bg-surface px-2 text-sm">
          {MEAL_ORDER.map((x) => (
            <option key={x} value={x}>
              {MEAL_LABEL[x]}
            </option>
          ))}
        </select>
      </div>
      {!manual ? (
        <>
          <FoodSearch autoFocus onPick={(food) => onAdd(itemFromFood(food, m, 1))} />
          <Button variant="ghost" size="sm" onClick={() => setManual(true)}>
            Enter calories & macros myself
          </Button>
        </>
      ) : (
        <>
          <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div className="grid grid-cols-4 gap-2">
            {(['calories', 'proteinG', 'carbsG', 'fatG'] as const).map((k) => (
              <Input key={k} label={k === 'calories' ? 'kcal' : k.replace('G', '')} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            ))}
          </div>
          <Button
            block
            disabled={!f.name.trim() || !f.calories}
            onClick={() =>
              onAdd({ meal: m, name: f.name.trim(), quantity: 1, unit: 'serving', gramsEst: 0, calories: Math.round(+f.calories || 0), proteinG: +f.proteinG || 0, carbsG: +f.carbsG || 0, fatG: +f.fatG || 0, confidence: 0.9, assumptions: 'Entered manually' })
            }
          >
            Add
          </Button>
        </>
      )}
      <Button variant="secondary" size="sm" block onClick={onCancel}>
        Cancel
      </Button>
    </Card>
  );
}

