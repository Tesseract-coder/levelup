import { repo } from '@/db';
import type { ActivityDef, ActivityLog, DateKey, Intensity, StrengthExercise } from '@/db/types';
import { newId } from '@/lib/id';
import { refresh } from '@/lib/queryClient';
import { haptic } from '@/lib/haptics';
import { useUI } from '@/stores/ui';
import { caloriesBurned } from '@/domain/presets';
import { sleepDuration } from '@/domain/dates';

/** One-tap toggle for check habits (and "yes, avoided" for avoid habits). Returns the new done state. */
export async function toggleCheck(def: ActivityDef, date: DateKey): Promise<boolean> {
  const logs = await repo.logsInRange(date, date, def.id);
  if (logs.length) {
    for (const l of logs) await repo.remove('activityLogs', l.id);
    await refresh();
    const restore = logs;
    useUI.getState().showSnack({
      message: `${def.name} unchecked`,
      actionLabel: 'Undo',
      onAction: async () => {
        for (const l of restore) await repo.restore('activityLogs', l);
        await refresh();
      },
    });
    return false;
  }
  await repo.saveLog({ id: newId(), activityId: def.id, date, value: 1, createdAt: Date.now() });
  haptic(15);
  await refresh();
  return true;
}

/** Avoid habits: explicit yes (avoided) / no (slipped). Replaces the day's answer. */
export async function setAvoidAnswer(def: ActivityDef, date: DateKey, avoided: boolean) {
  const logs = await repo.logsInRange(date, date, def.id);
  for (const l of logs) await repo.remove('activityLogs', l.id);
  await repo.saveLog({ id: newId(), activityId: def.id, date, value: avoided ? 1 : 0, createdAt: Date.now() });
  if (avoided) haptic(15);
  await refresh();
}

/** Numeric/count/duration habits. `mode: 'add'` appends (water), `'set'` replaces the day's value (steps). */
export async function logValue(def: ActivityDef, date: DateKey, value: number, mode: 'add' | 'set' = def.aggregate === 'last' ? 'set' : 'add') {
  if (mode === 'set') {
    const logs = await repo.logsInRange(date, date, def.id);
    for (const l of logs) await repo.remove('activityLogs', l.id);
  }
  if (value > 0 || mode === 'add') {
    await repo.saveLog({ id: newId(), activityId: def.id, date, value, durationMin: def.trackingType === 'duration' ? value : undefined, createdAt: Date.now() });
  }
  haptic(12);
  await refresh();
}

export async function saveWorkout(input: {
  id?: string;
  def: ActivityDef;
  date: DateKey;
  durationMin: number;
  distanceKm?: number;
  intensity: Intensity;
  notes?: string;
  exercises?: StrengthExercise[];
  weightKg: number;
}) {
  const log: ActivityLog = {
    id: input.id ?? newId(),
    activityId: input.def.id,
    date: input.date,
    value: input.durationMin,
    durationMin: input.durationMin,
    distanceKm: input.distanceKm || undefined,
    intensity: input.intensity,
    caloriesBurnedEst: caloriesBurned(input.def.met, input.weightKg, input.durationMin, input.intensity),
    notes: input.notes?.trim() || undefined,
    exercises: input.exercises?.filter((e) => e.name.trim() && e.sets.length),
    createdAt: Date.now(),
  };
  await repo.saveLog(log);
  haptic([10, 40, 10]);
  await refresh();
  return log;
}

export async function saveSleep(date: DateKey, bedtime: string, wake: string, quality?: number, id?: string) {
  await repo.saveSleep({ id: id ?? newId(), date, bedtime, wake, durationMin: sleepDuration(bedtime, wake), quality, createdAt: Date.now() });
  haptic(12);
  await refresh();
}

/** Personal records: heaviest set per exercise across history, before this session. */
export function findPRs(current: StrengthExercise[], history: ActivityLog[]): string[] {
  const best = new Map<string, number>();
  for (const l of history) for (const e of l.exercises ?? []) for (const s of e.sets) {
    const k = e.name.trim().toLowerCase();
    best.set(k, Math.max(best.get(k) ?? 0, s.weightKg));
  }
  const prs: string[] = [];
  for (const e of current) {
    const k = e.name.trim().toLowerCase();
    const top = Math.max(0, ...e.sets.map((s) => s.weightKg));
    if (top > 0 && best.has(k) && top > (best.get(k) ?? 0)) prs.push(e.name.trim());
  }
  return prs;
}
