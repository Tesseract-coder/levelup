import { beforeAll, describe, expect, it } from 'vitest';
import { LevelUpDB } from '@/db/dexie';
import { DexieRepository } from '@/db/dexieRepository';
import { seedDemoData } from '@/dev/seed';
import { addDays, todayKey, startOfWeek } from '@/domain/dates';
import { calorieAdherence, computeRangeStats, proteinAdherence, sleepAdherence } from '@/domain/stats';
import { buildRuleSummary } from '@/domain/rulesSummary';
import { ungroundedNumbers } from '@shared/sanitize';
import type { RangeData } from '@/db/repository';
import type { Goal } from '@/db/types';

describe('score components', () => {
  it('calorie adherence: full within ±10%, zero beyond ±35%', () => {
    expect(calorieAdherence(2000, 2000)).toBe(1);
    expect(calorieAdherence(2200, 2000)).toBe(1);
    expect(calorieAdherence(2700, 2000)).toBe(0);
    expect(calorieAdherence(2450, 2000)).toBeCloseTo(0.5); // 22.5% off → halfway down the fade
  });
  it('protein and sleep adherence', () => {
    expect(proteinAdherence(90, 100)).toBe(1);
    expect(proteinAdherence(45, 100)).toBeCloseTo(0.5);
    expect(sleepAdherence(7.1, 7.5)).toBe(1);
    expect(sleepAdherence(4.5, 7.5)).toBe(0);
  });
});

describe('range stats + rule summary on demo data', () => {
  const repo = new DexieRepository(new LevelUpDB('test-score'));
  const today = todayKey();
  let data: RangeData;
  let goal: Goal;
  const settings = { graceDaysPerWeek: 1, weekStartsOn: 1 as const };
  beforeAll(async () => {
    await seedDemoData(repo, 45);
    data = await repo.rangeData(addDays(today, -200), today);
    goal = (await repo.getActiveGoal())!;
  });

  it('computes a 0–100 score whose breakdown explains it', () => {
    const ws = startOfWeek(addDays(today, -7), 1);
    const s = computeRangeStats(ws, addDays(ws, 6), data, goal, settings, today);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    const inc = s.breakdown.filter((b) => b.score != null);
    const expected = Math.round((inc.reduce((t, b) => t + b.weight * b.score!, 0) / inc.reduce((t, b) => t + b.weight, 0)) * 100);
    expect(s.score).toBe(expected);
    // totals match the raw data
    const food = data.food.filter((f) => f.date >= ws && f.date <= addDays(ws, 6));
    const days = new Set(food.map((f) => f.date));
    expect(s.nutrition.loggedDays).toBe(days.size);
  });

  it('every number in rule-based text is grounded in the facts', () => {
    for (let w = 1; w <= 4; w++) {
      const ws = startOfWeek(addDays(today, -7 * w), 1);
      const s = computeRangeStats(ws, addDays(ws, 6), data, goal, settings, today);
      const prev = computeRangeStats(addDays(ws, -7), addDays(ws, -1), data, goal, settings, today);
      const r = buildRuleSummary('week', s, prev);
      expect(r.wins.length).toBeGreaterThanOrEqual(2);
      expect(r.improvements.length).toBeGreaterThanOrEqual(1);
      expect(r.nextFocus.text).toBeTruthy();
      for (const line of [...r.wins, ...r.misses, ...r.improvements]) expect(ungroundedNumbers(line.text, r.facts), line.text).toEqual([]);
    }
    for (let d = 0; d < 10; d++) {
      const day = addDays(today, -d);
      const r = buildRuleSummary('day', computeRangeStats(day, day, data, goal, settings, today), null);
      for (const line of [...r.wins, ...r.misses, ...r.improvements]) expect(ungroundedNumbers(line.text, r.facts), line.text).toEqual([]);
    }
  });

  it('never uses shaming words', () => {
    const ws = startOfWeek(addDays(today, -7), 1);
    const r = buildRuleSummary('week', computeRangeStats(ws, addDays(ws, 6), data, goal, settings, today), null);
    const all = [...r.wins, ...r.misses, ...r.improvements].map((x) => x.text).join(' ');
    expect(all).not.toMatch(/fail|bad day|lazy|shame/i);
  });
});

import { SummaryRequest } from '@shared/schemas';
describe('AI summary request', () => {
  it('rule output always fits the API contract', async () => {
    const repo = new DexieRepository(new LevelUpDB('test-contract'));
    await seedDemoData(repo, 30);
    const today = todayKey();
    const data = await repo.rangeData(addDays(today, -200), today);
    const goal = (await repo.getActiveGoal())!;
    const ws = startOfWeek(addDays(today, -7), 1);
    for (const [kind, s, e] of [['day', today, today], ['week', ws, addDays(ws, 6)]] as const) {
      const r = buildRuleSummary(kind, computeRangeStats(s, e, data, goal, { graceDaysPerWeek: 1, weekStartsOn: 1 }, today), null);
      expect(SummaryRequest.safeParse({ kind, goal: 'Lose fat', facts: r.facts, candidates: r.candidates }).success).toBe(true);
    }
  });
});
