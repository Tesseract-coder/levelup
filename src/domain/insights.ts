import type { Goal } from '@/db/types';
import type { DayView } from './day';

/**
 * One or two goal-aware sentences for the Today card. Purely rule-based and computed from the
 * day's numbers, so it works offline and never invents figures.
 */
export function dailyInsight(view: DayView, goal: Goal | null | undefined, now = new Date(), isToday = true): string {
  const hour = now.getHours();
  const t = view.totals;
  const proteinLeft = goal ? Math.max(0, goal.proteinTarget - t.proteinG) : 0;
  const kcalLeft = goal ? goal.calorieTarget - t.calories : 0;
  const pending = view.habits.filter((h) => h.scheduled && h.def.schedule.type !== 'weekly' && h.status !== 'done');
  const allHabitsDone = view.habitsScheduled > 0 && pending.length === 0;

  if (!isToday) {
    if (!view.food.length && !view.workouts.length && view.habitsDone === 0) return 'Nothing logged for this day yet. You can still add what you remember — rough is fine.';
    return `This day: ${t.calories.toLocaleString()} kcal, ${t.proteinG} g protein, ${view.activeMinutes} active minutes and ${view.habitsDone}/${view.habitsScheduled} habits.`;
  }

  if (!view.food.length && !view.workouts.length && view.habitsDone === 0) {
    return hour < 11
      ? 'Fresh day. Start with one easy win — log breakfast or tick off a habit.'
      : 'Nothing logged yet today — that’s okay. One line about what you’ve eaten is enough to get going.';
  }

  if (allHabitsDone && goal && t.proteinG >= goal.proteinTarget * 0.9) {
    return 'Every habit done and protein on track. That’s exactly what consistency looks like. 🎉';
  }

  const type = goal?.type;
  if (goal && hour >= 15 && proteinLeft >= 20 && (type === 'build_muscle' || type === 'lose_fat')) {
    return `${proteinLeft} g of protein to go. For ${type === 'build_muscle' ? 'muscle gain' : 'fat loss'} protein matters most — paneer, dal, curd, eggs or chicken at dinner would close the gap.`;
  }
  if (goal && type === 'lose_fat' && kcalLeft < -150) {
    return `You’re about ${Math.abs(kcalLeft).toLocaleString()} kcal over today’s target. No big deal — one day doesn’t define the trend. A walk this evening is a nice bonus, not a punishment.`;
  }
  if (goal && type === 'build_muscle' && hour >= 18 && kcalLeft > 400) {
    return `${kcalLeft.toLocaleString()} kcal still available today. A protein-rich snack before bed helps recovery for muscle gain.`;
  }
  if ((type === 'endurance' || type === 'lose_fat') && view.activeMinutes === 0 && hour >= 16) {
    return 'No workout logged yet. Even 20 minutes of walking counts toward your weekly plan.';
  }
  if (pending.length && hour >= 18) {
    const names = pending.slice(0, 2).map((p) => p.def.name.toLowerCase());
    return `Still open: ${names.join(' and ')}${pending.length > 2 ? ` +${pending.length - 2} more` : ''}. Small steps still count.`;
  }
  if (view.activeMinutes > 0) {
    return `${view.activeMinutes} active minutes logged — nice. ${view.habitsDone}/${view.habitsScheduled} habits done so far.`;
  }
  return `${view.habitsDone}/${view.habitsScheduled} habits done and ${t.calories.toLocaleString()} kcal logged so far. Keep it going.`;
}
