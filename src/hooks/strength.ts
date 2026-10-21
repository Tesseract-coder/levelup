import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { repo } from '@/db';
import type { Exercise, ExercisePref, StrengthSettings } from '@/db/types';
import { DEFAULT_STRENGTH_SETTINGS } from '@/config/strength';
import { exerciseIndex, unknownExercise } from '@/domain/strength/library';
import { weightUnit } from '@/domain/strength/units';
import { useProfile, useSettings } from './data';

export function useCustomExercises() {
  return useQuery({ queryKey: ['customExercises'], queryFn: () => repo.listCustomExercises() });
}

/** Library + custom exercises, with a lookup that never returns undefined. */
export function useExercises() {
  const { data: custom } = useCustomExercises();
  return useMemo(() => {
    const index = exerciseIndex(custom ?? []);
    const get = (id: string): Exercise => index.get(id) ?? unknownExercise(id);
    return { index, get, ready: custom != null };
  }, [custom]);
}

export function useExercisePrefs() {
  const q = useQuery({ queryKey: ['exercisePrefs'], queryFn: () => repo.listExercisePrefs() });
  return useMemo(() => {
    const map = new Map<string, ExercisePref>((q.data ?? []).map((p) => [p.exerciseId, p]));
    return { map, get: (id: string) => map.get(id), ready: q.data != null };
  }, [q.data]);
}

/** All finished sessions, oldest first. */
export function useAllSessions() {
  return useQuery({ queryKey: ['strengthSessions'], queryFn: () => repo.allSessions() });
}

export function useInProgressSession() {
  return useQuery({ queryKey: ['strengthInProgress'], queryFn: async () => (await repo.inProgressSession()) ?? null });
}

export function useRoutines(includeArchived = false) {
  return useQuery({ queryKey: ['routines', includeArchived], queryFn: () => repo.listRoutines({ includeArchived }) });
}

export function useSplitPlans() {
  return useQuery({ queryKey: ['splitPlans'], queryFn: () => repo.listSplitPlans() });
}

export function useStrengthSettings(): StrengthSettings {
  const s = useSettings();
  return useMemo(() => ({ ...DEFAULT_STRENGTH_SETTINGS, ...s.strength }), [s.strength]);
}

export function useWeightUnit() {
  const { data: profile } = useProfile();
  return weightUnit(profile?.units);
}
