import { repo } from '@/db';
import type { DateKey, Summary, SummaryItem } from '@/db/types';
import { addDays, endOfWeek, startOfWeek } from '@/domain/dates';
import { computeRangeStats } from '@/domain/stats';
import { buildRuleSummary } from '@/domain/rulesSummary';
import { GOAL_LABELS } from '@/domain/targets';
import { phraseSummary } from '@/lib/ai';

export function summaryRange(kind: 'day' | 'week', date: DateKey, weekStartsOn: 0 | 1) {
  if (kind === 'day') return { start: date, end: date, prevStart: addDays(date, -1), prevEnd: addDays(date, -1) };
  const start = startOfWeek(date, weekStartsOn);
  return { start, end: endOfWeek(date, weekStartsOn), prevStart: addDays(start, -7), prevEnd: addDays(start, -1) };
}

/**
 * Build a summary: deterministic stats → rule-based draft → (optional) AI phrasing that is
 * re-validated for grounded numbers and tone. Any AI problem silently falls back to the rules.
 */
export async function generateSummary(kind: 'day' | 'week', date: DateKey, today: DateKey, opts: { useAI?: boolean } = {}): Promise<Summary> {
  const settings = await repo.getSettings();
  const goal = (await repo.getActiveGoal()) ?? null;
  const { start, end, prevStart, prevEnd } = summaryRange(kind, date, settings.weekStartsOn);
  const data = await repo.rangeData(addDays(prevStart, -180), end);
  const stats = computeRangeStats(start, end, data, goal, settings, today);
  const prev = computeRangeStats(prevStart, prevEnd, data, goal, settings, today);
  const rules = buildRuleSummary(kind, stats, prev);

  let wins: SummaryItem[] = rules.wins;
  let misses: SummaryItem[] = rules.misses;
  let improvements: SummaryItem[] = rules.improvements;
  let focusText = rules.nextFocus.text;
  let generatedBy: Summary['generatedBy'] = 'rules';

  if ((opts.useAI ?? true) && settings.aiEnabled) {
    try {
      const goalText = goal ? (goal.type === 'custom' ? goal.customText ?? 'custom goal' : GOAL_LABELS[goal.type].label) : 'general fitness';
      const ai = await phraseSummary({ kind, goal: goalText, facts: rules.facts, candidates: rules.candidates });
      if (ai.wins.length >= 1 && ai.improvements.length >= 1) {
        wins = ai.wins.slice(0, 4);
        misses = ai.misses.slice(0, 4);
        improvements = ai.improvements.slice(0, 3);
        focusText = ai.next_focus.text || focusText;
        generatedBy = 'ai';
      }
    } catch {
      /* rule-based fallback already in place */
    }
  }

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
    wins,
    misses,
    improvements,
    // keep the one-tap habit from the rules even when AI rephrases the focus text
    nextFocus: { ...rules.nextFocus, text: focusText, accepted: existing?.nextFocus.accepted },
    generatedBy,
    generatedAt: Date.now(),
  };
  await repo.saveSummary(summary);
  return summary;
}
