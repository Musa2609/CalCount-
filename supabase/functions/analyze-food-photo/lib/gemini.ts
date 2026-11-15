import { HttpError } from './errors.ts';
import type { FetchLike } from './types.ts';

/**
 * Google Gemini Developer API transport.
 *
 * Sends the (already validated) image to a vision-capable Gemini model with a
 * JSON response MIME type so the reply is machine-readable.
 *
 * The API key travels in the `x-goog-api-key` request header, as Google's
 * documentation specifies — never in the URL, so it cannot leak through a
 * logged URL, a proxy access log or an error message.
 */
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_API_KEY_HEADER = 'x-goog-api-key';
export const DEFAULT_VISION_MODEL = 'gemini-2.5-flash-lite';
export const MAX_ITEMS_PER_PHOTO = 8;
export const DEFAULT_GEMINI_TIMEOUT_MS = 45_000;
export const DEFAULT_RETRY_AFTER_SECONDS = 15;

export const FOOD_ANALYSIS_PROMPT = [
  'You analyse one photo of food or drink for a calorie-tracking app.',
  '',
  'Rules:',
  '- List every distinct food or drink you can actually see as a separate item.',
  '- Do not invent items, brands, sides or condiments. If the photo contains no food or drink, return {"items": []}.',
  '- grams is your best estimate of the edible portion of that item as served, not the size of the whole plate.',
  '- confidence is 0-1: how sure you are of both the name and the portion. Use lower values for mixed dishes, hidden oils and stacked plates.',
  '- caloriesPer100g, proteinPer100g, carbsPer100g and fatPer100g are typical values per 100 g of the food as prepared. Use 0 when a macro is negligible. Always provide a number.',
  '- ingredients: only ingredients you can visually identify (for example visible rice, egg, sauce). Use [] when none are visible.',
  '- category: a short label such as poultry, seafood, grain, vegetable, fruit, dairy, legume, nuts, dessert, beverage or mixed dish.',
  '- notes: one short sentence naming what makes the estimate uncertain, or "" when it is straightforward.',
  '- Be conservative and honest. A smaller, uncertain list is better than a detailed invented one.',
].join('\n');

export interface IdentifyFoodsArgs {
  base64: string;
  mimeType: string;
  apiKey: string;
  model: string;
  fetchImpl: FetchLike;
  timeoutMs?: number;
  endpoint?: string;
  baseUrl?: string;
}

export interface IdentifyFoodsResult {
  items: unknown[];
  model: string;
  responseId: string | null;
}

/**
 * `POST .../models/<model>:generateContent` with no query string. The key is
 * sent separately as a header, so this URL is safe to log.
 */
export function buildGeminiEndpoint(model: string, baseUrl?: string): string {
  const root = (baseUrl ?? GEMINI_API_BASE_URL).replace(/\/+$/, '');
  return `${root}/models/${encodeURIComponent(model)}:generateContent`;
}

/**
 * Removes API keys from any string destined for a log line or an error object.
 * Defence in depth: the key is never put in a URL or message in the first
 * place, this only guards against an upstream echoing it back.
 */
