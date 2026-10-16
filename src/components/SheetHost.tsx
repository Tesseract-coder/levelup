import { lazy, Suspense } from 'react';
import { useUI, type SheetSpec } from '@/stores/ui';
import { HabitSheet, MoodSheet, QuickAddSheet, SleepSheet, WaterSheet, WeightSheet, WorkoutSheet } from '@/features/log/sheets';
import { ActivityEditorSheet } from '@/features/habits/ActivityEditorSheet';

const ManualFoodSheet = lazy(() => import('@/features/food/ManualFoodSheet'));
const ActivityTextSheet = lazy(() => import('@/features/log/ActivityTextSheet'));

function render(s: SheetSpec) {
  switch (s.type) {
    case 'quickAdd':
      return <QuickAddSheet />;
    case 'habit':
      return <HabitSheet activityId={s.activityId} date={s.date} />;
    case 'workout':
      return <WorkoutSheet activityId={s.activityId} logId={s.logId} date={s.date} />;
    case 'sleep':
      return <SleepSheet date={s.date} />;
    case 'water':
      return <WaterSheet date={s.date} />;
    case 'weight':
      return <WeightSheet date={s.date} />;
    case 'mood':
      return <MoodSheet date={s.date} />;
    case 'activityEditor':
      return <ActivityEditorSheet activityId={s.activityId} kind={s.kind} />;
    case 'manualFood':
      return <ManualFoodSheet date={s.date} meal={s.meal} entryId={s.entryId} />;
    case 'activityText':
      return <ActivityTextSheet date={s.date} />;
  }
}

/** Renders only the top sheet; the stack is kept for back-button behaviour. */
export function SheetHost() {
  const top = useUI((s) => s.sheets[s.sheets.length - 1]);
  if (!top) return null;
  // key forces a fresh mount when one sheet replaces another
  return (
    <Suspense fallback={null}>
      <div key={`${useUI.getState().sheets.length}-${top.type}`}>{render(top)}</div>
    </Suspense>
  );
}
