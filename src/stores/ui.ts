import { create } from 'zustand';
import type { DateKey, DayType, ExerciseSet, SessionExercise } from '@/db/types';

export type SheetSpec =
  | { type: 'quickAdd' }
  | { type: 'habit'; activityId: string; date: DateKey }
  | { type: 'workout'; activityId?: string; logId?: string; date: DateKey }
  | { type: 'sleep'; date: DateKey }
  | { type: 'water'; date: DateKey }
  | { type: 'weight'; date: DateKey }
  | { type: 'mood'; date: DateKey }
  | { type: 'manualFood'; date: DateKey; meal?: string; entryId?: string }
  | { type: 'activityEditor'; activityId?: string; kind?: 'workout' | 'habit' }
  | { type: 'activityText'; date: DateKey }
  // strength
  | { type: 'strengthStart'; date: DateKey }
  | { type: 'exercisePicker'; dayTypes: DayType[]; customDayName?: string; mode: 'add' | 'swap'; excludeIds?: string[]; onPick: (ids: string[]) => void }
  | { type: 'setDetails'; set: ExerciseSet; label: string; onChange: (patch: Partial<ExerciseSet>) => void; onDelete: () => void }
  | {
      type: 'exerciseMenu';
      entry: SessionExercise;
      canMoveUp: boolean;
      canMoveDown: boolean;
      /** Superset state relative to the next exercise. */
      superset: 'none' | 'linked' | 'can_link';
      onChange: (patch: Partial<SessionExercise>) => void;
      onMove: (dir: -1 | 1) => void;
      onSuperset: () => void;
      onSwap: () => void;
      onRemove: () => void;
    }
  | { type: 'plateCalc'; totalKg?: number }
  | { type: 'kcalInfo'; sessionId: string }
  | { type: 'confirm'; title: string; body?: string; actions: { label: string; variant?: 'primary' | 'secondary' | 'danger'; onClick: () => void | Promise<void> }[] };

export interface Snack {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface UIState {
  selectedDate: DateKey | null; // null = follow "today"
  setSelectedDate: (d: DateKey | null) => void;
  sheets: SheetSpec[];
  openSheet: (s: SheetSpec, opts?: { replace?: boolean }) => void;
  /** Pops the top sheet from state only; history is handled by SheetHost. */
  popSheet: () => void;
  clearSheets: () => void;
  snack: Snack | null;
  showSnack: (s: Omit<Snack, 'id'>) => void;
  hideSnack: () => void;
}

let snackId = 0;

export const useUI = create<UIState>((set) => ({
  selectedDate: null,
  setSelectedDate: (d) => set({ selectedDate: d }),
  sheets: [],
  openSheet: (s, opts) =>
    set((st) => ({ sheets: opts?.replace && st.sheets.length ? [...st.sheets.slice(0, -1), s] : [...st.sheets, s] })),
  popSheet: () => set((st) => ({ sheets: st.sheets.slice(0, -1) })),
  clearSheets: () => set({ sheets: [] }),
  snack: null,
  showSnack: (s) => set({ snack: { ...s, id: ++snackId } }),
  hideSnack: () => set({ snack: null }),
}));
