import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Card, Chip, IconButton, Input, Notice, PageHeader, Skeleton, Toggle } from '@/components/ui';
import type { DayType, SplitPlan } from '@/db/types';
import { useSettings } from '@/hooks/data';
import { useRoutines, useSplitPlans } from '@/hooks/strength';
import { DAY_TYPE_LABELS, DAY_TYPE_ROWS } from '@/domain/strength/dayTypes';
import { WEEKDAY_NAMES } from '@/domain/dates';
import { newId } from '@/lib/id';
import { deleteSplit, saveSplit } from './actions';

const DAY_TYPES = [...new Set(DAY_TYPE_ROWS.flat())] as DayType[];

export default function SplitPlannerScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const settings = useSettings();
  const { data: plans } = useSplitPlans();
  const { data: routines = [] } = useRoutines();
  const [plan, setPlan] = useState<SplitPlan | null>(null);
  const deleted = useRef(false);

  useEffect(() => {
    if (!plans || plan) return;
    const pick = plans.find((p) => p.id === params.get('plan')) ?? plans.find((p) => p.active) ?? plans[0];
    setPlan(pick ?? { id: newId(), name: 'My split', days: {}, active: false, createdAt: Date.now() });
  }, [plans, plan, params]);
  useEffect(() => {
    if (!plan || deleted.current) return;
    const t = setTimeout(() => void saveSplit(plan), 300);
    return () => clearTimeout(t);
  }, [plan]);

  if (!plan || !plans) return <Skeleton className="m-4 h-64" />;
  const order = settings.weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const setDay = (wd: number, value: string) => {
    const days = { ...plan.days };
    if (value === 'rest') delete days[wd];
    else if (value.startsWith('r:')) {
      const r = routines.find((x) => x.id === value.slice(2))!;
      days[wd] = { routineId: r.id, dayTypes: r.dayTypes, label: r.name };
    } else days[wd] = { dayTypes: [value as DayType], label: DAY_TYPE_LABELS[value as DayType] };
    setPlan({ ...plan, days });
  };
  const count = Object.keys(plan.days).length;

  return (
    <div>
      <PageHeader title="Weekly split" left={<IconButton label="Back" onClick={() => navigate(-1)}><ArrowLeft size={22} /></IconButton>} />
      <div className="space-y-4 px-4 pb-6">
        {plans.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Plans">
            {plans.map((p) => (
              <Chip key={p.id} selected={p.id === plan.id} onClick={() => setPlan(p)}>
                {p.name}
                {p.active ? ' ✓' : ''}
              </Chip>
            ))}
          </div>
        )}
        <Input label="Plan name" value={plan.name} maxLength={40} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
        <Card className="space-y-1 p-2">
          {order.map((wd) => {
            const d = plan.days[wd];
            const value = d ? (d.routineId ? `r:${d.routineId}` : d.dayTypes[0]) : 'rest';
            return (
              <label key={wd} className="flex min-h-12 items-center gap-3 px-2">
                <span className="w-12 font-semibold">{WEEKDAY_NAMES[wd]}</span>
                <select value={value} onChange={(e) => setDay(wd, e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2" aria-label={`${WEEKDAY_NAMES[wd]} plan`}>
                  <option value="rest">Rest</option>
                  {routines.length > 0 && (
                    <optgroup label="Routines">
                      {routines.map((r) => (
                        <option key={r.id} value={`r:${r.id}`}>{r.name}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Day types">
                    {DAY_TYPES.map((t) => (
                      <option key={t} value={t}>{DAY_TYPE_LABELS[t]}</option>
                    ))}
                  </optgroup>
                </select>
              </label>
            );
          })}
        </Card>
        <Card>
          <Toggle checked={plan.active} onChange={(active) => setPlan({ ...plan, active })} label="Use this split" description={`${count} training day${count === 1 ? '' : 's'} a week. Today shows what's planned, and missed planned days count in summaries (grace days apply).`} />
        </Card>
        {plan.active && count === 0 && <Notice tone="caution">Pick at least one training day.</Notice>}
        {plans.some((p) => p.id === plan.id) && (
          <Button
            block
            variant="ghost"
            className="text-danger"
            onClick={async () => {
              deleted.current = true;
              await deleteSplit(plan.id);
              navigate(-1);
            }}
          >
            <Trash2 size={18} /> Delete plan
          </Button>
        )}
      </div>
    </div>
  );
}
