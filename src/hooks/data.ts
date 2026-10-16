import { useQuery } from '@tanstack/react-query';
import { repo } from '@/db';
import type { DateKey, Settings } from '@/db/types';
import { DEFAULT_SETTINGS } from '@/db/dexieRepository';
import { todayKey } from '@/domain/dates';
import { useUI } from '@/stores/ui';
import type { TableName } from '@/db/dexie';
import type { RecordOf } from '@/db/repository';
import { refresh } from '@/lib/queryClient';

export function useSettings(): Settings {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => repo.getSettings() });
  return q.data ?? DEFAULT_SETTINGS;
}

export function useSettingsQuery() {
  return useQuery({ queryKey: ['settings'], queryFn: () => repo.getSettings() });
}

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: async () => (await repo.getProfile()) ?? null });
}

export function useGoal() {
  return useQuery({ queryKey: ['goal'], queryFn: async () => (await repo.getActiveGoal()) ?? null });
}

export function useGoalHistory() {
  return useQuery({ queryKey: ['goals'], queryFn: () => repo.listGoals() });
}

export function useActivities(includeArchived = false) {
  return useQuery({ queryKey: ['activities', includeArchived], queryFn: () => repo.listActivities({ includeArchived }) });
}

export function useRangeData(start: DateKey, end: DateKey) {
  return useQuery({ queryKey: ['range', start, end], queryFn: () => repo.rangeData(start, end) });
}

export function useFood(start: DateKey, end: DateKey = start) {
  return useQuery({ queryKey: ['food', start, end], queryFn: () => repo.foodInRange(start, end) });
}

export function useSavedFoods() {
  return useQuery({ queryKey: ['saved'], queryFn: () => repo.listSaved() });
}

export function useLatestWeight() {
  return useQuery({ queryKey: ['latestBody'], queryFn: async () => (await repo.latestBody()) ?? null });
}

/** "Today" respecting the day-boundary setting. */
export function useToday(): DateKey {
  const s = useSettings();
  return todayKey(s.dayBoundaryHour);
}

/** The date the user is viewing on Today (can be a past day). */
export function useSelectedDate(): DateKey {
  const today = useToday();
  const sel = useUI((s) => s.selectedDate);
  return sel ?? today;
}

/** Delete with an undo snackbar. */
export async function removeWithUndo<T extends TableName>(table: T, id: string, label: string) {
  const rec = await repo.remove(table, id);
  await refresh();
  if (!rec) return;
  useUI.getState().showSnack({
    message: `${label} deleted`,
    actionLabel: 'Undo',
    onAction: async () => {
      await repo.restore(table, rec as RecordOf<T>);
      await refresh();
    },
  });
}
