import type { DayType, Exercise, SetType } from '@/db/types';
import { LIMITS } from '@/config/strength';
import { KG_PER_LB } from '@/domain/targets';
import { CONFIDENT, rankExercises, type ExerciseMatch } from './exerciseMatch';

/**
 * On-device parser for typed or dictated workouts, e.g.
 * "Chest day. Flat dumbbell press 3 sets 12, 10, 8 with 15, 17.5, 20 kg. Incline press 3x10 at 15kg.
 *  Push-ups 2 sets till failure 18 and 14."
 * Output is always reviewed by the user before anything is saved.
 */

export interface ParsedSet {
  type: SetType;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  addedWeightKg?: number;
  assistanceKg?: number;
  /** Values outside sane limits — shown as "check this", never silently saved. */
  check?: string;
}

export interface ParsedExercise {
  phrase: string;
  name: string;
  /** Confident match, or null when the user must choose. */
  exerciseId: string | null;
  confidence: number;
  /** Ranked candidates for "Did you mean …?". */
  candidates: ExerciseMatch[];
  sets: ParsedSet[];
}

export interface ParsedWorkout {
  dayTypes: DayType[];
  exercises: ParsedExercise[];
  assumptions: string[];
}

const DAY_WORDS: [RegExp, DayType][] = [
  [/\bchest\b/, 'chest'],
  [/\bback\b/, 'back'],
  [/\bshoulders?\b/, 'shoulders'],
  [/\blegs?\b/, 'legs'],
  [/\barms?\b/, 'arms'],
  [/\b(core|abs)\b/, 'core'],
  [/\bglutes?\b/, 'glutes'],
  [/\bpush\b/, 'push'],
  [/\bpull\b/, 'pull'],
  [/\bupper( body)?\b/, 'upper'],
  [/\blower( body)?\b/, 'lower'],
  [/\bfull[ -]?body\b/, 'full'],
];

const NUM = '(\\d+(?:[.,]\\d+)?)';
const num = (s: string) => parseFloat(s.replace(',', '.'));
const WORD_NUMS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', twelve: '12', fifteen: '15', twenty: '20' };

