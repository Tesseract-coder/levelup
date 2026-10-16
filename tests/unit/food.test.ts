import { describe, expect, it } from 'vitest';
import { parseFoodTextLocally, rescaleItem } from '@/domain/localFoodParser';
import { ungroundedNumbers, extractNumbers } from '@/domain/rulesSummary';

const SAMPLE =
  'Breakfast: 2 boiled eggs, 2 slices of brown bread with peanut butter, black coffee. Lunch: 2 rotis, 1 katori dal, mixed veg sabzi, curd. Snack: banana and a handful of almonds. Dinner: paneer bhurji and 1 roti.';

describe('food parser', () => {
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

describe('summary numbers are backed by stats', () => {
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
  });
});

import { parseActivityLocally } from '@/domain/localActivityParser';
import { HABIT_PRESETS, WORKOUT_PRESETS, presetToDef } from '@/domain/presets';

describe('activity note parser', () => {
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
