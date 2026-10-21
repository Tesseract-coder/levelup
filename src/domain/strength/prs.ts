import type { Exercise, ExerciseSet, PRType, StrengthSession } from '@/db/types';
import { exerciseVolume, setE1rm, type MetricOpts } from './metrics';
import { sessionOrder } from './session';

/** Personal records. Warm-ups never count; the first session of an exercise sets the baseline (no PR). */

export interface PRRecord {
  exerciseId: string;
  type: PRType;
  value: number;
  /** For 'reps': the weight the reps were done at. */
  atWeightKg?: number;
  setId: string;
  sessionId: string;
  date: string;
}

interface Bests {
  maxWeight: number;
  bestE1rm: number;
  /** weight → most reps done at that weight or heavier. */
  repsAt: Map<number, number>;
  maxVolume: number;
}

const weightOf = (s: ExerciseSet, ex: Exercise) => (ex.trackingType === 'bodyweight_reps' ? s.addedWeightKg ?? 0 : s.weightKg ?? 0);
const counts = (s: ExerciseSet) => s.completed && s.type !== 'warmup' && (s.reps ?? 0) > 0;

function repsAtLeast(b: Bests, w: number): number {
  let best = 0;
  for (const [weight, reps] of b.repsAt) if (weight >= w && reps > best) best = reps;
  return best;
}

export interface PRContext {
  lookup: (id: string) => Exercise;
  opts: (s: StrengthSession, exerciseId: string) => MetricOpts;
}

/**
 * Walk all finished sessions chronologically and (re)flag PR sets.
 * Returns every PR found and the sessions whose flags changed (to be saved).
 */
export function annotatePRs(all: StrengthSession[], ctx: PRContext): { records: PRRecord[]; changed: StrengthSession[] } {
  const sessions = all.filter((s) => s.status === 'done').sort(sessionOrder);
  const bests = new Map<string, Bests>();
  const records: PRRecord[] = [];
  const changed: StrengthSession[] = [];

  for (const s of sessions) {
    let dirty = false;
    const exercises = s.exercises.map((se) => {
      const ex = ctx.lookup(se.exerciseId);
      const o = ctx.opts(s, se.exerciseId);
      const work = se.sets.filter(counts);
      const prev = bests.get(se.exerciseId);
      const flags = new Map<string, PRType[]>();
      const flag = (set: ExerciseSet, t: PRType, value: number, atWeightKg?: number) => {
        flags.set(set.id, [...(flags.get(set.id) ?? []), t]);
        records.push({ exerciseId: se.exerciseId, type: t, value, atWeightKg, setId: set.id, sessionId: s.id, date: s.date });
      };

      if (prev && work.length) {
        const heaviest = work.reduce((a, b) => (weightOf(b, ex) > weightOf(a, ex) ? b : a));
        if (weightOf(heaviest, ex) > prev.maxWeight) flag(heaviest, 'weight', weightOf(heaviest, ex));
        let bestE: { set: ExerciseSet; v: number } | null = null;
        for (const x of work) {
          const v = setE1rm(x, ex, o);
          if (v != null && (!bestE || v > bestE.v)) bestE = { set: x, v };
        }
        if (bestE && bestE.v > prev.bestE1rm) flag(bestE.set, 'e1rm', bestE.v);
        // most reps at a weight: only meaningful when the weight isn't itself a new max
        let bestR: { set: ExerciseSet; gain: number } | null = null;
        for (const x of work) {
          const w = weightOf(x, ex);
          if (w > prev.maxWeight) continue;
          const before = repsAtLeast(prev, w);
          const gain = (x.reps ?? 0) - before;
          if (before > 0 && gain > 0 && (!bestR || gain > bestR.gain)) bestR = { set: x, gain };
        }
        if (bestR) flag(bestR.set, 'reps', bestR.set.reps ?? 0, weightOf(bestR.set, ex));
        const vol = exerciseVolume(se, ex, o);
        if (vol > prev.maxVolume && prev.maxVolume > 0) {
          const top = bestE?.set ?? heaviest;
          flag(top, 'volume', vol);
        }
      }

      // fold this session into the running bests
      if (work.length) {
        const b = prev ?? { maxWeight: 0, bestE1rm: 0, repsAt: new Map(), maxVolume: 0 };
        for (const x of work) {
          const w = weightOf(x, ex);
          b.maxWeight = Math.max(b.maxWeight, w);
          b.bestE1rm = Math.max(b.bestE1rm, setE1rm(x, ex, o) ?? 0);
          b.repsAt.set(w, Math.max(b.repsAt.get(w) ?? 0, x.reps ?? 0));
        }
        b.maxVolume = Math.max(b.maxVolume, exerciseVolume(se, ex, o));
        bests.set(se.exerciseId, b);
      }

      const sets = se.sets.map((x) => {
        const types = flags.get(x.id);
        const isPR = !!types?.length;
        const same = !!x.isPR === isPR && (x.prTypes ?? []).join() === (types ?? []).join();
        if (same) return x;
        dirty = true;
        return { ...x, isPR: isPR || undefined, prTypes: types };
      });
      return sets === se.sets ? se : { ...se, sets };
    });
    if (dirty) changed.push({ ...s, exercises });
  }
  return { records, changed };
}

export const PR_LABEL: Record<PRType, string> = { weight: 'Heaviest weight', e1rm: 'Best est. 1RM', reps: 'Most reps', volume: 'Best volume' };

