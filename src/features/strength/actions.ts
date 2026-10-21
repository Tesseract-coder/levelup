import { repo } from '@/db';
import type { ActivityDef, ActivityLog, DateKey, DayType, Exercise, ExercisePref, Intensity, Routine, SessionExercise, SplitPlan, StrengthIntensity, StrengthSession } from '@/db/types';
import { exercisesFromRoutine, newSession } from '@/domain/strength/session';
import { instantiate, plannedWeekdays } from '@/domain/strength/templates';
import { restFor } from './format';
import { DEFAULT_STRENGTH_SETTINGS } from '@/config/strength';
import { WORKOUT_PRESETS, presetToDef } from '@/domain/presets';
import { exerciseIndex, unknownExercise } from '@/domain/strength/library';
import { finalizeSession } from '@/domain/strength/finalize';
import { annotatePRs } from '@/domain/strength/prs';
import { newId } from '@/lib/id';
import { haptic } from '@/lib/haptics';
import { refresh } from '@/lib/queryClient';
import { useUI } from '@/stores/ui';

const TO_INTENSITY: Record<StrengthIntensity, Intensity> = { light: 'easy', moderate: 'moderate', vigorous: 'hard' };

/** The "Strength training" activity that sessions are logged under; created on first use. */
export async function ensureStrengthDef(): Promise<ActivityDef> {
  const all = await repo.listActivities({ includeArchived: true });
  const def = all.find((a) => a.isStrength && !a.archived) ?? all.find((a) => a.isStrength);
  if (def) return def;
  const created = presetToDef(WORKOUT_PRESETS.find((p) => p.isStrength)!, all.length);
  await repo.saveActivity(created);
  return created;
}

export async function startSession(s: StrengthSession) {
  await repo.saveSession(s);
  await refresh();
  return s.id;
}

async function context() {
  const [custom, prefs, settings, body] = await Promise.all([repo.listCustomExercises(), repo.listExercisePrefs(), repo.getSettings(), repo.latestBody()]);
  const idx = exerciseIndex(custom);
  const prefMap = new Map(prefs.map((p) => [p.exerciseId, p]));
  const lookup = (id: string): Exercise => idx.get(id) ?? unknownExercise(id);
  const strength = { ...DEFAULT_STRENGTH_SETTINGS, ...settings.strength };
  return {
    lookup,
    restOf: (e: SessionExercise) => restFor(lookup(e.exerciseId), e.restSec, prefMap.get(e.exerciseId), strength),
    countBothHands: (id: string) => prefMap.get(id)?.countBothHands,
    includeWarmups: strength.includeWarmupsInVolume,
    bodyWeightKg: body?.weightKg,
  };
}

/** Finish (or re-save an edited) session: finalize, then write it with its ActivityLog in one transaction. */
export async function finishSession(raw: StrengthSession, opts: { markFilledDone: boolean }): Promise<StrengthSession> {
  const [ctx, def] = await Promise.all([context(), ensureStrengthDef()]);
  const s = finalizeSession(raw, { ...ctx, now: Date.now() }, opts);
  const existing = s.activityLogId ? await repo.getLog(s.activityLogId) : undefined;
  const log: ActivityLog = {
    id: s.activityLogId ?? newId(),
    activityId: existing?.activityId ?? def.id,
    date: s.date,
    value: s.durationMin,
    durationMin: s.durationMin,
    intensity: TO_INTENSITY[s.intensity],
    caloriesBurnedEst: s.kcalEstimate,
    sessionId: s.id,
    notes: s.notes,
    createdAt: existing?.createdAt ?? s.endedAt ?? Date.now(),
  };
  const saved = { ...s, activityLogId: log.id };
  await repo.saveSession(saved, log);
  await recomputePRs();
  haptic([10, 40, 10]);
  await refresh();
  return (await repo.getSession(saved.id)) ?? saved;
}

