import { useEffect } from 'react';
import type { Settings } from '@/db/types';
import { hmToMin, toKey } from '@/domain/dates';

/**
 * Local reminders. Browsers can't schedule notifications for an arbitrary future time without a push
 * server, so we use two best-effort paths:
 *  1. While the app is open (or in a background tab), a 30-second ticker fires due reminders.
 *  2. Installed PWAs on Chromium can use Periodic Background Sync; the service worker
 *     (`public/reminders-sw.js`) reads the mirrored config from IndexedDB and fires due reminders.
 */

export const REMINDER_TEXT: Record<'meals' | 'workout' | 'evening', { title: string; body: string; url: string }> = {
  meals: { title: 'Time to log your meal', body: 'Type what you ate in one line — it takes a few seconds.', url: '/?quick=food' },
  workout: { title: 'Planned movement today?', body: 'Even a short session counts. Log it when you are done.', url: '/?quick=workout' },
  evening: { title: 'Log your day', body: 'Check off today’s habits and see your daily summary.', url: '/' },
};

const WINDOW_MIN = 45;

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

async function show(kind: keyof typeof REMINDER_TEXT) {
  const t = REMINDER_TEXT[kind];
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(t.title, { body: t.body, icon: '/icons/icon-192.png', badge: '/icons/favicon-64.png', tag: `levelup-${kind}`, data: { url: t.url } });
    else new Notification(t.title, { body: t.body, icon: '/icons/icon-192.png', tag: `levelup-${kind}` });
  } catch {
    /* notifications unavailable */
  }
}

function firedKey(kind: string, day: string) {
  return `levelup-reminder-${kind}-${day}`;
}

export function checkDueReminders(reminders: Settings['reminders'], now = new Date()) {
  if (!reminders.enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const day = toKey(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const kind of ['meals', 'workout', 'evening'] as const) {
    const at = reminders[kind];
    if (!at) continue;
    const due = hmToMin(at);
    if (mins < due || mins > due + WINDOW_MIN) continue;
    try {
      if (localStorage.getItem(firedKey(kind, day))) continue;
      localStorage.setItem(firedKey(kind, day), '1');
    } catch {
      /* storage blocked: still fire once per session */
    }
    void show(kind);
  }
}

/** Mirror reminder config where the service worker can read it (raw IndexedDB, no Dexie in the SW). */
function mirrorToSW(reminders: Settings['reminders']) {
  try {
    const req = indexedDB.open('levelup-sw', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ reminders, text: REMINDER_TEXT, windowMin: WINDOW_MIN }, 'config');
    };
  } catch {
    /* ignore */
  }
}

async function registerPeriodicSync(enabled: boolean) {
  try {
    const reg = (await navigator.serviceWorker?.getRegistration()) as (ServiceWorkerRegistration & { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void>; unregister(tag: string): Promise<void> } }) | undefined;
    if (!reg?.periodicSync) return;
    if (enabled) await reg.periodicSync.register('levelup-reminders', { minInterval: 30 * 60_000 });
    else await reg.periodicSync.unregister('levelup-reminders');
  } catch {
    /* not supported or not permitted */
  }
}

export function useReminderScheduler(settings: Settings | undefined) {
  const reminders = settings?.reminders;
  useEffect(() => {
    if (!reminders) return;
    mirrorToSW(reminders);
    void registerPeriodicSync(reminders.enabled);
    if (!reminders.enabled) return;
    checkDueReminders(reminders);
    const t = setInterval(() => checkDueReminders(reminders), 30_000);
    return () => clearInterval(t);
  }, [reminders]);
}
