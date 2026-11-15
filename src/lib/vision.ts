import { appEnv, isVisionConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase/client';

/**
 * Photo-based food recognition — client for the `analyze-food-photo` Edge
 * Function.
 *
 * The app ships NO vision model and never fabricates a result. The photo goes
 * to the Edge Function (which holds GEMINI_API_KEY and USDA_API_KEY); the app
 * authenticates with the user's Supabase access token and shows the response
 * for review before anything is logged.
 *
 * Expected contract (POST, JSON):
 *   Request:  { image: string /* base64 *\/, mimeType: string }
 *   Headers:  Authorization: Bearer <supabase access token>
 *   Response: { "items": [ { "name": string, "grams": number,
 *                           "caloriesPer100g": number, "proteinPer100g": number,
 *                           "carbsPer100g": number, "fatPer100g": number,
 *                           "confidence"?: number,
 *                           "nutritionSource"?: "usda" | "ai_estimate",
 *                           "matchedFoodName"?: string, "fdcId"?: number,
 *                           "fiberPer100g"?: number, "category"?: string,
 *                           "ingredients"?: string[], "notes"?: string } ],
 *               "warnings"?: string[] }
 *
 * Only the original fields are required, so an endpoint that predates the
 * USDA matching still validates. Everything is range-checked, so a broken or
 * hostile endpoint can never inject nonsense into the diary.
 */

export type VisionNutritionSource = 'usda' | 'ai_estimate';

export interface VisionItem {
  name: string;
  grams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  confidence: number | null;
  /** Present when the backend matched the item against USDA FoodData Central. */
  fiberPer100g: number | null;
  category: string | null;
  ingredients: string[];
  nutritionSource: VisionNutritionSource | null;
  matchedFoodName: string | null;
  fdcId: number | null;
  notes: string | null;
}

export interface VisionResult {
  items: VisionItem[];
  warnings: string[];
}

export class VisionNotConfiguredError extends Error {
  constructor() {
    super(
      'Photo recognition is not connected in this build. Add EXPO_PUBLIC_VISION_API_URL to enable it.',
    );
    this.name = 'VisionNotConfiguredError';
  }
}

/**
 * The service answered correctly but saw no food. This is an empty result, not
 * a failure, so the screen can offer a retry instead of an error.
 */
export class VisionEmptyError extends Error {
  constructor(message = 'No food was recognised in that photo.') {
    super(message);
    this.name = 'VisionEmptyError';
  }
}

/**
 * A rejection from the Edge Function. It keeps the server's `code` and retry
 * delay so the screen can respect a real cooldown instead of inviting an
 * immediate retry that the service will only reject again.
 */
export class VisionServiceError extends Error {
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: { code?: string | null; retryAfterSeconds?: number | null } = {},
  ) {
    super(message);
    this.name = 'VisionServiceError';
    this.code = options.code ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

export const visionEnabled = isVisionConfigured;

/** The Edge Function waits on Gemini + USDA, so the client must be patient. */
const REQUEST_TIMEOUT_MS = 75_000;

function readNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`The vision response is missing a valid "${key}" value.`);
  }
  return parsed;
}

function readOptionalNumber(input: Record<string, unknown>, key: string): number | null {
  const value = input[key];
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function readOptionalString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 160) : null;
}

function readStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, 40))
    .slice(0, 8);
}

function readNutritionSource(input: Record<string, unknown>): VisionNutritionSource | null {
  const value = input.nutritionSource;
  return value === 'usda' || value === 'ai_estimate' ? value : null;
}

export function parseVisionResponse(payload: unknown): VisionItem[] {
  if (!payload || typeof payload !== 'object' || !('items' in payload)) {
    throw new Error('The vision endpoint returned an unexpected response.');
  }
  const items = (payload as { items: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new VisionEmptyError();
  }
  return items.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('The vision endpoint returned an unexpected item.');
    }
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) throw new Error('A recognised item is missing a name.');
    const confidence = record.confidence;
    return {
      name,
      grams: Math.max(1, readNumber(record, 'grams')),
      caloriesPer100g: readNumber(record, 'caloriesPer100g'),
      proteinPer100g: readNumber(record, 'proteinPer100g'),
      carbsPer100g: readNumber(record, 'carbsPer100g'),
      fatPer100g: readNumber(record, 'fatPer100g'),
      confidence:
        typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : null,
      fiberPer100g: readOptionalNumber(record, 'fiberPer100g'),
      category: readOptionalString(record, 'category'),
      ingredients: readStringArray(record, 'ingredients'),
      nutritionSource: readNutritionSource(record),
      matchedFoodName: readOptionalString(record, 'matchedFoodName'),
      fdcId: readOptionalNumber(record, 'fdcId'),
      notes: readOptionalString(record, 'notes'),
    };
  });
}

function readWarnings(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const value = (payload as { warnings?: unknown }).warnings;
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, 220))
    .slice(0, 8);
}

export function parseVisionResult(payload: unknown): VisionResult {
  return { items: parseVisionResponse(payload), warnings: readWarnings(payload) };
}

