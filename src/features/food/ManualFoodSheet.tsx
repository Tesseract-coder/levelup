import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { useCloseSheet } from '@/components/sheetHistory';
import { Button, Input, Toggle } from '@/components/ui';
import { db, repo } from '@/db';
import type { FoodEntry, Meal } from '@/db/types';
import { removeWithUndo } from '@/hooks/data';
import { MEAL_LABEL, MEAL_ORDER, guessMeal } from '@/domain/nutrition';
import { rescaleItem } from '@/domain/localFoodParser';
import { newId } from '@/lib/id';
import { refresh } from '@/lib/queryClient';

/** Quick manual entry (name + calories + macros) and editing of any past food entry. */
export default function ManualFoodSheet({ date, meal, entryId }: { date: string; meal?: string; entryId?: string }) {
  const close = useCloseSheet();
  const { data: existing } = useQuery({ queryKey: ['foodEntry', entryId], enabled: !!entryId, queryFn: async () => (await db.foodEntries.get(entryId!)) ?? null });
  const [f, setF] = useState({ name: '', quantity: '1', unit: 'serving', calories: '', proteinG: '', carbsG: '', fatG: '', meal: (meal as Meal) ?? guessMeal() });
  const [base, setBase] = useState<FoodEntry | null>(null);
  const [saveToMine, setSaveToMine] = useState(false);

  useEffect(() => {
    if (existing && !base) {
      setBase(existing);
      setF({ name: existing.name, quantity: String(existing.quantity), unit: existing.unit, calories: String(Math.round(existing.calories)), proteinG: String(existing.proteinG), carbsG: String(existing.carbsG), fatG: String(existing.fatG), meal: existing.meal });
    }
  }, [existing, base]);

  // Changing quantity on an existing entry rescales its macros proportionally.
  const onQuantity = (v: string) => {
    const q = parseFloat(v);
    if (base && q > 0 && f.calories) {
      const cur = { quantity: parseFloat(f.quantity) || base.quantity, gramsEst: base.gramsEst, calories: +f.calories, proteinG: +f.proteinG || 0, carbsG: +f.carbsG || 0, fatG: +f.fatG || 0 };
      const r = rescaleItem(cur, q);
      setF({ ...f, quantity: v, calories: String(r.calories), proteinG: String(r.proteinG), carbsG: String(r.carbsG), fatG: String(r.fatG) });
    } else setF({ ...f, quantity: v });
  };

  const valid = f.name.trim() && f.calories !== '' && Number(f.calories) >= 0 && Number(f.calories) < 5000;

  async function save() {
    const entry: FoodEntry = {
      id: existing?.id ?? newId(),
      date: existing?.date ?? date,
      meal: f.meal,
      name: f.name.trim(),
      quantity: parseFloat(f.quantity) || 1,
      unit: f.unit.trim() || 'serving',
      gramsEst: existing?.gramsEst ?? 0,
      calories: Math.round(Number(f.calories)),
      proteinG: Math.round((+f.proteinG || 0) * 10) / 10,
      carbsG: Math.round((+f.carbsG || 0) * 10) / 10,
      fatG: Math.round((+f.fatG || 0) * 10) / 10,
      fiberG: existing?.fiberG,
      confidence: existing ? Math.max(existing.confidence, 0.8) : 1,
      assumptions: existing?.assumptions,
      source: existing?.source ?? 'manual',
      createdAt: existing?.createdAt ?? Date.now(),
    };
    await repo.saveFood([entry]);
    if (saveToMine) {
      const { id: _i, date: _d, meal: _m, confidence: _c, assumptions: _a, source: _s, createdAt: _t, ...item } = entry;
      await repo.saveSaved({ id: newId(), type: 'food', name: entry.name, items: [item], useCount: 1, lastUsedAt: Date.now(), createdAt: Date.now() });
    }
    await refresh();
    close();
  }

  return (
    <Sheet
      title={existing ? 'Edit food' : 'Add food manually'}
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button variant="danger" aria-label="Delete entry" onClick={async () => { await removeWithUndo('foodEntries', existing.id, existing.name); close(); }}>
              <Trash2 size={18} />
            </Button>
          )}
          <Button block className="flex-1" disabled={!valid} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="Food" value={f.name} maxLength={80} placeholder="e.g. Homemade poha" onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Quantity" inputMode="decimal" value={f.quantity} onChange={(e) => onQuantity(e.target.value)} />
          <Input label="Unit" value={f.unit} maxLength={24} onChange={(e) => setF({ ...f, unit: e.target.value })} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Input label="kcal" inputMode="numeric" value={f.calories} onChange={(e) => setF({ ...f, calories: e.target.value })} />
          <Input label="Protein" inputMode="decimal" suffix="g" value={f.proteinG} onChange={(e) => setF({ ...f, proteinG: e.target.value })} />
          <Input label="Carbs" inputMode="decimal" suffix="g" value={f.carbsG} onChange={(e) => setF({ ...f, carbsG: e.target.value })} />
          <Input label="Fat" inputMode="decimal" suffix="g" value={f.fatG} onChange={(e) => setF({ ...f, fatG: e.target.value })} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Meal</span>
          <select value={f.meal} onChange={(e) => setF({ ...f, meal: e.target.value as Meal })} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3">
            {MEAL_ORDER.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        {!existing && <Toggle checked={saveToMine} onChange={setSaveToMine} label="Save to My foods" description="Log it again with one tap" />}
        {existing?.assumptions && <p className="text-sm text-muted">Original estimate: {existing.assumptions}</p>}
      </div>
    </Sheet>
  );
}
