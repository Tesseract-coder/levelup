import { repo } from '@/db';
import type { DateKey, Summary } from '@/db/types';
import { addDays, endOfWeek, startOfWeek } from '@/domain/dates';
import { computeRangeStats } from '@/domain/stats';
import { buildRuleSummary } from '@/domain/rulesSummary';

export function summaryRange(kind: 'day' | 'week', date: DateKey, weekStartsOn: 0 | 1) {
  if (kind === 'day') return { start: date, end: date, prevStart: addDays(date, -1), prevEnd: addDays(date, -1) };
  const start = startOfWeek(date, weekStartsOn);
  return { start, end: endOfWeek(date, weekStartsOn), prevStart: addDays(start, -7), prevEnd: addDays(start, -1) };
}

/** Build a summary entirely on the device: deterministic stats → rule-based, goal-aware commentary. */
export async function generateSummary(kind: 'day' | 'week', date: DateKey, today: DateKey): Promise<Summary> {
  const settings = await repo.getSettings();
  const goal = (await repo.getActiveGoal()) ?? null;
  const { start, end, prevStart, prevEnd } = summaryRange(kind, date, settings.weekStartsOn);
  const data = await repo.rangeData(addDays(prevStart, -180), end);
  const stats = computeRangeStats(start, end, data, goal, settings, today);
  const prev = computeRangeStats(prevStart, prevEnd, data, goal, settings, today);
  const rules = buildRuleSummary(kind, stats, prev);

  const id = `${kind}:${start}`;
  const existing = await repo.getSummary(id);
  const summary: Summary = {
    id,
    kind,
    rangeStart: start,
    rangeEnd: end,
    stats,
    score: stats.score,
    breakdown: stats.breakdown,
    wins: rules.wins,
    misses: rules.misses,
    improvements: rules.improvements,
    nextFocus: { ...rules.nextFocus, accepted: existing?.nextFocus.accepted },
    facts: rules.facts,
    generatedBy: 'rules',
    generatedAt: Date.now(),
  };
  await repo.saveSummary(summary);
  return summary;
}
