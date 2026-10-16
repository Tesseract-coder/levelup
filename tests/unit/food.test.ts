import { describe, expect, it } from 'vitest';
import { parseFoodTextLocally, rescaleItem } from '@/domain/localFoodParser';
import { sanitizeFoodItems, validateSummary, ungroundedNumbers, extractNumbers } from '@shared/sanitize';

const SAMPLE =
  'Breakfast: 2 boiled eggs, 2 slices of brown bread with peanut butter, black coffee. Lunch: 2 rotis, 1 katori dal, mixed veg sabzi, curd. Snack: banana and a handful of almonds. Dinner: paneer bhurji and 1 roti.';

describe('offline food parser', () => {
  const items = parseFoodTextLocally(SAMPLE);
  it('splits meals and items', () => {
    expect(items.map((i) => i.meal)).toEqual([
      'breakfast', 'breakfast', 'breakfast', 'breakfast',
      'lunch', 'lunch', 'lunch', 'lunch',
      'snack', 'snack',
      'dinner', 'dinner',
    ]);
  });
  it('matches Indian foods with household units', () => {
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName['Boiled egg'].quantity).toBe(2);
    expect(byName['Boiled egg'].gramsEst).toBe(100);
    expect(byName['Dal (toor/moong)'].gramsEst).toBe(150);
    expect(byName['Almonds'].unit).toBe('handful');
    expect(items.filter((i) => i.name === 'Roti / chapati').map((i) => i.quantity)).toEqual([2, 1]);
    expect(items.every((i) => i.calories > 0)).toBe(true);
  });
  it('produces a plausible day total', () => {
    const kcal = items.reduce((t, i) => t + i.calories, 0);
    expect(kcal).toBeGreaterThan(1400);
    expect(kcal).toBeLessThan(2400);
  });
  it('flags unknown foods with low confidence', () => {
    const [x] = parseFoodTextLocally('1 bowl of zxqv stew');
    expect(x.confidence).toBeLessThan(0.2);
    expect(x.calories).toBe(0);
  });
  it('handles grams and fractions', () => {
    const [a, b] = parseFoodTextLocally('200g paneer, 1/2 plate biryani');
    expect(a.gramsEst).toBe(200);
    expect(a.calories).toBe(530);
    expect(b.gramsEst).toBe(175);
  });
  it('rescales on quantity edits', () => {
    const r = rescaleItem(items[0], 3);
    expect(r.calories).toBe(Math.round(items[0].calories * 1.5));
  });
});

describe('AI output sanitising', () => {
  it('clamps absurd values and repairs calories from macros', () => {
    const out = sanitizeFoodItems({
      items: [
        { meal: 'lunch', name: 'Dal', quantity: 1, unit: 'katori', grams_estimate: 150, calories: 99999, protein_g: 9, carbs_g: 22, fat_g: 4.5, fiber_g: null, confidence: 3, assumptions: '' },
        { meal: 'brunch', name: '  Roti ', quantity: 'two', unit: '', grams_estimate: -5, calories: 120, protein_g: 3.5, carbs_g: 20, fat_g: 2.5, confidence: 0.8, assumptions: 'medium' },
        { name: '' },
        'garbage',
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].calories).toBe(165); // 4*9 + 4*22 + 9*4.5 (recomputed: 4000 clamp differs >35%)
    expect(out[0].confidence).toBeLessThanOrEqual(0.5);
    expect(out[1].meal).toBe('other');
    expect(out[1].name).toBe('Roti');
    expect(out[1].quantity).toBe(1);
    expect(out[1].unit).toBe('serving');
    expect(out[1].gramsEst).toBe(0);
  });
  it('returns [] for non-JSON shapes', () => {
    expect(sanitizeFoodItems(null)).toEqual([]);
    expect(sanitizeFoodItems('nope')).toEqual([]);
  });
});

describe('summary number grounding', () => {
  const facts = [
    { id: 'protein_days', text: 'Protein target (110 g) hit on 5 of 7 days; average 102% of target' },
    { id: 'sleep_low', text: 'Slept under 6 h on 3 nights; average 6.4 h vs 7.5 h target' },
  ];
  it('extracts numbers incl. commas and decimals', () => {
    expect(extractNumbers('1,800 kcal, 6.5 h, 102%')).toEqual([1800, 6.5, 102]);
  });
  it('accepts grounded text', () => {
    expect(ungroundedNumbers('Protein hit 102% of target on 5 of 7 days', facts)).toEqual([]);
  });
  it('rejects invented numbers', () => {
    expect(ungroundedNumbers('You averaged 95 g protein', facts)).toEqual([95]);
    const v = validateSummary(
      { wins: [{ text: 'Great job, 9 days!', facts: ['protein_days'] }], misses: [], improvements: [], next_focus: { text: 'Sleep 7.5 h', facts: ['sleep_low'] } },
      facts,
    );
    expect(v.ok).toBe(false);
  });
  it('rejects shaming tone', () => {
    const v = validateSummary(
      { wins: [], misses: [{ text: 'You failed at sleep', facts: [] }], improvements: [], next_focus: { text: 'Sleep more', facts: [] } },
      facts,
    );
    expect(v.ok).toBe(false);
  });
});

import { parseActivityLocally } from '@/domain/localActivityParser';
import { HABIT_PRESETS, WORKOUT_PRESETS, presetToDef } from '@/domain/presets';

describe('offline activity parser', () => {
  const defs = [...WORKOUT_PRESETS, ...HABIT_PRESETS].map((p, i) => presetToDef(p, i));
  it('parses the spec example', () => {
    const e = parseActivityLocally('Today I cycled 40 min, learned React for 1 hour, slept 6.5 hrs', defs);
    expect(e.map((x) => [x.activityName, x.durationMin ?? x.value])).toEqual([
      ['Cycling', 40],
      ['Learning something new', 60],
      ['Sleep', 6.5],
    ]);
  });
  it('handles water, steps and distance', () => {
    const e = parseActivityLocally('ran 5 km in 32 mins; drank 2 L water; 9,500 steps', defs);
    expect(e[0]).toMatchObject({ activityName: 'Running', durationMin: 32, distanceKm: 5 });
    expect(e[1]).toMatchObject({ kind: 'water', value: 2000 });
    expect(e[2]).toMatchObject({ activityName: 'Steps', value: 9500 });
  });
});
