import type { ParsedActivityEntry } from '@shared/sanitize';
import type { ActivityDef } from '@/db/types';
import { keywordsFor } from './presets';

/** Offline parser for notes like "cycled 40 min, learned React for 1 hour, slept 6.5 hrs, drank 2 L water". */

function minutesIn(s: string): number | undefined {
  let total = 0;
  let found = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/g)) {
    total += parseFloat(m[1]) * 60;
    found = true;
  }
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|m)\b/g)) {
    total += parseFloat(m[1]);
    found = true;
  }
  if (/\bhalf an? hour\b/.test(s)) {
    total += 30;
    found = true;
  } else if (/\ban hour\b/.test(s)) {
    total += 60;
    found = true;
  }
  return found ? Math.round(total) : undefined;
}

function hoursIn(s: string): number | undefined {
  const m = minutesIn(s);
  return m != null ? Math.round((m / 60) * 10) / 10 : undefined;
}

export function parseActivityLocally(text: string, defs: ActivityDef[]): ParsedActivityEntry[] {
  const out: ParsedActivityEntry[] = [];
  const chunks = text
    .toLowerCase()
    .replace(/^today\s+i\s+/i, '')
    .split(/,(?!\d{3}\b)|[;\n]|\.(?!\d)|\band then\b|\bthen\b|\band\b(?!\s+\d)/)
    .map((c) => c.trim())
    .filter((c) => c.length > 2);

  const live = defs.filter((d) => !d.archived);
  for (const c of chunks) {
    // sleep
    if (/\b(slept|sleep)\b/.test(c)) {
      const sleep = live.find((d) => d.special === 'sleep');
      out.push({ phrase: c, kind: 'sleep', activityId: sleep?.id ?? null, activityName: 'Sleep', value: hoursIn(c), unit: 'h', confidence: hoursIn(c) ? 0.8 : 0.3 });
      continue;
    }
    // water
    if (/\bwater\b/.test(c)) {
      const water = live.find((d) => d.special === 'water');
      let ml: number | undefined;
      const l = c.match(/(\d+(?:\.\d+)?)\s*(l|litres?|liters?|ltr)\b/);
      const mlm = c.match(/(\d+)\s*ml\b/);
      const gl = c.match(/(\d+)\s*(glass|glasses|cups?)\b/);
      if (l) ml = parseFloat(l[1]) * 1000;
      else if (mlm) ml = Number(mlm[1]);
      else if (gl) ml = Number(gl[1]) * 250;
      out.push({ phrase: c, kind: 'water', activityId: water?.id ?? null, activityName: 'Water', value: ml, unit: 'ml', confidence: ml ? 0.8 : 0.3 });
      continue;
    }
    // steps
    const steps = c.match(/(\d[\d,]*)\s*steps\b/);
    if (steps) {
      const d = live.find((x) => x.special === 'steps');
      out.push({ phrase: c, kind: 'habit', activityId: d?.id ?? null, activityName: 'Steps', value: Number(steps[1].replace(/,/g, '')), unit: 'steps', confidence: 0.85 });
      continue;
    }
    // weight
    const w = c.match(/\bweigh(?:ed|t)?\b.*?(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)?/);
    if (w) {
      const v = parseFloat(w[1]);
      out.push({ phrase: c, kind: 'weight', activityId: null, activityName: 'Weight', value: w[2]?.startsWith('lb') ? Math.round(v * 0.4536 * 10) / 10 : v, unit: 'kg', confidence: 0.8 });
      continue;
    }
    // match a tracked activity by keyword
    let best: ActivityDef | undefined;
    let bestLen = 0;
    for (const d of live) {
      for (const k of keywordsFor(d)) {
        if (c.includes(k) && k.length > bestLen) {
          best = d;
          bestLen = k.length;
        }
      }
    }
    const minutes = minutesIn(c);
    const dist = c.match(/(\d+(?:\.\d+)?)\s*(km|kms|k|miles?|mi)\b/);
    const distanceKm = dist ? Math.round(parseFloat(dist[1]) * (dist[2].startsWith('mi') ? 1.609 : 1) * 10) / 10 : undefined;
    const intensity = /\b(easy|light|gentle|slow)\b/.test(c) ? 'easy' : /\b(hard|intense|heavy|tough|fast)\b/.test(c) ? 'hard' : undefined;
    if (best) {
      out.push({
        phrase: c,
        kind: best.kind,
        activityId: best.id,
        activityName: best.name,
        durationMin: minutes,
        distanceKm,
        value: best.trackingType === 'check' || best.trackingType === 'avoid' ? 1 : minutes,
        intensity,
        confidence: minutes || best.trackingType === 'check' ? 0.75 : 0.5,
      });
    } else if (minutes) {
      out.push({ phrase: c, kind: 'unknown', activityId: null, activityName: c.replace(/\b(for|i|did|some|about)\b/g, '').replace(/\d.*$/, '').trim() || c, durationMin: minutes, distanceKm, confidence: 0.3 });
    }
  }
  return out;
}
