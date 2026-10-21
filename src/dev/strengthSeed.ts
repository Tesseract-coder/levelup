/**
 * 12 weeks of realistic push/pull/legs training with steady progression, warm-ups,
 * RPE, the odd missed session and one deload week — enough to check charts and PRs.
 */
import type { Repository } from '@/db/repository';
import type { ActivityLog, DayType, ExerciseSet, SessionExercise, StrengthSession } from '@/db/types';
import { addDays, fromKey } from '@/domain/dates';
import { libraryExercise } from '@/domain/strength/library';
import { finalizeSession } from '@/domain/strength/finalize';
import { annotatePRs } from '@/domain/strength/prs';
import { newSession } from '@/domain/strength/session';
import { newId } from '@/lib/id';

type Plan = [exerciseId: string, startKg: number, incKg: number, reps: number, sets: number][];

const DAYS: { dayTypes: DayType[]; plan: Plan }[] = [
  { dayTypes: ['push'], plan: [['barbell_bench_press', 50, 2.5, 8, 3], ['incline_dumbbell_press', 16, 2, 10, 3], ['overhead_press', 30, 1.25, 8, 3], ['lateral_raise', 6, 1, 15, 3], ['rope_pushdown', 20, 2.5, 12, 3]] },
  { dayTypes: ['pull'], plan: [['deadlift', 90, 5, 5, 3], ['lat_pulldown', 45, 2.5, 10, 3], ['seated_cable_row', 45, 2.5, 10, 3], ['face_pull', 15, 1.25, 15, 3], ['dumbbell_curl', 10, 1, 12, 3]] },
  { dayTypes: ['legs'], plan: [['back_squat', 70, 2.5, 6, 3], ['leg_press', 120, 5, 10, 3], ['romanian_deadlift', 60, 2.5, 10, 3], ['lying_leg_curl', 30, 2.5, 12, 3], ['standing_calf_raise', 40, 2.5, 15, 3]] },
];

export async function seedStrength(repo: Repository, rng: () => number, today: string, activityId: string, bodyWeightKg: number, weeks = 12) {
  const lookup = (id: string) => libraryExercise(id)!;
  const sessions: StrengthSession[] = [];
  let k = 0;
  for (let d = weeks * 7; d >= 1; d--) {
    const date = addDays(today, -d);
    const dow = fromKey(date).getDay();
    if (![1, 3, 5].includes(dow) || rng() < 0.12) continue; // Mon/Wed/Fri, ~1 in 8 missed
    const week = Math.floor((weeks * 7 - d) / 7);
    const deload = week === 7;
    const day = DAYS[k++ % DAYS.length];
    const start = fromKey(date).getTime() + 18 * 3600_000 + Math.round(rng() * 60) * 60_000;
    const s = newSession({ date, dayTypes: day.dayTypes, mode: 'live', startedAt: start, bodyWeightKg });
    let t = start + 6 * 60_000;
    s.exercises = day.plan.map(([id, kg, inc, reps, n]): SessionExercise => {
      const steps = Math.floor(week / 2) - (week > 7 ? 1 : 0);
      const w = Math.round((kg + inc * steps) * (deload ? 0.85 : 1) * 4) / 4;
      const ex = lookup(id);
      const sets: ExerciseSet[] = [];
      if (ex.mechanic === 'compound') {
        t += 90_000;
        sets.push({ id: newId(), type: 'warmup', weightKg: Math.round(w * 0.5), reps: 10, completed: true, completedAt: t });
      }
      for (let i = 0; i < n; i++) {
        t += (ex.defaultRestSec + Math.round((rng() - 0.3) * 40)) * 1000;
        const r = Math.max(3, reps - (i === n - 1 && rng() < 0.4 ? 1 : 0) + (rng() < 0.15 ? 1 : 0));
        sets.push({ id: newId(), type: 'working', weightKg: w, reps: r, rpe: deload ? 6 : 7 + Math.round(rng() * 2), completed: true, completedAt: t });
      }
      t += 120_000;
      return { id: newId(), exerciseId: id, sets };
    });
    sessions.push(finalizeSession({ ...s, endedAt: t + 60_000 }, { lookup, restOf: (e) => lookup(e.exerciseId).defaultRestSec, includeWarmups: false, bodyWeightKg, now: t + 60_000 }, { markFilledDone: true }));
  }
  const { changed } = annotatePRs(sessions, { lookup, opts: () => ({}) });
  const flagged = new Map(changed.map((c) => [c.id, c]));
  for (const raw of sessions) {
    const s = flagged.get(raw.id) ?? raw;
    const log: ActivityLog = { id: newId(), activityId, date: s.date, value: s.durationMin, durationMin: s.durationMin, intensity: s.intensity === 'vigorous' ? 'hard' : s.intensity === 'light' ? 'easy' : 'moderate', caloriesBurnedEst: s.kcalEstimate, sessionId: s.id, createdAt: s.endedAt ?? s.startedAt };
    await repo.saveSession({ ...s, activityLogId: log.id }, log);
  }
  return sessions.length;
}