export function redactSecrets(text: string, secrets: string[] = []): string {
  let output = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) output = output.split(secret).join('[redacted]');
  }
  return output
    .replace(/([?&]key=)[^&\s"'#]+/gi, '$1[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted]');
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  onTimeout: () => HttpError,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw onTimeout();
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('abort')) throw onTimeout();
    throw new HttpError(
      502,
      'vision_failed',
      'Could not reach the vision service. Please try again.',
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `exhausted` — a quota/billing allowance is spent; retrying will not help.
 * `transient` — a rate limit (requests or tokens per minute); retrying helps.
 */
export type QuotaKind = 'exhausted' | 'transient';

export interface UpstreamFailure {
  /** Gemini's `error.status` or OpenAI's `error.type`. */
  type: string | null;
  /** First structured reason/violation id found in `error.details`. */
  code: string | null;
  message: string | null;
  /** From `google.rpc.QuotaFailure` / `google.rpc.RetryInfo` + message. */
  quotaKind: QuotaKind | null;
  /** The `violations[].quotaId` / `quotaMetric` that decided `quotaKind`. */
  quotaId: string | null;
  /** `google.rpc.RetryInfo.retryDelay`, in seconds. */
  retryDelaySeconds: number | null;
}

const EMPTY_FAILURE: UpstreamFailure = {
  type: null,
  code: null,
  message: null,
  quotaKind: null,
  quotaId: null,
  retryDelaySeconds: null,
};

/** Accepts "51s", "0.5s", "250ms", "2m", "8h" or a bare number of seconds. */
export function parseDurationSeconds(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const match = /^\s*([\d.]+)\s*(ms|s|m|h)?\s*$/i.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  switch ((match[2] ?? 's').toLowerCase()) {
    case 'ms':
      return amount / 1000;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3600;
    default:
      return amount;
  }
}

/**
 * Reads a quota id/metric such as
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier` (daily allowance) or
 * `GenerateRequestsPerMinutePerProjectPerModel-FreeTier` (momentary limit).
 * A daily allowance wins when an error mentions both.
 */
function classifyQuotaText(value: string): QuotaKind | null {
  if (/(per[_\s-]?day|perday|daily|\brpd\b|\btpd\b|per[_\s-]?month|permonth)/i.test(value)) {
    return 'exhausted';
  }
  if (/(per[_\s-]?minute|per[_\s-]?second|perminute|persec|\brpm\b|\brps\b|\btpm\b|\bqps\b)/i.test(value)) {
    return 'transient';
  }
  return null;
}

export function readUpstreamFailure(raw: string, secrets: string[] = []): UpstreamFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...EMPTY_FAILURE };
  }
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY_FAILURE };

  const error = (parsed as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return { ...EMPTY_FAILURE };
  const record = error as Record<string, unknown>;

  const type =
    typeof record.status === 'string'
      ? record.status
      : typeof record.type === 'string'
        ? record.type
        : null;
  const message =
    typeof record.message === 'string' ? redactSecrets(record.message, secrets) : null;

  let code: string | null = null;
  let retryDelaySeconds: number | null = null;
  const violations: string[] = [];

  if (Array.isArray(record.details)) {
    for (const detail of record.details) {
      if (!detail || typeof detail !== 'object') continue;
      const entry = detail as Record<string, unknown>;
      if (!code && typeof entry.reason === 'string' && entry.reason.trim()) {
        code = entry.reason.trim();
      }
      if (retryDelaySeconds === null) {
        const delay = parseDurationSeconds(entry.retryDelay);
        if (delay !== null) retryDelaySeconds = delay;
      }
      if (Array.isArray(entry.violations)) {
        for (const violation of entry.violations) {
          if (!violation || typeof violation !== 'object') continue;
          const fields = violation as Record<string, unknown>;
          for (const key of ['quotaId', 'quotaMetric']) {
            const value = fields[key];
            if (typeof value === 'string' && value.trim()) violations.push(value.trim());
          }
        }
      }
    }
  }

  if (!code && typeof record.code === 'string') code = record.code;
  if (!code && typeof record.type === 'string') code = record.type;
  if (!code && typeof record.status === 'string') code = record.status;

  // Structured quota signals first: they name the exact allowance.
  let quotaKind: QuotaKind | null = null;
  let quotaId: string | null = null;
  for (const violation of violations) {
    const kind = classifyQuotaText(violation);
    if (kind === 'exhausted') {
      quotaKind = 'exhausted';
      quotaId = violation;
      break;
    }
    if (kind === 'transient' && quotaKind === null) {
      quotaKind = 'transient';
      quotaId = violation;
    }
  }

  const haystack = [code, type, message].filter(Boolean).join(' ').toLowerCase();
  const billingEvidence =
    /insufficient_quota|billing|no credit|payment|exceeded your current quota/.test(haystack);

  // Only structured QuotaFailure ids or explicit billing/quota wording prove a
  // spent allowance. `RetryInfo.retryDelay` says "wait this long", not "this
  // allowance is gone": Google returns long delays for per-minute limits too,
  // so a RetryInfo-only 429 stays a temporary rate limit whatever its size.
  if (billingEvidence && quotaKind !== 'exhausted') {
    quotaKind = 'exhausted';
    // Nothing structured named the spent allowance, so do not attribute it to
    // the per-minute id that happened to be reported.
    quotaId = null;
  } else if (quotaKind === null && retryDelaySeconds !== null) {
    quotaKind = 'transient';
  } else if (quotaKind === null && haystack.trim()) {
    // A plain RESOURCE_EXHAUSTED is far more often a per-minute limit.
    quotaKind = 'transient';
  }

  return { type, code, message, quotaKind, quotaId, retryDelaySeconds };
}

function readRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  // HTTP-date form, e.g. "Wed, 21 Oct 2015 07:28:00 GMT".
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    const delta = Math.ceil((date - Date.now()) / 1000);
    if (delta > 0) return delta;
  }
  return null;
}

