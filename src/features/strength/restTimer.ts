import { create } from 'zustand';
import { haptic } from '@/lib/haptics';
import { beep } from '@/lib/sound';

/**
 * Rest timer. Stores an absolute end time (not a countdown), so it stays correct
 * when the app is backgrounded or reloaded. Mirrored to localStorage.
 */
interface RestState {
  endsAt: number | null;
  totalSec: number;
  label?: string;
  start: (sec: number, label?: string) => void;
  adjust: (deltaSec: number) => void;
  skip: () => void;
}

const KEY = 'levelup.restTimer';

function load(): Pick<RestState, 'endsAt' | 'totalSec' | 'label'> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v.endsAt === 'number' && v.endsAt > Date.now()) return v;
  } catch {
    /* storage unavailable */
  }
  return { endsAt: null, totalSec: 0 };
}
function save(v: Pick<RestState, 'endsAt' | 'totalSec' | 'label'>) {
  try {
    if (v.endsAt) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

export const useRestTimer = create<RestState>((set, get) => ({
  ...load(),
  start: (sec, label) => {
    const v = { endsAt: Date.now() + sec * 1000, totalSec: sec, label };
    save(v);
    set(v);
    scheduleNotification(sec, label);
  },
  adjust: (d) => {
    const { endsAt, totalSec, label } = get();
    if (!endsAt) return;
    const next = Math.max(Date.now() + 1000, endsAt + d * 1000);
    const v = { endsAt: next, totalSec: Math.max(1, totalSec + d), label };
    save(v);
    set(v);
    scheduleNotification((next - Date.now()) / 1000, label);
  },
  skip: () => {
    save({ endsAt: null, totalSec: 0 });
    set({ endsAt: null, totalSec: 0, label: undefined });
    cancelNotification();
  },
}));

export interface RestAlertPrefs {
  sound: boolean;
  vibrate: boolean;
  notify: boolean;
}
let prefs: RestAlertPrefs = { sound: true, vibrate: true, notify: false };
export const setRestAlertPrefs = (p: RestAlertPrefs) => {
  prefs = p;
};

/** Called once when the countdown reaches zero while the app is open. */
export function restFinished() {
  if (prefs.vibrate) haptic([200, 100, 200]);
  if (prefs.sound) beep(2);
}

// While the page is hidden, timers are throttled; a notification is the best we can do.
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
function cancelNotification() {
  clearTimeout(notifyTimer);
}
function scheduleNotification(sec: number, label?: string) {
  cancelNotification();
  if (!prefs.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  notifyTimer = setTimeout(async () => {
    if (document.visibilityState === 'visible') return; // in-app alert handles it
    try {
      const reg = await navigator.serviceWorker?.ready;
      const body = label ? `Next set: ${label}` : 'Time for your next set';
      if (reg) await reg.showNotification('Rest over', { body, tag: 'rest-timer', icon: '/icons/icon-192.png' });
      else new Notification('Rest over', { body, tag: 'rest-timer' });
    } catch {
      /* not allowed */
    }
  }, sec * 1000);
}
