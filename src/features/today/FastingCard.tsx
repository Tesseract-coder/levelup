import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Ring } from '@/components/Ring';
import { Button, Card } from '@/components/ui';
import { repo } from '@/db';
import { useSettings } from '@/hooks/data';
import { refresh } from '@/lib/queryClient';
import { useUI } from '@/stores/ui';

export async function startFast(targetHours: number) {
  await repo.updateSettings({ fasting: { startedAt: Date.now(), targetHours } });
  await refresh();
}

/** Intermittent fasting timer (v1.5). Shown on Today while a fast is running. */
export function FastingCard() {
  const s = useSettings();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!s.fasting) return null;
  const elapsedH = (now - s.fasting.startedAt) / 3600_000;
  const pct = elapsedH / s.fasting.targetHours;
  const h = Math.floor(elapsedH);
  const m = Math.floor((elapsedH - h) * 60);
  const done = pct >= 1;
  return (
    <Card className="flex items-center gap-4">
      <Ring value={pct} color={done ? 'var(--good)' : 'var(--accent)'} size={64} stroke={7} label={`Fasting ${h} hours ${m} minutes of ${s.fasting.targetHours}`}>
        <Timer size={20} className="text-accent-ink" aria-hidden />
      </Ring>
      <div className="flex-1">
        <p className="font-semibold">{done ? 'Fast complete 🎉' : 'Fasting'}</p>
        <p className="tabular text-sm text-muted">
          {h} h {m} min of {s.fasting.targetHours} h
        </p>
      </div>
      <Button
        size="sm"
        variant={done ? 'primary' : 'secondary'}
        onClick={async () => {
          await repo.updateSettings({ fasting: null });
          await refresh();
          useUI.getState().showSnack({ message: `Fast ended at ${h} h ${m} min` });
        }}
      >
        End
      </Button>
    </Card>
  );
}