export function mapUpstreamStatus(
  status: number,
  failure: UpstreamFailure = EMPTY_FAILURE,
  retryAfterHeader: string | null = null,
  secrets: string[] = [],
): HttpError {
  const label = failure.code ?? failure.type;
  const diagnostic = redactSecrets(
    [String(status), label, failure.quotaId].filter(Boolean).join('/'),
    secrets,
  );
  const haystack = [failure.type, failure.code, failure.message].filter(Boolean).join(' ');

  if (status === 401 || status === 403) {
    return new HttpError(502, 'vision_auth_failed', 'Photo recognition is not available right now. Please try again later.', null, diagnostic);
  }
  if (status === 400 && /api.?key|invalid.*key|permission|unauthenticat|unauthorized/i.test(haystack)) {
    return new HttpError(502, 'vision_auth_failed', 'Photo recognition is not available right now. Please try again later.', null, diagnostic);
  }
  if (status === 429) {
    if (failure.quotaKind === 'exhausted') {
      return new HttpError(503, 'vision_quota_exhausted', 'The AI service has reached its usage limit. Please try again later.', null, diagnostic);
    }
    const retryAfter =
      readRetryAfter(retryAfterHeader) ??
      failure.retryDelaySeconds ??
      DEFAULT_RETRY_AFTER_SECONDS;
    return new HttpError(503, 'vision_busy', 'Photo recognition is busy right now. Please try again in a moment.', retryAfter, diagnostic);
  }
  if (status === 404) {
    return new HttpError(502, 'vision_model_missing', 'Photo recognition is misconfigured on the server.', null, diagnostic);
  }
  if (status === 400 || status === 413 || status === 415) {
    return new HttpError(422, 'invalid_image', 'The vision service could not read that photo. Try a different image.', null, diagnostic);
  }
  return new HttpError(502, 'vision_failed', 'Photo recognition failed. Please try again.', null, diagnostic);
}

export function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;

  const candidates = record.candidates;
  if (Array.isArray(candidates)) {
    const chunks: string[] = [];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const content = (candidate as { content?: unknown }).content;
      if (!content || typeof content !== 'object') continue;
      const parts = (content as { parts?: unknown }).parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          chunks.push((part as { text: string }).text);
        }
      }
    }
    if (chunks.length) return chunks.join('');
  }

  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text;
  }
  const output = record.output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const entry of output as Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.type && entry.type !== 'message') continue;
      if (!Array.isArray(entry.content)) continue;
      for (const part of entry.content) {
        if (part && typeof part === 'object' && part.type === 'output_text' && typeof part.text === 'string') {
          chunks.push(part.text);
        }
      }
    }
    if (chunks.length) return chunks.join('');
  }
  if (typeof record.text === 'string') return record.text;
  return '';
}

export function parseFoodAnalysis(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new HttpError(502, 'vision_invalid_response', 'The vision service returned an empty response. Please try again.');
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new HttpError(502, 'vision_invalid_response', 'The vision service returned an unreadable response. Please try again.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new HttpError(502, 'vision_invalid_response', 'The vision service returned an unexpected response.');
  }
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    throw new HttpError(502, 'vision_invalid_response', 'The vision service returned an unexpected response.');
  }
  return items.slice(0, MAX_ITEMS_PER_PHOTO);
}

export async function identifyFoods(args: IdentifyFoodsArgs): Promise<IdentifyFoodsResult> {
  const endpoint = args.endpoint ?? buildGeminiEndpoint(args.model, args.baseUrl);
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: FOOD_ANALYSIS_PROMPT },
          { inlineData: { mimeType: args.mimeType, data: args.base64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: 1500,
    },
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (args.apiKey) headers[GEMINI_API_KEY_HEADER] = args.apiKey;

  const response = await fetchWithTimeout(
    args.fetchImpl,
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    args.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS,
    () =>
      new HttpError(504, 'vision_timeout', 'Photo analysis took too long. Please try again.'),
  );

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw mapUpstreamStatus(
      response.status,
      readUpstreamFailure(raw, [args.apiKey]),
      response.headers.get('retry-after'),
      [args.apiKey],
    );
  }

  const payload = await response.json().catch(() => null);
  if (!payload) {
    throw new HttpError(502, 'vision_invalid_response', 'The vision service returned an unexpected response.');
  }

  const record = payload as Record<string, unknown>;
  const items = parseFoodAnalysis(extractResponseText(payload));
  return {
    items,
    model: typeof record.modelVersion === 'string' ? record.modelVersion : (typeof record.model === 'string' ? record.model : args.model),
    responseId: typeof record.responseId === 'string' ? record.responseId : (typeof record.id === 'string' ? record.id : null),
  };
}