function normalise(text: string): string {
  let t = ` ${text.toLowerCase()} `
    .replace(/[“”"]/g, '')
    .replace(/×/g, 'x')
    .replace(/\b(kgs|kilos?|kilograms?)\b/g, 'kg')
    .replace(/\b(lbs|pounds?)\b/g, 'lb')
    .replace(/\b(secs?|seconds?)\b/g, 's')
    .replace(/\b(mins?|minutes?)\b/g, 'min')
    .replace(/\breps?\b/g, 'reps');
  for (const [w, n] of Object.entries(WORD_NUMS)) t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), n);
  // "3 by 10" → "3x10"
  t = t.replace(/(\d)\s*(?:by|x)\s*(\d)/g, '$1x$2');
  return t.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

/** Leading "Chest day" / "push day:" / "legs and abs today" → day types. */
function takeDay(t: string): { dayTypes: DayType[]; rest: string } {
  const m = t.match(/^(?:today\s+(?:was\s+)?|it was\s+)?([a-z +&/-]{3,30}?)\s+(?:day|workout|session)\b[.:,!-]?\s*/);
  if (!m) return { dayTypes: [], rest: t };
  const types = DAY_WORDS.filter(([re]) => re.test(m[1])).map(([, d]) => d);
  return types.length ? { dayTypes: [...new Set(types)], rest: t.slice(m[0].length).replace(/^[\s:.,!–-]+/, '') } : { dayTypes: [], rest: t };
}

/** Split into one segment per exercise. */
function segments(t: string): string[] {
  return t
    .split(/\n|;|\.(?=\s|$)|,(?=\s*(?:then|and then|next|also)?\s*[a-z][a-z' -]*\s+\d)(?!\s*(?:and\s+)?\d)|\s(?:and then|then|next)\s(?=[a-z])/)
    .map((s) => s.replace(/^\s*(?:then|and then|next|also|did|i did|and)\s+/, '').trim())
    .filter((s) => /[a-z]/.test(s) && s.length > 2);
}

const listOf = (s: string) => s.split(/\s*(?:,|and|&|\/|then)\s*|\s+/).filter(Boolean).map(num).filter((n) => Number.isFinite(n));

function toKg(v: number, unit: 'kg' | 'lb') {
  return unit === 'lb' ? Math.round(v * KG_PER_LB * 1000) / 1000 : v;
}

function parseSegment(seg: string, defaultUnit: 'kg' | 'lb'): { name: string; sets: ParsedSet[]; notes: string[] } {
  const notes: string[] = [];
  // the name is everything before the first number / set keyword
  const cut = seg.search(/[+\d]|\b(?:till|to failure|until|for|at|@|with|sets?|plus|assisted by)\b/);
  const name = (cut === -1 ? seg : seg.slice(0, cut)).replace(/^[^a-z]+/, '').replace(/[:\-–,]+$/, '').trim();
  const body = cut === -1 ? '' : seg.slice(cut);
  const unit: 'kg' | 'lb' = /\blb\b/.test(body) ? 'lb' : /\bkg\b/.test(body) ? 'kg' : defaultUnit;
  const failure = /\b(till|to|until)\s+failure\b|\bamrap\b/.test(body);
  const warmup = /\bwarm[ -]?up\b/.test(seg);

  let setCount: number | undefined;
  let reps: number[] = [];
  let weights: number[] = [];
  let durations: number[] = [];
  let added: number | undefined;
  let assist: number | undefined;

  // explicit weight×reps pairs: "60x8, 60x8, 62.5x6" or "60kg x 8"
  const pairs = [...body.matchAll(new RegExp(`${NUM}\\s*(kg|lb)?\\s*x\\s*(\\d+)(?!\\s*(?:kg|lb))`, 'g'))];
  const looksLikeWeightPairs = pairs.length >= 2 || (pairs.length === 1 && (pairs[0][2] != null || num(pairs[0][1]) > 10));
  if (looksLikeWeightPairs && !/\bsets?\b/.test(body)) {
    for (const p of pairs) {
      weights.push(num(p[1]));
      reps.push(Number(p[3]));
    }
  } else {
    const sx = body.match(new RegExp(`(\\d+)\\s*x\\s*${NUM}\\s*(s|min)?\\b`));
    if (sx) {
      setCount = Number(sx[1]);
      if (sx[3]) durations = [num(sx[2]) * (sx[3] === 'min' ? 60 : 1)];
      else reps = [num(sx[2])];
    }
    const sets = body.match(/(\d+)\s*sets?\b(?:\s*(?:of|x))?\s*((?:\d+(?:\s*(?:,|and|&|\/)\s*|\s+)?)*)/);
    if (sets) {
      setCount = Number(sets[1]);
      const after = sets[2]?.trim();
      // "3 sets of 10", "3 sets 12, 10, 8" — but not the weights ("… with 15, 17.5 kg")
      if (after && !reps.length) reps = listOf(after);
    }
    // reps after "failure"/"reps": "till failure 18 and 14", "reps 12 10 8"
    const rl = body.match(/(?:failure|reps|amrap)\s*:?\s*((?:\d+\s*(?:,|and|&|\/)?\s*)+)/);
    if (rl && !reps.length) reps = listOf(rl[1]);
    const rr = body.match(/((?:\d+\s*(?:,|and|&|\/)?\s*)+)\s*reps\b/);
    if (rr && !reps.length) reps = listOf(rr[1]);
  }

  // weights: "with 15, 17.5, 20 kg", "at 15kg", "@ 60", "15kg"
  if (!weights.length) {
    const wl = body.match(new RegExp(`(?:with|at|@|using)\\s*((?:${NUM}\\s*(?:kg|lb)?\\s*(?:,|and|&|/|then)?\\s*)+)`));
    if (wl) weights = listOf(wl[1].replace(/kg|lb/g, ' '));
    else {
      const loose = [...body.matchAll(new RegExp(`${NUM}\\s*(kg|lb)\\b`, 'g'))].map((m) => num(m[1]));
      if (loose.length) weights = loose;
    }
  }
  const plus = body.match(new RegExp(`(?:\\+|plus|added|weighted)\\s*${NUM}\\s*(?:kg|lb)?`));
  if (plus) {
    added = num(plus[1]);
    if (weights.length === 1 && weights[0] === added) weights = [];
  }
  const assisted = body.match(new RegExp(`(?:assist(?:ed|ance)?|-)\\s*${NUM}\\s*(?:kg|lb)`));
  if (assisted || /\bassist/.test(seg)) {
    const a = assisted ? num(assisted[1]) : weights[0];
    if (a != null) {
      assist = a;
      weights = [];
    }
  }
  // bare rep list after a weight: "pushdowns 25kg 12 12 10"
  if (!reps.length && !durations.length && !setCount) {
    const left = body
      .replace(new RegExp(`(?:with|at|@|using)?\\s*${NUM}\\s*(kg|lb)`, 'g'), ' ')
      .replace(new RegExp(`(?:\\+|plus|added|weighted|assist(?:ed|ance)?)\\s*${NUM}`, 'g'), ' ');
    const ints = listOf(left.replace(/[a-z]+/g, ' ')).filter((v) => Number.isInteger(v));
    if (ints.length && weights.length) reps = ints;
  }
  // timed: "plank 60s", "3 sets of 45 s", "1 min"
  if (!durations.length) {
    const d = [...body.matchAll(new RegExp(`${NUM}\\s*(s|min)\\b`, 'g'))].map((m) => num(m[1]) * (m[2] === 'min' ? 60 : 1));
    if (d.length) durations = d;
  }

  const n = Math.max(setCount ?? 0, reps.length, weights.length, durations.length, 1);
  if (setCount && reps.length > setCount) notes.push(`${name}: ${reps.length} rep counts for ${setCount} sets — used all ${reps.length}.`);
  const pick = (arr: number[], i: number) => (arr.length ? arr[Math.min(i, arr.length - 1)] : undefined);
  const sets: ParsedSet[] = [];
  for (let i = 0; i < n; i++) {
    const s: ParsedSet = { type: warmup && i === 0 && n > 1 ? 'warmup' : failure ? 'failure' : 'working' };
    const w = pick(weights, i);
    if (w != null) s.weightKg = toKg(w, unit);
    const r = pick(reps, i);
    if (r != null) s.reps = Math.round(r);
    const d = pick(durations, i);
    if (d != null && r == null) s.durationSec = Math.round(d);
    if (added != null) s.addedWeightKg = toKg(added, unit);
    if (assist != null) s.assistanceKg = toKg(assist, unit);
    if ((s.reps ?? 0) > LIMITS.maxReps) s.check = `${s.reps} reps looks too high`;
    else if ((s.weightKg ?? 0) > LIMITS.maxWeightKg) s.check = `${Math.round(s.weightKg!)} kg looks too heavy`;
    else if ((s.durationSec ?? 0) > LIMITS.maxDurationSec) s.check = 'that duration looks too long';
    else if (s.reps == null && s.durationSec == null) s.check = 'no reps found';
    sets.push(s);
  }
  if (weights.length === 0 && reps.length && added == null && assist == null) notes.push(`${name}: no weight given — left blank (fine for bodyweight).`);
  if ((weights.length || added != null || assist != null) && !/\b(kg|lb)\b|\d(kg|lb)\b/.test(body)) notes.push(`${name}: no unit given — read as ${unit}.`);
  return { name, sets, notes };
}

export function parseWorkoutText(text: string, pool: Iterable<Exercise>, defaultUnit: 'kg' | 'lb' = 'kg'): ParsedWorkout {
  const { dayTypes, rest } = takeDay(normalise(text));
  const assumptions: string[] = [];
  const exercises: ParsedExercise[] = [];
  const list = [...pool];
  for (const seg of segments(rest)) {
    const { name, sets, notes } = parseSegment(seg, defaultUnit);
    if (!name) continue;
    assumptions.push(...notes);
    const candidates = rankExercises(name, list, 4);
    const [a, b] = candidates;
    const confident = a && a.score >= CONFIDENT && (!b || a.score === 1 || a.score - b.score >= 0.04);
    exercises.push({ phrase: seg, name, exerciseId: confident ? a.exercise.id : null, confidence: a?.score ?? 0, candidates, sets });
  }
  return { dayTypes, exercises, assumptions };
}