/** Re-flag PR sets across history (cheap; keeps flags right after edits and deletes). */
export async function recomputePRs() {
  const [ctx, all] = await Promise.all([context(), repo.allSessions()]);
  const { changed } = annotatePRs(all, {
    lookup: ctx.lookup,
    opts: (s, id) => ({ includeWarmups: false, bodyWeightKg: s.bodyWeightKg ?? ctx.bodyWeightKg, countBothHands: ctx.countBothHands(id) }),
  });
  if (changed.length) await repo.saveSessions(changed);
}

/** Change a finished session's intensity (or go back to automatic) and re-estimate calories. */
export async function setSessionIntensity(s: StrengthSession, intensity: StrengthIntensity | null) {
  await finishSession({ ...s, intensity: intensity ?? s.intensity, intensityOverridden: intensity != null }, { markFilledDone: true });
}

export async function discardSession(id: string) {
  await repo.removeSession(id);
  await refresh();
}

export async function deleteSessionWithUndo(id: string) {
  const rec = await repo.removeSession(id);
  await recomputePRs();
  await refresh();
  if (!rec) return;
  useUI.getState().showSnack({
    message: 'Workout deleted',
    actionLabel: 'Undo',
    onAction: async () => {
      await repo.restoreSession(rec);
      await recomputePRs();
      await refresh();
    },
  });
}

export async function updatePref(exerciseId: string, patch: Partial<ExercisePref>) {
  const current = (await repo.listExercisePrefs()).find((p) => p.exerciseId === exerciseId);
  await repo.saveExercisePref({ ...current, ...patch, exerciseId });
  await refresh();
}

export async function saveCustomExercise(ex: Exercise) {
  await repo.saveCustomExercise(ex);
  await refresh();
}

/** Create and persist a new in-progress session (optionally from a routine). Returns its id. */
export async function startWorkout(o: { date: DateKey; dayTypes: DayType[]; customDayName?: string; mode: 'live' | 'quick'; startedAt?: number; durationMin?: number; routine?: Routine }) {
  const [sessions, body] = await Promise.all([repo.allSessions(), repo.latestBody()]);
  const s = newSession({ ...o, dayTypes: o.routine ? o.routine.dayTypes : o.dayTypes, customDayName: o.routine && !o.routine.dayTypes.length ? o.routine.name : o.customDayName, routineId: o.routine?.id, bodyWeightKg: body?.weightKg });
  if (o.routine) s.exercises = exercisesFromRoutine(o.routine, sessions, false);
  return startSession(s);
}

// ------------------------------------------------------------ routines

export async function saveRoutine(r: Routine) {
  await repo.saveRoutine(r);
  await refresh();
}

export async function duplicateRoutine(r: Routine, order: number) {
  const now = Date.now();
  const copy: Routine = { ...r, id: newId(), name: `${r.name} (copy)`, order, archived: false, createdAt: now, updatedAt: now, exercises: r.exercises.map((e) => ({ ...e })) };
  await saveRoutine(copy);
  return copy;
}

export async function addTemplate(key: string) {
  const existing = await repo.listRoutines({ includeArchived: true });
  const { routines, plan } = instantiate(key, existing.length);
  for (const r of routines) await repo.saveRoutine(r);
  await repo.saveSplitPlan(plan);
  await refresh();
  return plan;
}

/**
 * Activating a split makes its weekdays the Strength activity's schedule, so the existing
 * habit/score engine treats planned days as scheduled workouts (grace days apply).
 */
export async function saveSplit(plan: SplitPlan) {
  await repo.saveSplitPlan(plan);
  await syncStrengthSchedule();
  await refresh();
}

export async function deleteSplit(id: string) {
  await repo.remove('splitPlans', id);
  await syncStrengthSchedule();
  await refresh();
}

async function syncStrengthSchedule() {
  const def = await ensureStrengthDef();
  const active = (await repo.listSplitPlans()).find((p) => p.active);
  const days = active ? plannedWeekdays(active) : [];
  if (days.length) {
    if (def.schedule.type !== 'weekdays' || def.schedule.days.join() !== days.join()) await repo.saveActivity({ ...def, schedule: { type: 'weekdays', days } });
  } else if (def.schedule.type === 'weekdays') {
    await repo.saveActivity({ ...def, schedule: { type: 'weekly', times: Math.max(1, def.schedule.days.length) } });
  }
}
