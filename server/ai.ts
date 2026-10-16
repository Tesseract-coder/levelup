import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { createHash } from 'node:crypto';
import type { z } from 'zod';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const TIMEOUT_MS = 45_000;

let client: Anthropic | null = null;
export function aiConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
function getClient() {
  // SDK retries are disabled; we do exactly one retry ourselves (also on schema failures).
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  return client;
}

export class AIError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code = 'ai_error',
  ) {
    super(message);
  }
}

// ---------------------------------------------------------- tiny LRU cache
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MAX = 300;
const CACHE_TTL = 6 * 3600_000;
export function cacheKey(...parts: unknown[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
function cacheGet(k: string) {
  const hit = cache.get(k);
  if (!hit || Date.now() - hit.at > CACHE_TTL) return undefined;
  cache.delete(k);
  cache.set(k, hit);
  return hit.value;
}
function cacheSet(k: string, value: unknown) {
  cache.set(k, { at: Date.now(), value });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

/**
 * One structured-output call: the model must return JSON matching `schema`.
 * `validate` lets callers reject semantically-bad output (e.g. ungrounded numbers), which triggers the single retry.
 */
export async function structured<S extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  validate?: (v: z.infer<S>) => string | null;
  cacheId?: string;
}): Promise<{ value: z.infer<S>; model: string; cached: boolean }> {
  if (!aiConfigured()) throw new AIError('AI is not configured on the server', 503, 'ai_unavailable');
  if (opts.cacheId) {
    const hit = cacheGet(opts.cacheId);
    if (hit !== undefined) return { value: hit as z.infer<S>, model: MODEL, cached: true };
  }
  let lastErr: unknown;
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await getClient().beta.messages.parse({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
        output_config: { format: betaZodOutputFormat(opts.schema), effort: opts.effort ?? 'low' },
        messages: [{ role: 'user', content: feedback ? `${opts.user}\n\n${feedback}` : opts.user }],
      });
      if (res.stop_reason === 'refusal') throw new AIError('The model declined this request', 422, 'ai_refused');
      if (res.stop_reason === 'max_tokens') throw new AIError('Response was cut off', 502, 'ai_truncated');
      const value = res.parsed_output as z.infer<S> | null;
      if (!value) throw new AIError('Model returned malformed JSON', 502, 'ai_malformed');
      const problem = opts.validate?.(value);
      if (problem) {
        feedback = `Your previous answer was rejected: ${problem}. Fix this and answer again.`;
        throw new AIError(`Validation failed: ${problem}`, 502, 'ai_invalid');
      }
      if (opts.cacheId) cacheSet(opts.cacheId, value);
      return { value, model: res.model, cached: false };
    } catch (e) {
      lastErr = e;
      if (e instanceof AIError && e.code === 'ai_refused') throw e;
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AIError('AI credentials were rejected', 503, 'ai_unavailable');
      if (e instanceof Anthropic.BadRequestError) throw new AIError(`AI request rejected: ${e.message}`, 502, 'ai_bad_request');
      // RateLimit / 5xx / connection / timeout / malformed → one retry
    }
  }
  if (lastErr instanceof AIError) throw lastErr;
  if (lastErr instanceof Anthropic.RateLimitError) throw new AIError('AI is busy, try again shortly', 503, 'ai_rate_limited');
  if (lastErr instanceof Anthropic.APIConnectionTimeoutError) throw new AIError('AI timed out', 504, 'ai_timeout');
  throw new AIError('AI request failed', 502, 'ai_error');
}

export { MODEL };
