import { HttpError } from './errors.ts';
import type { FetchLike } from './types.ts';

/**
 * OpenAI Responses API transport.
 *
 * Sends the (already validated) image to a vision-capable model with a strict
 * JSON schema so the reply is machine-readable instead of prose we would have
 * to scrape. The API key stays in this process; nothing here is ever logged.
 */
export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
export const DEFAULT_VISION_MODEL = 'gpt-4.1-mini';
export const MAX_ITEMS_PER_PHOTO = 8;
export const DEFAULT_OPENAI_TIMEOUT_MS = 45_000;

export const FOOD_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: MAX_ITEMS_PER_PHOTO,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'category',
          'ingredients',
          'grams',
          'confidence',
          'caloriesPer100g',
          'proteinPer100g',
          'carbsPer100g',
          'fatPer100g',
          'notes',
        ],
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          ingredients: { type: 'array', items: { type: 'string' } },
          grams: { type: 'number' },
          confidence: { type: 'number' },
          caloriesPer100g: { type: 'number' },
          proteinPer100g: { type: 'number' },
          carbsPer100g: { type: 'number' },
          fatPer100g: { type: 'number' },
          notes: { type: 'string' },
        },
      },
    },
  },
} as const;

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
}

export interface IdentifyFoodsResult {
  items: unknown[];
  model: string;
  responseId: string | null;
}

interface ResponsesOutputPart {
  type?: string;
  text?: string;
  refusal?: string;
}

interface ResponsesOutputItem {
  type?: string;
  content?: ResponsesOutputPart[];
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

export interface UpstreamFailure {
  type: string | null;
  code: string | null;
}

/**
 * Reads only the machine-readable fields of an OpenAI error body. The message
 * is deliberately dropped: it can echo request details, and it is not needed
 * to tell a rate limit apart from an exhausted quota.
 */
export function readUpstreamFailure(raw: string): UpstreamFailure {
  try {
    const parsed = JSON.parse(raw) as { error?: { type?: unknown; code?: unknown } };
    const error = parsed?.error;
    return {
      type: typeof error?.type === 'string' ? error.type : null,
      code: typeof error?.code === 'string' ? error.code : null,
    };
  } catch {
    return { type: null, code: null };
  }
}

/** OpenAI reports an unfunded account as 429, so the code has to be read. */
const QUOTA_CODES = new Set([
  'insufficient_quota',
  'billing_hard_limit_reached',
  'billing_not_active',
]);

function describeUpstream(status: number, failure: UpstreamFailure): string {
  const detail = failure.code ?? failure.type;
  return detail ? `${status}/${detail}` : String(status);
}

function parseRetryAfter(header: string | null): number {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 15;
}

export function mapUpstreamStatus(
  status: number,
  failure: UpstreamFailure = { type: null, code: null },
  retryAfterHeader: string | null = null,
): HttpError {
  const upstream = describeUpstream(status, failure);
  if (status === 401 || status === 403) {
    return new HttpError(
      502,
      'vision_auth_failed',
      'Photo recognition is not available right now. Please try again later.',
      null,
      upstream,
    );
  }
  if (status === 429) {
    if (failure.code !== null && QUOTA_CODES.has(failure.code)) {
      return new HttpError(
        503,
        'vision_quota_exhausted',
        'Photo recognition is unavailable because the AI account has no credit left.',
        null,
        upstream,
      );
    }
    return new HttpError(
      503,
      'vision_busy',
      'Photo recognition is busy right now. Please try again in a moment.',
      parseRetryAfter(retryAfterHeader),
      upstream,
    );
  }
  if (status === 404) {
    return new HttpError(
      502,
      'vision_model_missing',
      'Photo recognition is misconfigured on the server.',
      null,
      upstream,
    );
  }
  if (status === 400 || status === 413 || status === 415) {
    return new HttpError(
      422,
      'invalid_image',
      'The vision service could not read that photo. Try a different image.',
      null,
      upstream,
    );
  }
  return new HttpError(
    502,
    'vision_failed',
    'Photo recognition failed. Please try again.',
    null,
    upstream,
  );
}

/**
 * Pulls the assistant text out of a Responses API payload. Handles the
 * convenience `output_text` field as well as the raw `output[].content[]` shape.
 */
export function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text;
  }
  const output = record.output;
  if (!Array.isArray(output)) return '';
  const chunks: string[] = [];
  for (const entry of output as ResponsesOutputItem[]) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type && entry.type !== 'message') continue;
    if (!Array.isArray(entry.content)) continue;
    for (const part of entry.content) {
      if (!part || typeof part !== 'object') continue;
      if (part.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('');
}

/**
 * Parses the model's JSON. Structured Outputs should make this exact, but a
 * refusal, a truncated reply or a provider-side regression must not crash the
 * request, so fences and surrounding prose are tolerated and bad JSON becomes
 * a 502 instead of a 500.
 */
export function parseFoodAnalysis(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new HttpError(
      502,
      'vision_invalid_response',
      'The vision service returned an empty response. Please try again.',
    );
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new HttpError(
      502,
      'vision_invalid_response',
      'The vision service returned an unreadable response. Please try again.',
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new HttpError(
      502,
      'vision_invalid_response',
      'The vision service returned an unexpected response.',
    );
  }
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    throw new HttpError(
      502,
      'vision_invalid_response',
      'The vision service returned an unexpected response.',
    );
  }
  return items.slice(0, MAX_ITEMS_PER_PHOTO);
}

export async function identifyFoods(args: IdentifyFoodsArgs): Promise<IdentifyFoodsResult> {
  const endpoint = args.endpoint ?? OPENAI_RESPONSES_URL;
  const body = {
    model: args.model,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: FOOD_ANALYSIS_PROMPT },
          {
            type: 'input_image',
            image_url: `data:${args.mimeType};base64,${args.base64}`,
            detail: 'auto',
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'food_photo_analysis',
        strict: true,
        schema: FOOD_ANALYSIS_SCHEMA,
      },
    },
    max_output_tokens: 1500,
  };

  const response = await fetchWithTimeout(
    args.fetchImpl,
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(body),
    },
    args.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS,
    () =>
      new HttpError(
        504,
        'vision_timeout',
        'Photo analysis took too long. Please try again.',
      ),
  );

  if (!response.ok) {
    // The body is read for its status code only, never surfaced verbatim:
    // upstream error payloads can echo request details.
    const raw = await response.text().catch(() => '');
    throw mapUpstreamStatus(
      response.status,
      readUpstreamFailure(raw),
      response.headers.get('retry-after'),
    );
  }

  const payload = await response.json().catch(() => null);
  if (!payload) {
    throw new HttpError(
      502,
      'vision_invalid_response',
      'The vision service returned an unexpected response.',
    );
  }

  const record = payload as Record<string, unknown>;
  const items = parseFoodAnalysis(extractResponseText(payload));
  return {
    items,
    model: typeof record.model === 'string' ? record.model : args.model,
    responseId: typeof record.id === 'string' ? record.id : null,
  };
}
