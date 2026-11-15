import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { analyzeFoodPhoto } from './lib/analyze.ts';
import { HttpError, toClientError } from './lib/errors.ts';
import { DEFAULT_VISION_MODEL } from './lib/gemini.ts';
import { createConcurrencyGuard, createRateLimiter } from './lib/rateLimit.ts';
import { MAX_REQUEST_BYTES, validateAnalyzePayload } from './lib/validation.ts';

/**
 * POST /functions/v1/analyze-food-photo
 *
 * Body:     { image: <base64>, mimeType: "image/jpeg" | "image/png" | "image/webp" }
 * Headers:  Authorization: Bearer <supabase access token>
 * Response: { items: [...], warnings: [...], model, generatedAt }
 *
 * Secrets (Edge Function env, never shipped to the app):
 *   GEMINI_API_KEY, USDA_API_KEY, optional GEMINI_VISION_MODEL.
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// 8 analyses per user per 5 minutes, and at most 6 in flight per instance.
const rateLimiter = createRateLimiter({ limit: 8, windowMs: 5 * 60_000 });
const concurrency = createConcurrencyGuard(6);

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function log(event: Record<string, unknown>): void {
  // Only routing metadata: never the image, the keys or upstream payloads.
  console.log(JSON.stringify({ fn: 'analyze-food-photo', ...event }));
}

async function authenticate(req: Request): Promise<string> {
  const header = req.headers.get('Authorization') ?? '';
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim() ?? '';
  if (!token) {
    throw new HttpError(401, 'unauthorized', 'Sign in to analyse a photo.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) {
    throw new HttpError(500, 'internal_error', 'The server is not configured correctly.');
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, 'unauthorized', 'Your session expired. Sign in again.');
  }
  return data.user.id;
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', code: 'invalid_request' }, 405);
  }

  let userId: string | null = null;
  try {
    const geminiKey = (Deno.env.get('GEMINI_API_KEY') ?? '').trim();
    const usdaKey = (Deno.env.get('USDA_API_KEY') ?? '').trim();
    if (!geminiKey) {
      throw new HttpError(
        503,
        'vision_not_configured',
        'Photo recognition is not configured on the server yet.',
      );
    }

    userId = await authenticate(req);

    const decision = rateLimiter.check(userId);
    if (!decision.allowed) {
      throw new HttpError(
        429,
        'rate_limited',
        'You have analysed a lot of photos in a short time. Please wait a moment.',
        decision.retryAfterSeconds,
      );
    }

    const declaredLength = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      throw new HttpError(
        413,
        'payload_too_large',
        'That photo is too large. Try a smaller image (under 6 MB).',
      );
    }

    const raw = await req.text();
    if (raw.length > MAX_REQUEST_BYTES) {
      throw new HttpError(
        413,
        'payload_too_large',
        'That photo is too large. Try a smaller image (under 6 MB).',
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'invalid_request', 'The request body is not valid JSON.');
    }

    const image = validateAnalyzePayload(payload);

    if (!concurrency.tryAcquire()) {
      throw new HttpError(
        503,
        'busy',
        'Photo recognition is at capacity right now. Please try again in a moment.',
        5,
      );
    }

    let result: Awaited<ReturnType<typeof analyzeFoodPhoto>>;
    try {
      result = await analyzeFoodPhoto(
        { base64: image.base64, mimeType: image.mimeType },
        {
          geminiKey,
          usdaKey,
          model: (Deno.env.get('GEMINI_VISION_MODEL') ?? '').trim() || DEFAULT_VISION_MODEL,
        },
      );
    } finally {
      concurrency.release();
    }

    log({ status: 200, userId, ms: Date.now() - startedAt, items: result.items.length });
    return jsonResponse({
      items: result.items,
      warnings: result.warnings,
      model: result.model,
      generatedAt: result.generatedAt,
    });
  } catch (error) {
    const clientError = toClientError(error);
    log({
      status: clientError.status,
      code: clientError.code,
      userId,
      ms: Date.now() - startedAt,
      // e.g. "429/insufficient_quota": enough to diagnose, no payload or key.
      ...(clientError.upstream ? { upstream: clientError.upstream } : {}),
    });
    return jsonResponse(
      {
        error: clientError.message,
        code: clientError.code,
        ...(clientError.retryAfterSeconds
          ? { retryAfterSeconds: clientError.retryAfterSeconds }
          : {}),
      },
      clientError.status,
      clientError.retryAfterSeconds
        ? { 'Retry-After': String(clientError.retryAfterSeconds) }
        : {},
    );
  }
});
