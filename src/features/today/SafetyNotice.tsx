import { HeartHandshake } from 'lucide-react';
import { useState } from 'react';
import { Notice } from '@/components/ui';
import { useFood, useToday } from '@/hooks/data';
import { addDays } from '@/domain/dates';
import { showLowIntakeSupport } from '@/domain/safety';

/** Gentle, non-diagnostic support message when several recent days show very low logged intake. */
export function SafetyNotice() {
  const today = useToday();
  const { data: food = [] } = useFood(addDays(today, -7), addDays(today, -1));
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('levelup-safety-dismissed') === today;
    } catch {
      return false;
    }
  });
  if (hidden || !showLowIntakeSupport(food, today)) return null;
  return (
    <Notice tone="caution" icon={<HeartHandshake size={18} />}>
      <p className="font-semibold">Checking in with you</p>
      <p className="mt-1">
        A few recent days show very little food logged. If that reflects how you've been eating, your body might need more fuel than that — and
        if eating has been feeling stressful, talking to a doctor, dietitian or someone you trust can really help. You don't have to figure it out alone.
      </p>
      <button
        type="button"
        className="mt-2 min-h-11 font-semibold text-accent-ink"
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem('levelup-safety-dismissed', today);
          } catch {
            /* ignore */
          }
        }}
      >
        Thanks, hide for today
      </button>
    </Notice>
  );
}
