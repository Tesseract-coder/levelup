import { Timer } from 'lucide-react';
import { useEffect, useReducer, useRef } from 'react';
import { useLocation } from 'react-router';
import { useStrengthSettings } from '@/hooks/strength';
import { fmtSec } from '@/domain/strength/units';
import { restFinished, setRestAlertPrefs, useRestTimer } from './restTimer';

/** Floating rest countdown. Mounted once at the app root so it keeps counting on every screen. */
export function RestTimerPill() {
  const { endsAt, totalSec, label, adjust, skip } = useRestTimer();
  const settings = useStrengthSettings();
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const fired = useRef<number | null>(null);
  const location = useLocation();
  const onWorkout = location.pathname.startsWith('/workout/');

  useEffect(() => setRestAlertPrefs({ sound: settings.restSound, vibrate: settings.restVibrate, notify: settings.restNotify }), [settings.restSound, settings.restVibrate, settings.restNotify]);

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const left = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0;
  useEffect(() => {
    if (endsAt && left === 0 && fired.current !== endsAt) {
      fired.current = endsAt;
      // only alert if we're close to the actual end (not when reopening the app much later)
      if (Date.now() - endsAt < 5000) restFinished();
      skip();
    }
  }, [endsAt, left, skip]);

  if (!endsAt || left === 0) return null;
  const pct = totalSec ? 1 - left / totalSec : 0;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-[480px] justify-center px-4"
      style={{ bottom: `calc(env(safe-area-inset-bottom) + ${onWorkout ? 16 : 100}px)` }}
    >
      <div role="timer" aria-label={`Rest timer: ${fmtSec(left)} left${label ? ` before ${label}` : ''}`} className="pointer-events-auto relative flex w-full max-w-sm items-center gap-1 overflow-hidden rounded-full bg-ink p-1 text-canvas shadow-sheet">
        <span className="absolute inset-y-0 left-0 bg-accent/40 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct * 100}%` }} aria-hidden />
        <button type="button" onClick={() => adjust(-15)} aria-label="15 seconds less rest" className="relative grid h-12 w-14 place-items-center rounded-full text-sm font-bold">
          −15
        </button>
        <span className="relative flex flex-1 items-center justify-center gap-1.5">
          <Timer size={18} aria-hidden />
          <span className="tabular text-lg font-extrabold" aria-live="off">
            {fmtSec(left).replace(' s', 's')}
          </span>
        </span>
        <button type="button" onClick={() => adjust(15)} aria-label="15 seconds more rest" className="relative grid h-12 w-14 place-items-center rounded-full text-sm font-bold">
          +15
        </button>
        <button type="button" onClick={skip} className="relative h-12 rounded-full bg-canvas/15 px-4 text-sm font-bold">
          Skip
        </button>
      </div>
    </div>
  );
}
