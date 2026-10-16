import {
  sanitizeActivityEntries,
  sanitizeFoodItems,
  sanitizeIdeas,
  validateSummary,
  type Fact,
  type MealIdea,
  type MealName,
  type ParsedActivityEntry,
  type ParsedFoodItem,
  type SuggestRequest,
  type SummaryRequest,
  type SummaryWire,
} from '@shared/sanitize';
import { repo } from '@/db';
import { parseFoodTextLocally } from '@/domain/localFoodParser';

/**
 * Browser side of the AI proxy. Every call has a timeout, validates the response again with the shared
 * sanitisers, and degrades gracefully: callers always get a usable result or a typed failure they can
 * fall back from — never a blank screen.
 */

const TIMEOUT_MS = 30_000;

export type AIFailure = 'offline' | 'disabled' | 'unavailable' | 'rate_limited' | 'error';

export class AIUnavailable extends Error {
  constructor(readonly reason: AIFailure, message?: string) {
    super(message ?? reason);
  }
}

export function failureMessage(reason: AIFailure): string {
  switch (reason) {
    case 'offline':
      return 'You’re offline, so we used the built-in food list.';
    case 'disabled':
      return 'AI is turned off in Settings, so we used the built-in food list.';
    case 'unavailable':
      return 'AI isn’t set up on the server, so we used the built-in food list.';
    case 'rate_limited':
      return 'AI is busy right now, so we used the built-in food list.';
    default:
      return 'AI didn’t respond properly, so we used the built-in food list.';
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AIUnavailable('offline');
  const settings = await repo.getSettings();
  if (!settings.aiEnabled) throw new AIUnavailable('disabled');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (res.status === 503 && err.error === 'ai_unavailable') throw new AIUnavailable('unavailable', err.message);
      if (res.status === 429 || err.error === 'ai_rate_limited') throw new AIUnavailable('rate_limited', err.message);
      throw new AIUnavailable('error', err.message);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof AIUnavailable) throw e;
    throw new AIUnavailable(navigator.onLine === false ? 'offline' : 'error', String(e));
  } finally {
    clearTimeout(t);
  }
}

async function hashKey(s: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // insecure context: simple FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16) + s.length;
  }
}

export interface FoodParseResult {
  items: ParsedFoodItem[];
  source: 'ai' | 'offline';
  fallbackReason?: AIFailure;
}

/** Free text → items. AI first (cached locally for identical text), local database as the fallback. */
export async function parseFood(text: string, opts: { diet?: string; defaultMeal?: MealName } = {}): Promise<FoodParseResult> {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const key = await hashKey(`food|${opts.defaultMeal ?? ''}|${opts.diet ?? ''}|${normalized.toLowerCase()}`);
  const cached = await repo.getParseCache(key);
  if (cached) return { items: cached.result as ParsedFoodItem[], source: 'ai' };
  try {
    const res = await post<{ items: unknown }>('/api/parse-food', { text: normalized, diet: opts.diet, defaultMeal: opts.defaultMeal });
    const items = sanitizeFoodItems(res);
    if (!items.length) throw new AIUnavailable('error', 'empty');
    await repo.putParseCache({ key, kind: 'food', result: items, createdAt: Date.now() });
    return { items, source: 'ai' };
  } catch (e) {
    const reason = e instanceof AIUnavailable ? e.reason : 'error';
    return { items: parseFoodTextLocally(normalized, opts.defaultMeal ?? 'other'), source: 'offline', fallbackReason: reason };
  }
}

export async function parseActivityAI(text: string, activities: { id: string; name: string; kind: 'workout' | 'habit'; unit?: string }[]): Promise<ParsedActivityEntry[]> {
  const res = await post<{ entries: unknown }>('/api/parse-activity', { text, activities });
  return sanitizeActivityEntries(res, new Set(activities.map((a) => a.id)));
}

/** AI phrasing for summaries. Re-validates grounding client-side; throws if anything is off. */
export async function phraseSummary(req: SummaryRequest): Promise<SummaryWire> {
  const res = await post<{ summary: SummaryWire }>('/api/summary', req);
  const s = res.summary;
  if (!s || !Array.isArray(s.wins)) throw new AIUnavailable('error', 'malformed summary');
  const v = validateSummary(s, req.facts as Fact[]);
  if (!v.ok) throw new AIUnavailable('error', v.problems.join('; '));
  return s;
}

export async function suggestMeals(req: SuggestRequest): Promise<MealIdea[]> {
  const res = await post<{ ideas: unknown }>('/api/suggest', req);
  return sanitizeIdeas(res);
}

export async function aiHealth(): Promise<{ ai: boolean }> {
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
    return (await r.json()) as { ai: boolean };
  } catch {
    return { ai: false };
  }
}