/**
 * Prefers the signed-in user's access token (the Edge Function verifies it),
 * falling back to EXPO_PUBLIC_VISION_API_KEY for self-hosted endpoints.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      return headers;
    }
  } catch {
    // Supabase not configured on this build: fall through to the optional key.
  }
  if (appEnv.visionApiKey) headers.Authorization = `Bearer ${appEnv.visionApiKey}`;
  return headers;
}

/** Reads `Retry-After`, which the server sends as seconds (RFC-date also works). */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return seconds > 0 ? Math.ceil(seconds) : null;
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) {
    const delta = Math.ceil((date - Date.now()) / 1000);
    if (delta > 0) return delta;
  }
  return null;
}

/** The body value wins; the `Retry-After` header is the fallback. */
function readRetrySeconds(body: unknown, retryAfterHeader: string | null | undefined): number | null {
  if (body && typeof body === 'object') {
    const value = (body as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.ceil(value);
    const fromBody = parseRetryAfter(typeof value === 'string' ? value : null);
    if (fromBody !== null) return fromBody;
  }
  return parseRetryAfter(retryAfterHeader);
}

function readErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as { code?: unknown }).code;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 60) : null;
}

/** "in a moment" under a minute, then minutes, then hours. */
export function formatRetryDelay(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  if (safe < 60) return 'in a moment';
  if (safe < 3600) {
    const minutes = Math.max(1, Math.ceil(safe / 60));
    return `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  const hours = Math.max(1, Math.round(safe / 3600));
  return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

export interface VisionRetryPolicy {
  /** `false` when another attempt cannot succeed, e.g. a spent daily quota. */
  allowsRetry: boolean;
  /** How long the screen must wait before another attempt; 0 means now. */
  cooldownMs: number;
}

export function retryPolicyFor(error: unknown): VisionRetryPolicy {
  if (error instanceof VisionServiceError) {
    if (error.code === 'vision_quota_exhausted') return { allowsRetry: false, cooldownMs: 0 };
    const seconds = error.retryAfterSeconds;
    if (seconds !== null && seconds > 0) {
      return { allowsRetry: true, cooldownMs: Math.round(seconds * 1000) };
    }
  }
  return { allowsRetry: true, cooldownMs: 0 };
}

export function errorForStatus(
  status: number,
  body: unknown,
  retryAfterHeader: string | null = null,
): VisionServiceError {
  const message =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? ((body as { error: string }).error.length <= 240
          ? (body as { error: string }).error
          : (body as { error: string }).error.slice(0, 240))
      : null;
  const code = readErrorCode(body);
  const retryAfterSeconds = readRetrySeconds(body, retryAfterHeader);
  const options = { code, retryAfterSeconds };

  if (code === 'vision_quota_exhausted') {
    return new VisionServiceError(
      message ?? 'Photo recognition has reached its AI usage limit. Please try again later.',
      options,
    );
  }
  if (code === 'vision_busy' || code === 'busy') {
    // The server says "in a moment"; a long Retry-After must not repeat that.
    const prefix =
      code === 'busy'
        ? 'Photo recognition is at capacity right now.'
        : 'Photo recognition is busy right now.';
    return new VisionServiceError(
      retryAfterSeconds !== null
        ? `${prefix} Please try again ${formatRetryDelay(retryAfterSeconds)}.`
        : (message ?? `${prefix} Please try again in a moment.`),
      options,
    );
  }
  if (status === 401 || status === 403) {
    return new VisionServiceError('Your session expired. Sign in again to analyse a photo.', options);
  }
  if (status === 404) {
    return new VisionServiceError('Photo recognition is not deployed for this project yet.', options);
  }
  if (status === 413) {
    return new VisionServiceError(message ?? 'That photo is too large. Try a smaller image.', options);
  }
  if (status === 429) {
    return new VisionServiceError(
      retryAfterSeconds !== null
        ? `You have analysed a lot of photos in a short time. Please try again ${formatRetryDelay(
            retryAfterSeconds,
          )}.`
        : (message ?? 'Too many photo analyses. Please wait a moment.'),
      options,
    );
  }
  if (status >= 500) {
    return new VisionServiceError(
      message ?? 'Photo recognition is unavailable right now. Please try again.',
      options,
    );
  }
  return new VisionServiceError(message ?? `The photo service responded with ${status}.`, options);
}

export async function recogniseFoodPhoto(input: {
  base64: string;
  mimeType: string;
}): Promise<VisionResult> {
  if (!isVisionConfigured) throw new VisionNotConfiguredError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(appEnv.visionApiUrl, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ image: input.base64, mimeType: input.mimeType }),
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new Error('Photo analysis took too long. Please try again.');
      }
      throw new Error(
        'Could not reach the photo service. Check your connection and try again.',
        { cause } as ErrorOptions,
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw errorForStatus(response.status, payload, response.headers?.get('retry-after') ?? null);
    }
    return parseVisionResult(payload);
  } finally {
    clearTimeout(timer);
  }
}
