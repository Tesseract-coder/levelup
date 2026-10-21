import type { ActivityLog, Exercise, ExerciseSet, Intensity, SessionExercise, StrengthIntensity, StrengthSession } from '@/db/types';
import { newId } from '@/lib/id';
import { exerciseIndex, LIBRARY } from './library';
import { matchExercise, normaliseName } from './exerciseMatch';
import { sessionVolume } from './metrics';

const INTENSITY: Record<Intensity, StrengthIntensity> = { easy: 'light', moderate: 'moderate', hard: 'vigorous' };

export function customExercise(name: string, now = Date.now()): Exercise {
  return {
    id: `custom_${newId()}`,
    name: name.trim(),
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: 'other',
    mechanic: 'compound',
    forceType: 'push',
    bilateralDumbbell: false,
    trackingType: 'weight_reps',
    defaultRestSec: 90,
    metCategory: 'moderate',
    isCustom: true,
    createdAt: now,
  };
}

/**
 * v2 → v3: turn each legacy strength ActivityLog (free-text exercises) into a StrengthSession.
 * Names are matched to the library; anything unmatched becomes a custom exercise (one per distinct name).
 * The log keeps its calories and gains `sessionId`, so history still shows exactly as before.
 */
export function migrateLegacyStrength(logs: ActivityLog[], strengthDefIds: Set<string>, existingCustom: Exercise[] = []) {
  const newCustom: Exercise[] = [];
  const byName = new Map<string, Exercise>(existingCustom.map((c) => [normaliseName(c.name), c]));
  const pool = () => [...LIBRARY, ...existingCustom, ...newCustom];
  const resolve = (name: string): Exercise => {
    const key = normaliseName(name);
    const known = byName.get(key);
    if (known) return known;
    const m = matchExercise(name, pool());
    const ex = m?.exercise ?? customExercise(name);
    if (!m) newCustom.push(ex);
    byName.set(key, ex);
    return ex;
  };

  const sessions: StrengthSession[] = [];
  const patches: { id: string; sessionId: string }[] = [];
  for (const log of logs) {
    if (!strengthDefIds.has(log.activityId) || log.sessionId) continue;
    const exercises: SessionExercise[] = [];
    for (const e of log.exercises ?? []) {
      if (!e.name?.trim() || !e.sets?.length) continue;
      const ex = resolve(e.name);
      const sets: ExerciseSet[] = e.sets.map((s) => ({ id: newId(), type: 'working', weightKg: s.weightKg || undefined, reps: s.reps || undefined, completed: true }));
      const existing = exercises.find((x) => x.exerciseId === ex.id);
      if (existing) existing.sets.push(...sets);
      else exercises.push({ id: newId(), exerciseId: ex.id, sets });
    }
    const durationMin = log.durationMin ?? log.value ?? 0;
    const kcal = log.caloriesBurnedEst ?? 0;
    const idx = exerciseIndex([...existingCustom, ...newCustom]);
    const s: StrengthSession = {
      id: newId(),
      date: log.date,
      status: 'done',
      mode: 'quick',
      startedAt: log.createdAt - durationMin * 60_000,
      endedAt: log.createdAt,
      durationMin,
      dayTypes: [],
      intensity: INTENSITY[log.intensity ?? 'moderate'],
      intensityOverridden: !!log.intensity && log.intensity !== 'moderate',
      // legacy estimate kept as-is; ±20% ≈ the MET ± 1 band used for new sessions
      kcalEstimate: kcal,
      kcalLow: Math.round((kcal * 0.8) / 5) * 5,
      kcalHigh: Math.round((kcal * 1.2) / 5) * 5,
      kcalMethod: 'met',
      totalVolumeKg: 0,
      notes: log.notes,
      source: 'migrated',
      exercises,
      exerciseIds: [...new Set(exercises.map((e) => e.exerciseId))],
      activityLogId: log.id,
      createdAt: log.createdAt,
      updatedAt: log.createdAt,
    };
    s.totalVolumeKg = sessionVolume(s, (id) => idx.get(id)!);
    sessions.push(s);
    patches.push({ id: log.id, sessionId: s.id });
  }
  return { sessions, newCustom, patches };
}
