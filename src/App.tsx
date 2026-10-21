import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router';
import { BottomNav } from '@/components/BottomNav';
import { Snackbar } from '@/components/Snackbar';
import { SheetHost } from '@/components/SheetHost';
import { useSheetHistorySync } from '@/components/sheetHistory';
import { Skeleton } from '@/components/ui';
import { useSettingsQuery, useToday } from '@/hooks/data';
import { useApplyTheme } from '@/hooks/useTheme';
import { setHaptics } from '@/lib/haptics';
import { useUI } from '@/stores/ui';
import { useReminderScheduler } from '@/features/reminders/useReminders';
import { TodayScreen } from '@/features/today/TodayScreen';
// eager: it's the first screen a new user sees, so avoid an extra round trip
import Onboarding from '@/features/onboarding/Onboarding';

const FoodEntryScreen = lazy(() => import('@/features/food/FoodEntryScreen'));
const DiaryScreen = lazy(() => import('@/features/food/DiaryScreen'));
const InsightsScreen = lazy(() => import('@/features/insights/InsightsScreen'));
const HabitsScreen = lazy(() => import('@/features/habits/HabitsScreen'));
const HabitDetailScreen = lazy(() => import('@/features/habits/HabitDetailScreen'));
const WorkoutHistoryScreen = lazy(() => import('@/features/workouts/WorkoutHistoryScreen'));
const ProfileScreen = lazy(() => import('@/features/profile/ProfileScreen'));
const GoalsScreen = lazy(() => import('@/features/goals/GoalsScreen'));
const SummaryScreen = lazy(() => import('@/features/summary/SummaryScreen'));
const ReviewScreen = lazy(() => import('@/features/summary/ReviewScreen'));
const ExerciseDetailScreen = lazy(() => import('@/features/strength/ExerciseDetailScreen'));
const WorkoutScreen = lazy(() => import('@/features/strength/WorkoutScreen'));
const WorkoutSummaryScreen = lazy(() => import('@/features/strength/WorkoutSummaryScreen'));
const RestTimerPill = lazy(() => import('@/features/strength/RestTimerPill').then((m) => ({ default: m.RestTimerPill })));

function PageFallback() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
    </div>
  );
}

/** Main tabs: content + bottom nav. Bottom padding clears the nav and the home indicator. */
function TabLayout() {
  return (
    <>
      <main className="pt-safe" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}>
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <BottomNav />
    </>
  );
}

/** Focused flows (food review, onboarding): no tab bar. */
function FocusLayout() {
  return (
    <main className="pt-safe">
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    </main>
  );
}

/** `?demo=1` loads ~60 days of demo data (preview charts & summaries quickly). */
let seedingStarted = false;
function useDemoFlag() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (params.get('demo') !== '1' || seedingStarted) return;
    seedingStarted = true; // StrictMode runs effects twice in dev; seed exactly once
    void (async () => {
      const [{ seedDemoData }, { repo }, { refresh }] = await Promise.all([import('@/dev/seed'), import('@/db'), import('@/lib/queryClient')]);
      await seedDemoData(repo);
      await refresh();
      seedingStarted = false;
      navigate('/', { replace: true });
    })();
  }, [params, navigate]);
  return params.get('demo') === '1';
}

/** Handles PWA shortcut deep links like `/?quick=water`. */
function useQuickLinks() {
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const openSheet = useUI((s) => s.openSheet);
  useEffect(() => {
    const q = params.get('quick');
    if (!q) return;
    setParams({}, { replace: true });
    if (q === 'water') openSheet({ type: 'water', date: today });
    else if (q === 'workout') openSheet({ type: 'workout', date: today });
    else if (q === 'food') openSheet({ type: 'quickAdd' });
  }, [params, setParams, openSheet, today]);
}

export function App() {
  const settingsQ = useSettingsQuery();
  const settings = settingsQ.data;
  const location = useLocation();
  useApplyTheme(settings?.theme ?? 'system');
  useSheetHistorySync();
  useQuickLinks();
  const seeding = useDemoFlag();
  useReminderScheduler(settings);
  useEffect(() => setHaptics(settings?.haptics ?? true), [settings?.haptics]);

  if (!settings || seeding) return <PageFallback />;
  const onboarding = location.pathname.startsWith('/onboarding');
  if (!settings.onboarded && !onboarding) return <Navigate to="/onboarding" replace />;

  return (
    <div className="mx-auto min-h-dvh max-w-[480px] overflow-x-clip bg-canvas">
      <Routes>
        <Route element={<FocusLayout />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/food/new" element={<FoodEntryScreen />} />
          <Route path="/review" element={<ReviewScreen />} />
          <Route path="/workout/:id" element={<WorkoutScreen />} />
          <Route path="/workout/:id/summary" element={<WorkoutSummaryScreen />} />
        </Route>
        <Route element={<TabLayout />}>
          <Route index element={<TodayScreen />} />
          <Route path="/log" element={<DiaryScreen />} />
          <Route path="/workouts" element={<WorkoutHistoryScreen />} />
          <Route path="/exercises/:id" element={<ExerciseDetailScreen />} />
          <Route path="/insights" element={<InsightsScreen />} />
          <Route path="/habits" element={<HabitsScreen />} />
          <Route path="/habits/:id" element={<HabitDetailScreen />} />
          <Route path="/goals" element={<GoalsScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/summary/:kind/:date" element={<SummaryScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <SheetHost />
      <Suspense fallback={null}>
        <RestTimerPill />
      </Suspense>
      <Snackbar />
    </div>
  );
}
