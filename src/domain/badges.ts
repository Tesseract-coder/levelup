import type { RangeData } from '@/db/repository';
import { addDays } from './dates';
import { activeFrom, computeStreak, doneDatesFor, indexLogs } from './habits';

export interface Badge {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
}

/** Quiet milestones — shown in Profile, never as pop-ups or pressure. */
export function computeBadges(data: RangeData, today: string, gracePerWeek: number): Badge[] {
  const idx = indexLogs(data.logs, data.sleep);
  const workouts = data.logs.filter((l) => data.activities.find((a) => a.id === l.activityId)?.kind === 'workout');
  let bestStreak = 0;
  for (const a of data.activities.filter((x) => x.kind === 'habit')) {
    const s = computeStreak(a, doneDatesFor(a, idx, addDays(today, -400), today), activeFrom(a, idx), today, gracePerWeek);
    if (s.unit === 'days') bestStreak = Math.max(bestStreak, s.best);
  }
  // PR: any exercise whose top set increased vs an earlier session
  const best = new Map<string, number>();
  let pr = false;
  for (const l of [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const e of l.exercises ?? []) {
      const k = e.name.toLowerCase();
      const top = Math.max(0, ...e.sets.map((s) => s.weightKg));
      if (best.has(k) && top > best.get(k)!) pr = true;
      best.set(k, Math.max(best.get(k) ?? 0, top));
    }
  }
  const foodDays = new Set(data.food.map((f) => f.date)).size;
  return [
    { id: 'first-log', title: 'First step', detail: 'Logged your first entry', earned: data.logs.length + data.food.length > 0 },
    { id: 'w10', title: '10 workouts', detail: `${Math.min(workouts.length, 10)}/10 sessions logged`, earned: workouts.length >= 10 },
    { id: 'w50', title: '50 workouts', detail: `${Math.min(workouts.length, 50)}/50 sessions logged`, earned: workouts.length >= 50 },
    { id: 's7', title: '7-day streak', detail: `Best habit streak: ${bestStreak} days`, earned: bestStreak >= 7 },
    { id: 's30', title: '30-day streak', detail: `Best habit streak: ${bestStreak} days`, earned: bestStreak >= 30 },
    { id: 'pr', title: 'First PR', detail: 'Lifted more than ever before', earned: pr },
    { id: 'food30', title: 'Mindful month', detail: `${Math.min(foodDays, 30)}/30 days with food logged`, earned: foodDays >= 30 },
  ];
}
