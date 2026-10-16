import clsx from 'clsx';
import { ArrowLeft, Check } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, IconButton, Skeleton } from '@/components/ui';
import type { NextFocus } from '@/db/types';
import { useSettings, useToday } from '@/hooks/data';
import { addDays, formatRange, startOfWeek } from '@/domain/dates';
import { useUI } from '@/stores/ui';
import { acceptFocus, useSummary } from './SummaryScreen';

/** Weekly ritual: look back at last week, then choose exactly one focus for the week ahead. */
export default function ReviewScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const settings = useSettings();
  // Review the most recently completed week (or the current one late on the summary day).
  const thisWeek = startOfWeek(today, settings.weekStartsOn);
  const reviewDate = new Date().getDay() === settings.weeklySummaryDay ? today : addDays(thisWeek, -1);
  const { data: s } = useSummary('week', reviewDate);
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState(0);

  if (!s) return <div className="space-y-3 p-4"><Skeleton className="h-10 w-40" /><Skeleton className="h-64" /></div>;

  const options: NextFocus[] = [s.nextFocus, ...s.improvements.filter((i) => i.text !== s.nextFocus.text).map((i) => ({ text: i.text }))].slice(0, 3);
  const steps = [
    { title: 'Look back', body: <List title="✅ What went great" items={s.wins} /> },
    { title: 'Be honest, kindly', body: <List title="⚠️ What was missed" items={s.misses} empty="Nothing notable missed." /> },
    {
      title: 'Pick one focus',
      body: (
        <div role="radiogroup" aria-label="Focus for next week" className="space-y-2">
          {options.map((o, i) => (
            <button key={i} type="button" role="radio" aria-checked={pick === i} onClick={() => setPick(i)} className={clsx('flex min-h-16 w-full gap-3 rounded-2xl border-2 bg-surface p-4 text-left', pick === i ? 'border-accent' : 'border-transparent shadow-card')}>
              <span className={clsx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', pick === i ? 'border-accent bg-accent text-on-accent' : 'border-line')}>{pick === i && <Check size={14} />}</span>
              <span>
                <span className="block font-semibold">{o.text}</span>
                {o.habit && <span className="block text-sm text-muted">Adds the habit “{o.habit.name}”</span>}
              </span>
            </button>
          ))}
          <p className="pt-1 text-sm text-muted">Just one. Small and kept beats big and dropped.</p>
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2 px-2 pt-3">
        <IconButton label="Back" onClick={() => (step ? setStep(step - 1) : navigate(-1))}>
          <ArrowLeft size={22} />
        </IconButton>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold">Weekly review</h1>
          <p className="text-sm text-muted">{formatRange(s.rangeStart, s.rangeEnd)} · score {s.score}</p>
        </div>
      </header>
      <div className="flex-1 px-4 pt-4" key={step}>
        <p className="text-sm font-semibold text-muted">
          Step {step + 1} of {steps.length}
        </p>
        <h2 className="animate-rise mb-4 text-2xl font-extrabold">{steps[step].title}</h2>
        <div className="animate-rise">{steps[step].body}</div>
      </div>
      <div className="px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        {step < steps.length - 1 ? (
          <Button block size="lg" onClick={() => setStep(step + 1)}>
            Next
          </Button>
        ) : (
          <Button
            block
            size="lg"
            onClick={async () => {
              const chosen = options[pick];
              await acceptFocus({ ...s, nextFocus: chosen });
              useUI.getState().showSnack({ message: chosen.habit ? `Focus set — “${chosen.habit.name}” added` : 'Focus set for the week' });
              navigate('/', { replace: true });
            }}
          >
            Set my focus
          </Button>
        )}
      </div>
    </div>
  );
}

function List({ title, items, empty }: { title: string; items: { text: string }[]; empty?: string }) {
  return (
    <Card>
      <h3 className="mb-2 font-bold">{title}</h3>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((i, n) => (
            <li key={n} className="text-[15px] leading-snug">
              {i.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">{empty}</p>
      )}
    </Card>
  );
}

