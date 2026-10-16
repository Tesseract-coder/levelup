/**
 * Rule-based coaching. Turns computed RangeStats into:
 *  - `facts`: short strings holding every number the summary may mention (the AI's only source of numbers)
 *  - candidate wins / misses / improvements (fact ids) in priority order
 *  - a complete fallback summary used when AI is off, offline, or fails validation.
 */
import type { Fact } from '@shared/sanitize';
import type { GoalType, NextFocus, SummaryItem } from '@/db/types';
import type { RangeStats } from './stats';

export interface RuleSummary {
  facts: Fact[];
  wins: SummaryItem[];
  misses: SummaryItem[];
  improvements: SummaryItem[];
  nextFocus: NextFocus;
  candidates: { wins: string[]; misses: string[]; improvements: string[]; focus: string | null };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const GOAL_PHRASE: Record<GoalType, string> = {
  lose_fat: 'fat loss',
  build_muscle: 'muscle gain',
  maintain: 'staying fit',
  endurance: 'stamina',
  discipline: 'consistency',
  custom: 'your goal',
};

export function buildRuleSummary(kind: 'day' | 'week', s: RangeStats, prev: RangeStats | null): RuleSummary {
  const facts: Fact[] = [];
  const add = (id: string, text: string) => {
    facts.push({ id, text });
    return id;
  };
  const wins: { id: string; text: string; p: number }[] = [];
  const misses: { id: string; text: string; p: number }[] = [];
  const improvements: { id: string; text: string; p: number; focus?: NextFocus }[] = [];
  const goal = s.goalType ?? 'maintain';
  const period = kind === 'day' ? 'today' : 'this week';
  const n = s.nutrition;
  const a = s.activity;
  const sl = s.sleep;
  const prevScore = prev && (prev.nutrition.loggedDays || prev.activity.sessions || prev.sleep.nights) ? prev.score : null;

  add('score', `Consistency score ${s.score}${prevScore != null ? ` (previous ${kind}: ${prevScore})` : ''}`);
  if (prevScore != null && s.score > prevScore) wins.push({ id: 'score', text: `Consistency score up to ${s.score} from ${prevScore} — real progress.`, p: 40 });

  // ---------------------------------------------------------------- nutrition
  if (n.loggedDays > 0) {
    const fid = add('food_logged', kind === 'day' ? 'Food logged today' : `Food logged on ${n.loggedDays} of ${s.days} days`);
    if (kind === 'week' && n.loggedDays < Math.ceil(s.days * 0.7)) misses.push({ id: fid, text: `Food logged on ${n.loggedDays} of ${s.days} days — gaps make the averages less reliable.`, p: 30 });
    else if (kind === 'week' && n.loggedDays === s.days) wins.push({ id: fid, text: `Food logged every one of the ${s.days} days. That habit is the foundation.`, p: 55 });

    if (kind === 'day') {
      const pid = add('protein_day', `Protein ${n.avgProtein} g of ${n.proteinTarget} g target (${n.avgProteinPct}%)`);
      const cid = add('calories_day', `Calories ${n.avgCalories.toLocaleString()} of ${n.calorieTarget.toLocaleString()} kcal target (${n.avgCaloriePct}%)`);
      if (n.avgProteinPct >= 90) wins.push({ id: pid, text: `Protein hit ${n.avgProteinPct}% of target (${n.avgProtein} g).`, p: 80 });
      else if (n.avgProteinPct < 70) misses.push({ id: pid, text: `Protein reached ${n.avgProtein} g of ${n.proteinTarget} g (${n.avgProteinPct}%).`, p: 70 });
      if (n.avgCaloriePct >= 90 && n.avgCaloriePct <= 110) wins.push({ id: cid, text: `Calories right on target at ${n.avgCalories.toLocaleString()} kcal (${n.avgCaloriePct}%).`, p: 70 });
      else if (n.avgCaloriePct > 115 && goal === 'lose_fat') misses.push({ id: cid, text: `Calories came in at ${n.avgCaloriePct}% of target (${n.avgCalories.toLocaleString()} kcal).`, p: 50 });
    } else {
      const pid = add('protein_week', `Protein target (${n.proteinTarget} g) reached on ${n.proteinHitDays} of ${n.loggedDays} logged days; average ${n.avgProtein} g (${n.avgProteinPct}% of target)`);
      const cid = add('calories_week', `Calories within 10% of target (${n.calorieTarget.toLocaleString()} kcal) on ${n.calorieOnTargetDays} of ${n.loggedDays} logged days; average ${n.avgCalories.toLocaleString()} kcal (${n.avgCaloriePct}%)`);
      if (n.proteinHitDays / n.loggedDays >= 0.6) wins.push({ id: pid, text: `Protein target hit on ${n.proteinHitDays} of ${n.loggedDays} logged days (average ${n.avgProteinPct}%).`, p: 80 });
      else misses.push({ id: pid, text: `Protein target hit on ${n.proteinHitDays} of ${n.loggedDays} logged days; average ${n.avgProtein} g vs ${n.proteinTarget} g.`, p: goal === 'build_muscle' || goal === 'lose_fat' ? 75 : 45 });
      if (n.calorieOnTargetDays / n.loggedDays >= 0.5) wins.push({ id: cid, text: `Calories within 10% of target on ${n.calorieOnTargetDays} of ${n.loggedDays} days.`, p: goal === 'lose_fat' ? 75 : 60 });
      if (n.overDays >= 3 && goal === 'lose_fat') {
        const oid = add('calories_over', `Calories more than 10% over target on ${n.overDays} days`);
        misses.push({ id: oid, text: `Calories ran more than 10% over target on ${n.overDays} days.`, p: 55 });
      }
    }
    const gap = n.proteinTarget - n.avgProtein;
    if (gap >= 15) {
      add('protein_gap', `Average daily protein gap ${gap} g`);
      if (n.breakfastProteinAvg != null) add('breakfast_protein', `Breakfast protein averages ${n.breakfastProteinAvg} g`);
      const step = add('tip_protein', 'Suggested small step: add 20 g protein at breakfast (e.g. 2 eggs, a katori of curd + paneer, or a scoop of whey)');
      improvements.push({
        id: step,
        text:
          n.breakfastProteinAvg != null && n.breakfastProteinAvg < 25
            ? `Add 20 g protein at breakfast — it averages ${n.breakfastProteinAvg} g and you're ${gap} g below target per day.`
            : `Add one protein-rich item a day (eggs, paneer, dal, curd, chicken) — you're ${gap} g below target on average.`,
        p: goal === 'build_muscle' || goal === 'lose_fat' ? 90 : 60,
        focus: { text: 'Add a protein source at breakfast', habit: { name: 'Protein at breakfast', trackingType: 'check', schedule: { type: 'daily' }, icon: 'flame' } },
      });
    }
    if (n.lowIntakeDays >= 2) {
      add('low_intake', `Very low intake (under 800 kcal) logged on ${n.lowIntakeDays} days`);
      improvements.push({ id: 'low_intake', text: `A few days had very little food logged (${n.lowIntakeDays} days). Regular meals fuel training and recovery — consider talking to a professional if eating feels hard.`, p: 100 });
    }
  } else {
    add('food_logged', kind === 'day' ? 'No food logged today' : `No food logged ${period}`);
    if (kind === 'week') misses.push({ id: 'food_logged', text: 'No food logged this week, so nutrition isn’t part of the score yet.', p: 20 });
  }

  // ----------------------------------------------------------------- activity
  if (a.planned > 0 || a.sessions > 0) {
    const wid = add('workouts', kind === 'day' ? `${plural(a.sessions, 'workout')} today, ${a.minutes} active minutes` : `${a.sessions} of ${a.planned} planned workout sessions; ${a.minutes} active minutes`);
    const prevSessions = prev?.activity.sessions;
    if (prevSessions != null && kind === 'week') add('workouts_prev', `Previous week: ${prevSessions} workout sessions`);
    if (kind === 'day') {
      if (a.sessions > 0) wins.push({ id: wid, text: `${plural(a.sessions, 'workout')} done — ${a.minutes} active minutes.`, p: 75 });
    } else if (a.sessions >= a.planned && a.planned > 0) {
      wins.push({ id: wid, text: `All planned workouts done: ${a.sessions} of ${a.planned} sessions, ${a.minutes} minutes.`, p: 85 });
    } else if (a.planned > 0 && a.sessions < a.planned * 0.7) {
      const days = a.inactiveWeekdays;
      const did = days.length && days.length <= 4 ? add('inactive_days', `No workout on ${days.join('/')}`) : null;
      misses.push({ id: did ?? wid, text: did ? `No workout on ${days.join('/')} — ${a.sessions} of ${a.planned} planned sessions.` : `${a.sessions} of ${a.planned} planned workout sessions.`, p: 65 });
      const what = goal === 'lose_fat' ? 'a 20-minute inclined walk' : goal === 'build_muscle' ? 'one more strength session' : goal === 'endurance' ? 'one extra easy cardio session' : 'a short walk';
      const tid = add('tip_workout', `Suggested small step: add ${what} on a rest day`);
      improvements.push({ id: tid, text: `Add ${what} on a rest day — ${a.sessions} of ${a.planned} planned sessions happened.`, p: goal === 'endurance' || goal === 'build_muscle' ? 85 : 70, focus: { text: `Add ${what} on a rest day`, habit: { name: goal === 'build_muscle' ? 'Extra strength session' : 'Rest-day walk', trackingType: 'duration', unit: 'min', target: 20, schedule: { type: 'weekly', times: 2 }, icon: 'walk' } } });
    } else if (prevSessions != null && a.sessions > prevSessions) {
      wins.push({ id: wid, text: `${a.sessions} workout sessions, up from ${prevSessions} last week.`, p: 70 });
    }
    if (goal === 'build_muscle' && a.sessions > 0 && kind === 'week') {
      const tid = add('tip_overload', 'Suggested small step: add 2.5 kg or 1 rep to one main lift next session');
      improvements.push({ id: tid, text: 'Progressive overload: add 2.5 kg or 1 rep to one main lift next session.', p: 65 });
    }
  }

  // ------------------------------------------------------------------- habits
  const habits = s.habits.filter((h) => h.kind === 'habit' && h.expected > 0);
  // short, index-based fact ids (no internal UUIDs leave the device)
  const hid = new Map(habits.map((h, i) => [h.id, `habit_${i + 1}`]));
  for (const h of habits) add(hid.get(h.id)!, kind === 'day' ? `${h.name}: ${h.done ? 'done' : 'not done'} today; streak ${h.streak} ${h.streakUnit}` : `${h.name}: done ${h.done} of ${Math.round(h.expected)} times (${h.rate}%); streak ${h.streak} ${h.streakUnit}`);
  if (kind === 'day') {
    const done = habits.filter((h) => h.done > 0);
    const notDone = habits.filter((h) => h.done === 0);
    if (habits.length) {
      const hid = add('habits_day', `${done.length} of ${habits.length} habits done today`);
      if (done.length === habits.length) wins.push({ id: hid, text: `Every habit done today — ${done.length} of ${habits.length}. 🎉`, p: 90 });
      else if (done.length > 0) wins.push({ id: hid, text: `${done.length} of ${habits.length} habits done: ${list(done.slice(0, 3).map((h) => h.name.toLowerCase()))}.`, p: 60 });
      if (notDone.length) misses.push({ id: hid, text: `Still open: ${list(notDone.slice(0, 3).map((h) => h.name.toLowerCase()))}.`, p: 40 });
    }
    const long = [...habits].sort((x, y) => y.streak - x.streak)[0];
    if (long && long.streak >= 3) wins.push({ id: hid.get(long.id)!, text: `${long.name} streak is at ${long.streak} ${long.streakUnit}.`, p: 50 });
  } else {
    const strong = habits.filter((h) => h.rate >= 80).sort((x, y) => y.rate - x.rate).slice(0, 2);
    for (const h of strong) wins.push({ id: hid.get(h.id)!, text: `${h.name}: ${h.done} of ${Math.round(h.expected)} (${h.rate}%)${h.streak >= 3 ? `, ${h.streak}-${h.streakUnit === 'weeks' ? 'week' : 'day'} streak` : ''}.`, p: 65 });
    const weak = habits.filter((h) => h.rate < 50).sort((x, y) => x.rate - y.rate).slice(0, 2);
    for (const h of weak) misses.push({ id: hid.get(h.id)!, text: `${h.name} done ${h.done} of ${Math.round(h.expected)} times.`, p: 50 });
    if (weak[0]) {
      const tid = add('tip_habit', `Suggested small step: tie ${weak[0].name.toLowerCase()} to something you already do every day`);
      improvements.push({ id: tid, text: `Tie ${weak[0].name.toLowerCase()} to an existing routine (after brushing teeth, with morning chai) — it's at ${weak[0].rate}%.`, p: goal === 'discipline' ? 90 : 55, focus: { text: `Make ${weak[0].name.toLowerCase()} easier: pair it with an existing routine` } });
    }
  }

  // -------------------------------------------------------------------- sleep
  if (sl.nights > 0) {
    const sid = add('sleep', kind === 'day' ? `Slept ${sl.avgHours} h vs ${sl.targetHours} h target` : `Average sleep ${sl.avgHours} h vs ${sl.targetHours} h target over ${plural(sl.nights, 'night')}; under 6 h on ${sl.under6} nights; on target ${sl.onTarget} nights`);
    if (kind === 'day') {
      if (sl.avgHours >= sl.targetHours - 0.5) wins.push({ id: sid, text: `Slept ${sl.avgHours} h — on target.`, p: 55 });
      else if (sl.avgHours < 6) misses.push({ id: sid, text: `Slept ${sl.avgHours} h, short of your ${sl.targetHours} h target.`, p: 55 });
    } else {
      if (sl.onTarget / sl.nights >= 0.7) wins.push({ id: sid, text: `Sleep on target ${sl.onTarget} of ${sl.nights} nights (average ${sl.avgHours} h).`, p: 60 });
      if (sl.under6 >= 2) misses.push({ id: sid, text: `Slept under 6 h on ${sl.under6} nights.`, p: 60 });
    }
    if (kind === 'week' && sl.nights >= 4) {
      add('bedtime_sd', `Bedtime varied by about ${sl.bedtimeSdMin} minutes`);
      if (sl.bedtimeSdMin > 60 || sl.avgHours < sl.targetHours - 0.5) {
        const tid = add('tip_sleep', 'Suggested small step: start winding down 30 minutes earlier, same time every night');
        improvements.push({ id: tid, text: `Start winding down 30 minutes earlier at a fixed time — bedtime varied by ~${sl.bedtimeSdMin} min and you averaged ${sl.avgHours} h.`, p: goal === 'endurance' || goal === 'discipline' ? 75 : 60, focus: { text: 'A fixed wind-down time each night', habit: { name: 'Wind-down routine', trackingType: 'check', schedule: { type: 'daily' }, icon: 'moon' } } });
      }
    }
  }

  // ------------------------------------------------------------------- weight
  if (kind === 'week' && s.weight.change != null && s.weight.entries >= 2) {
    const wid = add('weight', `Weight changed ${s.weight.change > 0 ? '+' : ''}${s.weight.change} kg (${s.weight.first} → ${s.weight.last} kg)`);
    const good = (goal === 'lose_fat' && s.weight.change < 0) || (goal === 'build_muscle' && s.weight.change > 0) || (goal === 'maintain' && Math.abs(s.weight.change) <= 0.5);
    if (good) wins.push({ id: wid, text: `Weight moved ${s.weight.change > 0 ? '+' : ''}${s.weight.change} kg in the right direction for ${GOAL_PHRASE[goal]}.`, p: 50 });
  }

  // -------------------------------------------------------------- mood/energy
  if (s.mood.energyGoodSleep != null && s.mood.energyLowSleep != null && s.mood.energyGoodSleep - s.mood.energyLowSleep >= 0.5) {
    add('energy_sleep', `Energy averages ${s.mood.energyGoodSleep}/5 after 7+ h sleep vs ${s.mood.energyLowSleep}/5 after less`);
  }

  // ------------------------------------------------------- assemble & fallbacks
  wins.sort((x, y) => y.p - x.p);
  misses.sort((x, y) => y.p - x.p);
  improvements.sort((x, y) => y.p - x.p);
  if (wins.length < 2) {
    if (n.loggedDays > 0 && !wins.some((w) => w.id === 'food_logged')) wins.push({ id: 'food_logged', text: kind === 'day' ? 'You logged your food today — awareness is the first step.' : `You logged food on ${n.loggedDays} of ${s.days} days.`, p: 10 });
    if (wins.length < 2) wins.push({ id: 'score', text: kind === 'day' ? `Showing up and checking in counts — today's score is ${s.score}.` : `You kept showing up — consistency score ${s.score}.`, p: 5 });
  }
  if (improvements.length === 0) {
    const tid = add('tip_keep', 'Suggested small step: keep the same routine and add one small habit');
    improvements.push({ id: tid, text: 'Keep this routine going — when it feels easy, add one small habit.', p: 1 });
  }
  const top = improvements.find((i) => i.focus) ?? improvements[0];
  const nextFocus: NextFocus = top.focus ?? { text: top.text };

  const strip = (x: { id: string; text: string }) => ({ text: x.text, facts: [x.id] });
  return {
    facts,
    wins: wins.slice(0, 4).map(strip),
    misses: misses.slice(0, 4).map(strip),
    improvements: improvements.slice(0, 3).map(strip),
    nextFocus,
    candidates: { wins: wins.map((w) => w.id), misses: misses.map((m) => m.id), improvements: improvements.map((i) => i.id), focus: top.id },
  };
}
