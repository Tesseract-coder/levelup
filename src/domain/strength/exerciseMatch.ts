import type { Exercise } from '@/db/types';

/** On-device fuzzy matching of free-text exercise names against the library + custom exercises. */

const SYNONYMS: [RegExp, string][] = [
  [/\bdb\b|\bdbs\b|\bdumbells?\b|\bdumbbells\b/g, 'dumbbell'],
  [/\bbb\b/g, 'barbell'],
  [/\bkb\b/g, 'kettlebell'],
  [/\bohp\b/g, 'overhead press'],
  [/\brdls?\b/g, 'romanian deadlift'],
  [/\btri(cep)?s?\b/g, 'tricep'],
  [/\bbi(cep)?s?\b/g, 'bicep'],
  [/\bflyes|flys|flies\b/g, 'fly'],
  [/\bpress(es)?\b/g, 'press'],
  [/\bext\b|\bextensions\b/g, 'extension'],
  [/\braises\b/g, 'raise'],
  [/\bcurls\b/g, 'curl'],
  [/\brows\b/g, 'row'],
];

export function normaliseName(s: string): string {
  let t = s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  t = t.replace(/(\w)-(\w)/g, '$1 $2');
  for (const [re, rep] of SYNONYMS) t = t.replace(re, rep);
  // "push ups" → "push up", trailing plural "s" on longer words
  t = t.replace(/\bups\b/g, 'up').replace(/\b(\w{4,}?)s\b/g, (m, w: string) => (/(ss|us)$/.test(m) ? m : w));
  return t.replace(/\s+/g, ' ').trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice similarity on character bigrams, 0–1. */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of A) {
    inter += Math.min(n, B.get(g) ?? 0);
    total += n;
  }
  for (const n of B.values()) total += n;
  return (2 * inter) / total;
}

const tokens = (s: string) => s.split(' ').filter(Boolean);
const EQUIPMENT_WORDS = ['dumbbell', 'barbell', 'cable', 'machine', 'smith', 'kettlebell', 'band'];

/** Similarity of a query to one candidate string, blending character and token overlap. */
function similarity(q: string, c: string): number {
  if (q === c) return 1;
  const qt = tokens(q);
  const ct = tokens(c);
  const shared = qt.filter((t) => ct.includes(t)).length;
  const tokenScore = shared / Math.max(qt.length, ct.length);
  let s = 0.55 * dice(q, c) + 0.45 * tokenScore;
  // all query words present in the candidate ("incline press" ⊂ "incline dumbbell press")
  if (shared === qt.length && qt.length > 0) s = Math.max(s, 0.72 + 0.2 * (qt.length / ct.length));
  // the query names a different piece of equipment than the candidate → strong penalty
  const qe = qt.filter((t) => EQUIPMENT_WORDS.includes(t));
  const ce = ct.filter((t) => EQUIPMENT_WORDS.includes(t));
  if (qe.length && ce.length && !qe.some((e) => ce.includes(e))) s *= 0.6;
  return Math.min(1, s);
}

export interface ExerciseMatch {
  exercise: Exercise;
  /** 0–1. ≥ 0.85 is treated as a confident match. */
  score: number;
}

export function rankExercises(query: string, pool: Iterable<Exercise>, limit = 5): ExerciseMatch[] {
  const q = normaliseName(query);
  if (!q) return [];
  const out: ExerciseMatch[] = [];
  for (const e of pool) {
    if (e.archived) continue;
    let best = 0;
    for (const n of [e.name, ...e.aliases]) {
      const s = similarity(q, normaliseName(n));
      if (s > best) best = s;
      if (best === 1) break;
    }
    if (best > 0.35) out.push({ exercise: e, score: Math.round(best * 1000) / 1000 });
  }
  return out.sort((a, b) => b.score - a.score || a.exercise.name.length - b.exercise.name.length).slice(0, limit);
}

export const CONFIDENT = 0.85;

/** Best match if it's confident and clearly ahead of the runner-up; otherwise null. */
export function matchExercise(query: string, pool: Iterable<Exercise>): ExerciseMatch | null {
  const [a, b] = rankExercises(query, pool, 2);
  if (!a || a.score < CONFIDENT) return null;
  if (b && a.score < 1 && a.score - b.score < 0.04) return null;
  return a;
}

/** For "create custom exercise": an existing exercise that's probably the same thing. */
export function findDuplicate(name: string, pool: Iterable<Exercise>): Exercise | null {
  const [a] = rankExercises(name, pool, 1);
  return a && a.score >= 0.9 ? a.exercise : null;
}
