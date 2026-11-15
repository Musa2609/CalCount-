import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeFoodPhoto } from '../lib/analyze.ts';
import { HttpError, isHttpError } from '../lib/errors.ts';
import {
  MAX_BASE64_CHARS,
  decodeImageBase64,
  sniffImageMime,
  stripDataUrlPrefix,
} from '../lib/image.ts';
import { sanitizeAiItems, buildAnalyzedItems } from '../lib/nutrition.ts';
import {
  DEFAULT_VISION_MODEL,
  GEMINI_API_KEY_HEADER,
  buildGeminiEndpoint,
  extractResponseText,
  mapUpstreamStatus,
  parseDurationSeconds,
  parseFoodAnalysis,
  readUpstreamFailure,
  redactSecrets,
} from '../lib/gemini.ts';
import { createConcurrencyGuard, createRateLimiter } from '../lib/rateLimit.ts';
import { scoreMatch, tokenize, toUsdaMatch } from '../lib/usda.ts';
import { validateAnalyzePayload } from '../lib/validation.ts';
import type { FetchLike } from '../lib/types.ts';

const GEMINI_KEY = 'gemini-test-secret-key';
const USDA_KEY = 'usda-test-secret-key';

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function geminiPayload(items: unknown[], model = 'gemini-2.5-flash-lite'): unknown {
  return {
    modelVersion: model,
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify({ items }) }],
        },
      },
    ],
  };
}

const CHICKEN_USDA_DESCRIPTION =
  'Chicken, broilers or fryers, breast, meat only, cooked, grilled';

function usdaSearchPayload(description = CHICKEN_USDA_DESCRIPTION, fdcId = 171477) {
  return {
    foods: [
      {
        fdcId,
        description,
        dataType: 'SR Legacy',
        foodNutrients: [
          { nutrientNumber: '1008', nutrientName: 'Energy', unitName: 'kcal', value: 165 },
          { nutrientNumber: '1003', nutrientName: 'Protein', unitName: 'g', value: 31 },
          { nutrientNumber: '1004', nutrientName: 'Total lipid (fat)', unitName: 'g', value: 3.6 },
          { nutrientNumber: '1005', nutrientName: 'Carbohydrate', unitName: 'g', value: 0 },
        ],
      },
    ],
  };
}

function usdaDetailPayload(fdcId = 171477) {
  return {
    fdcId,
    description: CHICKEN_USDA_DESCRIPTION,
    foodNutrients: [
      { nutrient: { number: '1008', name: 'Energy', unitName: 'kcal' }, amount: 165 },
      { nutrient: { number: '1003', name: 'Protein', unitName: 'g' }, amount: 31 },
      { nutrient: { number: '1004', name: 'Total lipid (fat)', unitName: 'g' }, amount: 3.6 },
      { nutrient: { number: '1005', name: 'Carbohydrate', unitName: 'g' }, amount: 0 },
      { nutrient: { number: '1079', name: 'Fiber', unitName: 'g' }, amount: 0 },
    ],
  };
}

interface RouterOptions {
  responses?: () => Response | Promise<Response>;
  gemini?: () => Response | Promise<Response>;
  usdaSearch?: (url: string) => Response | Promise<Response>;
  usdaDetail?: (url: string) => Response | Promise<Response>;
}

function router(options: RouterOptions): FetchLike {
  return async (input, init) => {
    const url = String(input);
    if (url.includes('generateContent') || url.includes('/v1/responses')) {
      if (options.gemini) return options.gemini();
      if (options.responses) return options.responses();
      return jsonResponse(geminiPayload([]));
    }
    if (url.includes('/foods/search')) {
      if (options.usdaSearch) return options.usdaSearch(url);
      return jsonResponse({ foods: [] });
    }
    if (url.includes('/food/')) {
      if (options.usdaDetail) return options.usdaDetail(url);
      return jsonResponse({});
    }
    throw new Error(`unexpected url ${url} ${String(init?.method)}`);
  };
}

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** Fake transport that records exactly what the function sent. */
function capture(handler: (request: CapturedRequest) => Response | Promise<Response>): {
  fetchImpl: FetchLike;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const headers: Record<string, string> = {};
    const raw = init?.headers;
    if (raw instanceof Headers) {
      raw.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw as Record<string, string>)) {
        headers[key.toLowerCase()] = String(value);
      }
    }
    const request: CapturedRequest = {
      url: String(input),
      method: String(init?.method ?? 'GET'),
      headers,
      body: typeof init?.body === 'string' ? init.body : '',
    };
    requests.push(request);
    return handler(request);
  };
  return { fetchImpl, requests };
}

const IMAGE = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };

/** A Gemini 429 body: `details` mirror `google.rpc.QuotaFailure`/`RetryInfo`. */
function resourceExhaustedBody(overrides: {
  message?: string;
  status?: string;
  quotaId?: string;
  quotaMetric?: string;
  retryDelay?: string;
}): unknown {
  const details: unknown[] = [];
  if (overrides.quotaId || overrides.quotaMetric) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [
        {
          ...(overrides.quotaMetric ? { quotaMetric: overrides.quotaMetric } : {}),
          ...(overrides.quotaId ? { quotaId: overrides.quotaId } : {}),
        },
      ],
    });
  }
  if (overrides.retryDelay) {
    details.push({ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: overrides.retryDelay });
  }
  return {
    error: {
      code: 429,
      status: overrides.status ?? 'RESOURCE_EXHAUSTED',
      message: overrides.message ?? 'Resource has been exhausted (e.g. check quota).',
      ...(details.length ? { details } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Image validation
// ---------------------------------------------------------------------------

test('accepts a JPEG payload and reports the sniffed type', () => {
  const validated = validateAnalyzePayload({ image: base64(JPEG_BYTES), mimeType: 'image/jpeg' });
  assert.equal(validated.mimeType, 'image/jpeg');
  assert.equal(validated.byteLength, JPEG_BYTES.length);
});

test('sniffs PNG and WebP and ignores a lying mimeType', () => {
  assert.equal(
    validateAnalyzePayload({ image: base64(PNG_BYTES), mimeType: 'image/jpeg' }).mimeType,
    'image/png',
  );
  assert.equal(
    validateAnalyzePayload({ image: base64(WEBP_BYTES), mimeType: 'image/jpeg' }).mimeType,
    'image/webp',
  );
  assert.equal(sniffImageMime(PNG_BYTES), 'image/png');
  assert.equal(sniffImageMime(WEBP_BYTES), 'image/webp');
});

test('accepts a data URL wrapper', () => {
  const { base64: raw, declaredType } = stripDataUrlPrefix(
    `data:image/jpeg;base64,${base64(JPEG_BYTES)}`,
  );
  assert.equal(declaredType, 'image/jpeg');
  assert.deepEqual(Array.from(decodeImageBase64(raw)), Array.from(JPEG_BYTES));
});

test('rejects non-image bytes with 415', () => {
  const notAnImage = base64(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]));
  assert.throws(
    () => validateAnalyzePayload({ image: notAnImage, mimeType: 'image/jpeg' }),
    (error: unknown) => isHttpError(error) && error.status === 415,
  );
});

test('rejects a missing or non-base64 image with 400', () => {
  assert.throws(
    () => validateAnalyzePayload({}),
    (error: unknown) => isHttpError(error) && error.status === 400,
  );
  assert.throws(
    () => validateAnalyzePayload({ image: 'not base64 !!!' }),
    (error: unknown) => isHttpError(error) && error.status === 400,
  );
  assert.throws(
    () => validateAnalyzePayload(null),
    (error: unknown) => isHttpError(error) && error.status === 400,
  );
});

test('rejects an oversized image with 413 before decoding', () => {
  assert.throws(
    () => validateAnalyzePayload({ image: 'A'.repeat(MAX_BASE64_CHARS + 4) }),
    (error: unknown) => isHttpError(error) && error.status === 413,
  );
});

// ---------------------------------------------------------------------------
// Gemini response parsing
// ---------------------------------------------------------------------------

test('extracts text from Gemini candidates and output_text', () => {
  assert.equal(
    extractResponseText({
      candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }],
    }),
    '{"items":[]}',
  );
  assert.equal(extractResponseText({ output_text: '{"items":[{"name":"x"}]}' }), '{"items":[{"name":"x"}]}');
});

test('parses JSON wrapped in prose and rejects unreadable output', () => {
  assert.deepEqual(parseFoodAnalysis('Here you go: {"items":[{"name":"rice"}]} thanks'), [
    { name: 'rice' },
  ]);
  assert.throws(
    () => parseFoodAnalysis('I cannot help with that.'),
    (error: unknown) => isHttpError(error) && error.code === 'vision_invalid_response',
  );
  assert.throws(
    () => parseFoodAnalysis('{"foods": []}'),
    (error: unknown) => isHttpError(error) && error.status === 502,
  );
});

test('readUpstreamFailure parses Gemini and OpenAI style errors', () => {
  const gemini = readUpstreamFailure(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'rate limit hit', details: [{ reason: 'RATE_LIMIT_EXCEEDED' }] } }));
  assert.equal(gemini.type, 'RESOURCE_EXHAUSTED');
  assert.equal(gemini.code, 'RATE_LIMIT_EXCEEDED');
  assert.equal(gemini.quotaKind, 'transient');

  const openai = readUpstreamFailure(JSON.stringify({ error: { type: 'insufficient_quota', code: 'insufficient_quota' } }));
  assert.equal(openai.code, 'insufficient_quota');
  assert.equal(openai.quotaKind, 'exhausted');

  const unreadable = readUpstreamFailure('<html>gateway</html>');
  assert.equal(unreadable.quotaKind, null);
  assert.equal(unreadable.retryDelaySeconds, null);
});

test('parses Google retry delays', () => {
  assert.equal(parseDurationSeconds('51s'), 51);
  assert.equal(parseDurationSeconds('250ms'), 0.25);
  assert.equal(parseDurationSeconds('2m'), 120);
  assert.equal(parseDurationSeconds('8h'), 28800);
  assert.equal(parseDurationSeconds(12), 12);
  assert.equal(parseDurationSeconds('soon'), null);
  assert.equal(parseDurationSeconds(undefined), null);
});

test('redacts keys from URLs and free text', () => {
  assert.equal(redactSecrets(`https://x/y?key=${GEMINI_KEY}`, [GEMINI_KEY]), 'https://x/y?key=[redacted]');
  assert.equal(redactSecrets('https://x/y?key=abc123'), 'https://x/y?key=[redacted]');
  assert.equal(redactSecrets(`echo ${GEMINI_KEY} here`, [GEMINI_KEY]), 'echo [redacted] here');
  assert.equal(redactSecrets('token AIzaSyABCDEFGHIJKLMNOP'), 'token [redacted]');
});

// ---------------------------------------------------------------------------
// USDA matching
// ---------------------------------------------------------------------------

test('tokenizes and scores USDA candidates', () => {
  assert.deepEqual(tokenize('Grilled chicken breast, with sauce'), ['grilled', 'chicken', 'breast', 'sauce']);
  assert.equal(scoreMatch(tokenize('grilled chicken breast'), CHICKEN_USDA_DESCRIPTION), 1);
  assert.equal(scoreMatch(tokenize('grilled chicken breast'), 'Bananas, raw'), 0);
  assert.equal(scoreMatch(tokenize('pizza'), 'Pizza, cheese topping, thin crust'), 1);
});

test('builds a match only from a complete nutrient panel', () => {
  const match = toUsdaMatch(171477, CHICKEN_USDA_DESCRIPTION, 'SR Legacy', usdaDetailPayload().foodNutrients);
  assert.ok(match);
  assert.equal(match.caloriesPer100g, 165);
  assert.equal(match.proteinPer100g, 31);
  assert.equal(match.fiberPer100g, 0);

  assert.equal(toUsdaMatch(1, 'Mystery', 'SR Legacy', []), null);
  assert.equal(
    toUsdaMatch(1, 'Mystery', 'SR Legacy', [
      { nutrient: { number: '1008' }, amount: 100 },
      { nutrient: { number: '1003' }, amount: 60 },
      { nutrient: { number: '1004' }, amount: 60 },
      { nutrient: { number: '1005' }, amount: 40 },
    ]),
    null,
  );
});

// ---------------------------------------------------------------------------
// Nutrition sanitising / merging
// ---------------------------------------------------------------------------

test('sanitizes model rows and drops unusable ones', () => {
  const { items, dropped } = sanitizeAiItems([
    {
      name: ' Rice ',
      category: 'grain',
      ingredients: ['rice', ''],
      grams: 3,
      confidence: 1.7,
      caloriesPer100g: 130,
      proteinPer100g: 2.7,
      carbsPer100g: 28,
      fatPer100g: 0.3,
      notes: '',
    },
    { name: 'Negatives', grams: 100, caloriesPer100g: -5, proteinPer100g: 1, carbsPer100g: 1, fatPer100g: 1 },
    { name: '', grams: 100, caloriesPer100g: 100, proteinPer100g: 1, carbsPer100g: 1, fatPer100g: 1 },
    'nonsense',
  ]);
  assert.equal(dropped, 3);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Rice');
  assert.equal(items[0].grams, 5);
  assert.equal(items[0].confidence, 1);
  assert.equal(items[0].notes, null);
});

test('merges duplicate names and keeps the USDA/AI distinction explicit', () => {
  const aiItems = sanitizeAiItems([
    { name: 'Rice', grams: 100, caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, confidence: 0.9 },
    { name: 'rice', grams: 50, caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, confidence: 0.9 },
    { name: 'Mystery stew', grams: 200, caloriesPer100g: 90, proteinPer100g: 4, carbsPer100g: 9, fatPer100g: 4, confidence: 0.3 },
  ]).items;

  const { items, warnings } = buildAnalyzedItems(
    aiItems,
    [
      {
        status: 'matched',
        match: {
          fdcId: 20444,
          description: 'Rice, white, cooked',
          dataType: 'SR Legacy',
          caloriesPer100g: 130,
          proteinPer100g: 2.7,
          carbsPer100g: 28,
          fatPer100g: 0.3,
          fiberPer100g: 0.4,
        },
      },
      { status: 'no_match' },
      { status: 'no_match' },
    ],
    { usdaConfigured: true },
  );

  assert.equal(items.length, 2);
  assert.equal(items[0].nutritionSource, 'usda');
  assert.equal(items[0].matchedFoodName, 'Rice, white, cooked');
  assert.equal(items[0].grams, 150);
  assert.equal(items[0].fiberPer100g, 0.4);
  assert.equal(items[1].nutritionSource, 'ai_estimate');
  assert.equal(items[1].fdcId, null);
  assert.ok(warnings.some((w) => w.includes('AI estimate')));
  assert.ok(warnings.some((w) => w.includes('Mystery stew') && w.includes('30%')));
});

test('reports USDA outages instead of pretending there was no match', () => {
  const aiItems = sanitizeAiItems([
    { name: 'Chicken', grams: 150, caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, confidence: 0.8 },
  ]).items;
  const { items, warnings } = buildAnalyzedItems(aiItems, [{ status: 'unavailable' }]);
  assert.equal(items[0].nutritionSource, 'ai_estimate');
  assert.match(warnings[0], /USDA FoodData Central was unavailable/);
});

// ---------------------------------------------------------------------------
// End-to-end pipeline with stubbed upstreams
// ---------------------------------------------------------------------------

test('analyses a photo with two foods: one USDA match, one AI estimate', async () => {
  const fetchImpl = router({
    gemini: () =>
      jsonResponse(
        geminiPayload([
          {
            name: 'Grilled chicken breast',
            category: 'poultry',
            ingredients: ['chicken breast'],
            grams: 150,
            confidence: 0.86,
            caloriesPer100g: 170,
            proteinPer100g: 30,
            carbsPer100g: 0,
            fatPer100g: 4,
            notes: '',
          },
          {
            name: 'Mystery stew',
            category: 'mixed dish',
            ingredients: [],
            grams: 220,
            confidence: 0.28,
            caloriesPer100g: 95,
            proteinPer100g: 5,
            carbsPer100g: 9,
            fatPer100g: 4,
            notes: 'sauce is not visible',
          },
        ]),
      ),
    usdaSearch: (url) =>
      jsonResponse(url.includes('stew') ? { foods: [] } : usdaSearchPayload()),
    usdaDetail: () => jsonResponse(usdaDetailPayload()),
  });

  const result = await analyzeFoodPhoto(
    { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' },
    { geminiKey: GEMINI_KEY, usdaKey: USDA_KEY, fetchImpl },
  );

  assert.equal(result.items.length, 2);
  const chicken = result.items[0];
  assert.equal(chicken.nutritionSource, 'usda');
  assert.equal(chicken.fdcId, 171477);
  assert.equal(chicken.caloriesPer100g, 165);
  assert.equal(chicken.proteinPer100g, 31);

  const stew = result.items[1];
  assert.equal(stew.nutritionSource, 'ai_estimate');
  assert.equal(stew.caloriesPer100g, 95);
  assert.equal(stew.fdcId, null);

  assert.ok(result.warnings.some((w) => w.includes('Mystery stew') && w.includes('AI estimate')));
  assert.ok(result.warnings.some((w) => w.includes('28%')));
});

test('returns an empty result (not an error) when the model sees no food', async () => {
  const result = await analyzeFoodPhoto(
    { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' },
    { geminiKey: GEMINI_KEY, usdaKey: USDA_KEY, fetchImpl: router({ gemini: () => jsonResponse(geminiPayload([])) }) },
  );
  assert.deepEqual(result.items, []);
  assert.match(result.warnings[0], /No food was recognised/);
});

test('discards items whose nutrition values are unusable', async () => {
  const result = await analyzeFoodPhoto(
    { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' },
    {
      geminiKey: GEMINI_KEY,
      usdaKey: '',
      fetchImpl: router({
        gemini: () =>
          jsonResponse(
            geminiPayload([
              { name: 'Broken', grams: 100, caloriesPer100g: 'n/a', proteinPer100g: 1, carbsPer100g: 1, fatPer100g: 1 },
            ]),
          ),
      }),
    },
  );
  assert.deepEqual(result.items, []);
  assert.ok(result.warnings.some((w) => w.includes('discarded')));
});

test('falls back to AI estimates when USDA is unreachable', async () => {
  const result = await analyzeFoodPhoto(
    { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' },
    {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () =>
          jsonResponse(
            geminiPayload([
              { name: 'Chicken breast', grams: 150, caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, confidence: 0.8 },
            ]),
          ),
        usdaSearch: () => new Response('upstream down', { status: 500 }),
      }),
    },
  );
  assert.equal(result.items[0].nutritionSource, 'ai_estimate');
  assert.match(result.warnings[0], /USDA FoodData Central was unavailable/);
});

test('maps upstream failures to safe HTTP errors without leaking keys', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };

  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({ gemini: () => new Response('boom', { status: 500 }) }),
    }),
    (error: unknown) =>
      isHttpError(error) &&
      error.status === 502 &&
      error.code === 'vision_failed' &&
      !error.message.includes(GEMINI_KEY),
  );

  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({ gemini: () => new Response('rate limited', { status: 429 }) }),
    }),
    (error: unknown) => isHttpError(error) && error.status === 503 && error.retryAfterSeconds === 15,
  );

  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () =>
          jsonResponse({ candidates: [{ content: { parts: [{ text: 'sorry' }] } }] }),
      }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_invalid_response',
  );

  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: '',
      usdaKey: USDA_KEY,
      fetchImpl: router({}),
    }),
    (error: unknown) => isHttpError(error) && error.status === 503 && error.code === 'vision_not_configured',
  );
});

test('times out instead of hanging forever', async () => {
  const hanging: FetchLike = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });

  await assert.rejects(
    analyzeFoodPhoto(
      { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' },
      { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl: hanging, geminiTimeoutMs: 10 },
    ),
    (error: unknown) => isHttpError(error) && error.status === 504 && error.code === 'vision_timeout',
  );
});

// ---------------------------------------------------------------------------
// Rate limiting / concurrency
// ---------------------------------------------------------------------------

test('allows the configured burst then blocks with a retry hint', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
  const start = 1_000_000;
  assert.equal(limiter.check('user-a', start).allowed, true);
  assert.equal(limiter.check('user-a', start + 1_000).allowed, true);
  const blocked = limiter.check('user-a', start + 2_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 58);
  assert.equal(limiter.check('user-b', start + 2_000).allowed, true);
  assert.equal(limiter.check('user-a', start + 61_000).allowed, true);
});

test('concurrency guard refuses work beyond its cap', () => {
  const guard = createConcurrencyGuard(2);
  assert.equal(guard.tryAcquire(), true);
  assert.equal(guard.tryAcquire(), true);
  assert.equal(guard.tryAcquire(), false);
  guard.release();
  assert.equal(guard.tryAcquire(), true);
  assert.equal(guard.active(), 2);
});

test('HttpError carries status, code and retry hints', () => {
  const error = new HttpError(429, 'rate_limited', 'slow down', 12);
  assert.equal(error.status, 429);
  assert.equal(error.code, 'rate_limited');
  assert.equal(error.retryAfterSeconds, 12);
  assert.ok(isHttpError(error));
  assert.equal(isHttpError(new Error('x')), false);
});

// ---------------------------------------------------------------------------
// Gemini auth failure
// ---------------------------------------------------------------------------

test('reports a Gemini authentication failure', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({ gemini: () => new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 }) }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_auth_failed',
  );

  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({ gemini: () => new Response('nope', { status: 403 }) }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_auth_failed',
  );
});

// ---------------------------------------------------------------------------
// Gemini quota / rate limit
// ---------------------------------------------------------------------------

test('reports an exhausted Gemini quota instead of a temporary busy state', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () =>
          jsonResponse(
            {
              error: {
                status: 'RESOURCE_EXHAUSTED',
                message: 'You exceeded your current quota, please check your plan and billing details.',
              },
            },
            429,
          ),
      }),
    }),
    (error: unknown) =>
      isHttpError(error) &&
      error.status === 503 &&
      error.code === 'vision_quota_exhausted' &&
      error.retryAfterSeconds === null &&
      !/busy/i.test(error.message),
  );
});

test('keeps a real rate limit as busy and honours Retry-After', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () =>
          new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Rate limit exceeded' } }), {
            status: 429,
            headers: { 'content-type': 'application/json', 'retry-after': '7' },
          }),
      }),
    }),
    (error: unknown) =>
      isHttpError(error) &&
      error.code === 'vision_busy' &&
      error.retryAfterSeconds === 7,
  );
});

// OpenAI-style 429 bodies still map correctly (compatibility).
test('reports an exhausted OpenAI-style quota', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () =>
          jsonResponse(
            { error: { type: 'insufficient_quota', code: 'insufficient_quota', message: 'quota' } },
            429,
          ),
      }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_quota_exhausted',
  );
});

test('keeps an OpenAI-style rate limit as busy', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () =>
          new Response(JSON.stringify({ error: { type: 'rate_limit_exceeded' } }), {
            status: 429,
            headers: { 'content-type': 'application/json', 'retry-after': '7' },
          }),
      }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_busy' && error.retryAfterSeconds === 7,
  );
});

// ---------------------------------------------------------------------------
// Gemini model missing
// ---------------------------------------------------------------------------

test('flags an unknown vision model as a configuration problem', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () =>
          jsonResponse({ error: { status: 'NOT_FOUND', message: 'model not found' } }, 404),
      }),
    }),
    (error: unknown) =>
      isHttpError(error) && error.status === 502 && error.code === 'vision_model_missing',
  );
});

// ---------------------------------------------------------------------------
// Malformed model responses
// ---------------------------------------------------------------------------

test('rejects an empty Gemini response', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () => jsonResponse({ candidates: [{ content: { parts: [{ text: '' }] } }] }),
      }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_invalid_response',
  );
});

test('rejects a Gemini response without items', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () => jsonResponse({ candidates: [{ content: { parts: [{ text: '{"foods":[]}' }] } }] }),
      }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_invalid_response',
  );
});

test('rejects a malformed (non-JSON) Gemini response', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () => jsonResponse({ candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] }),
      }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_invalid_response',
  );
});

test('rejects a Gemini response with no candidates', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        gemini: () => jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } }),
      }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_invalid_response',
  );
});

test('an unreadable upstream error body still maps by status', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      geminiKey: GEMINI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({ gemini: () => new Response('<html>gateway</html>', { status: 429 }) }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_busy' && error.upstream === '429',
  );
});

// Successful Gemini response end-to-end.
test('successful Gemini response is parsed end-to-end', async () => {
  const result = await analyzeFoodPhoto(
    { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' },
    {
      geminiKey: GEMINI_KEY,
      usdaKey: '',
      fetchImpl: router({
        gemini: () =>
          jsonResponse(
            geminiPayload([
              { name: 'Apple', grams: 100, caloriesPer100g: 52, proteinPer100g: 0.3, carbsPer100g: 14, fatPer100g: 0.2, confidence: 0.9 },
            ]),
          ),
      }),
    },
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, 'Apple');
  assert.equal(result.model, 'gemini-2.5-flash-lite');
});

// mapUpstreamStatus direct checks.
test('mapUpstreamStatus maps common statuses', () => {
  assert.equal(mapUpstreamStatus(401).code, 'vision_auth_failed');
  assert.equal(mapUpstreamStatus(429).code, 'vision_busy');
  assert.equal(mapUpstreamStatus(429).retryAfterSeconds, 15);
  assert.equal(mapUpstreamStatus(404).code, 'vision_model_missing');
  assert.equal(mapUpstreamStatus(400).code, 'invalid_image');
});

// ---------------------------------------------------------------------------
// Request shape: key in a header, never in the URL
// ---------------------------------------------------------------------------

test('sends the key as x-goog-api-key and keeps it out of the URL', async () => {
  const { fetchImpl, requests } = capture(() => jsonResponse(geminiPayload([])));

  await analyzeFoodPhoto(IMAGE, { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl });

  assert.equal(GEMINI_API_KEY_HEADER, 'x-goog-api-key');
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.method, 'POST');
  assert.equal(request.headers[GEMINI_API_KEY_HEADER], GEMINI_KEY);
  assert.equal(request.url, buildGeminiEndpoint(DEFAULT_VISION_MODEL));
  assert.equal(
    request.url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
  );
  assert.ok(!request.url.includes('key'), request.url);
  assert.ok(!request.url.includes(GEMINI_KEY), request.url);

  const body = JSON.parse(request.body);
  assert.match(body.contents[0].parts[0].text, /^You analyse one photo of food or drink/);
  assert.deepEqual(body.contents[0].parts[1].inlineData, {
    mimeType: 'image/jpeg',
    data: base64(JPEG_BYTES),
  });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('honours a GEMINI_VISION_MODEL override and the geminiModel alias', async () => {
  const overridden = capture(() => jsonResponse(geminiPayload([], 'gemini-2.5-flash')));
  const result = await analyzeFoodPhoto(IMAGE, {
    geminiKey: GEMINI_KEY,
    usdaKey: '',
    model: 'gemini-2.5-flash',
    fetchImpl: overridden.fetchImpl,
  });
  assert.match(overridden.requests[0].url, /\/models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(result.model, 'gemini-2.5-flash');

  const aliased = capture(() => jsonResponse(geminiPayload([])));
  await analyzeFoodPhoto(IMAGE, {
    geminiKey: GEMINI_KEY,
    usdaKey: '',
    geminiModel: 'gemini-2.5-pro',
    fetchImpl: aliased.fetchImpl,
  });
  assert.match(aliased.requests[0].url, /\/models\/gemini-2\.5-pro:generateContent$/);

  // Unknown model ids are passed through untouched (encoded, not validated).
  assert.equal(
    buildGeminiEndpoint('gemini 2.5/flash', 'https://example.test/v1beta/'),
    'https://example.test/v1beta/models/gemini%202.5%2Fflash:generateContent',
  );
});

test('never leaks the key through an upstream error', async () => {
  const leaky = JSON.stringify({
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: `API key ${GEMINI_KEY} has no quota (see https://example.test/?key=${GEMINI_KEY})`,
      details: [{ reason: 'RATE_LIMIT_EXCEEDED' }, { retryDelay: '12s' }],
    },
  });

  // The parsed failure itself is redacted before it can reach a log line.
  const failure = readUpstreamFailure(leaky, [GEMINI_KEY]);
  assert.ok(!String(failure.message).includes(GEMINI_KEY));
  assert.match(String(failure.message), /\[redacted\]/);
  assert.equal(failure.retryDelaySeconds, 12);

  // Even without being told the key, a key in a query string is scrubbed.
  assert.match(String(readUpstreamFailure(leaky).message), /key=\[redacted\]/);

  const { fetchImpl } = capture(
    () => new Response(leaky, { status: 429, headers: { 'content-type': 'application/json' } }),
  );
  await assert.rejects(
    analyzeFoodPhoto(IMAGE, { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl }),
    (error: unknown) => {
      assert.ok(isHttpError(error));
      assert.equal(error.code, 'vision_busy');
      assert.equal(error.retryAfterSeconds, 12);
      assert.ok(!error.message.includes(GEMINI_KEY));
      assert.ok(!String(error.upstream).includes(GEMINI_KEY), String(error.upstream));
      return true;
    },
  );

  const authEcho = capture(
    () =>
      new Response(
        JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: `API key not valid: ${GEMINI_KEY}` } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
  );
  await assert.rejects(
    analyzeFoodPhoto(IMAGE, { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl: authEcho.fetchImpl }),
    (error: unknown) => {
      assert.ok(isHttpError(error));
      assert.equal(error.code, 'vision_auth_failed');
      assert.ok(!String(error.upstream).includes(GEMINI_KEY));
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 429 classification: per-minute limits vs spent daily allowances
// ---------------------------------------------------------------------------

test('a per-minute request quota is temporary (busy), not exhausted', async () => {
  const body = resourceExhaustedBody({
    quotaMetric: 'generativelanguage.googleapis.com/generate_content_requests',
    quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
    retryDelay: '37s',
  });

  const failure = readUpstreamFailure(JSON.stringify(body));
  assert.equal(failure.quotaKind, 'transient');
  assert.match(String(failure.quotaId), /PerMinute/);

  const { fetchImpl } = capture(() => jsonResponse(body, 429));
  await assert.rejects(
    analyzeFoodPhoto(IMAGE, { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl }),
    (error: unknown) => {
      assert.ok(isHttpError(error));
      assert.equal(error.code, 'vision_busy');
      assert.equal(error.retryAfterSeconds, 37);
      assert.doesNotMatch(error.message, /no credit/i);
      assert.match(String(error.upstream), /429\/.*PerMinute/);
      return true;
    },
  );
});

test('a per-minute token quota is temporary (busy), not exhausted', async () => {
  const body = resourceExhaustedBody({
    message: 'Resource has been exhausted (e.g. check quota).',
    quotaMetric: 'generativelanguage.googleapis.com/generate_content_input_token_count',
    quotaId: 'GenerateContentInputTokensPerModelPerMinute-FreeTier',
  });

  const failure = readUpstreamFailure(JSON.stringify(body));
  assert.equal(failure.quotaKind, 'transient');
  assert.equal(failure.retryDelaySeconds, null);

  const { fetchImpl } = capture(() => jsonResponse(body, 429));
  await assert.rejects(
    analyzeFoodPhoto(IMAGE, { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl }),
    (error: unknown) =>
      isHttpError(error) &&
      error.code === 'vision_busy' &&
      // No RetryInfo and no Retry-After: fall back to the short default.
      error.retryAfterSeconds === 15,
  );
});

test('a per-day free-tier quota is exhausted, even with a short retry delay', async () => {
  const body = resourceExhaustedBody({
    message: 'You exceeded your current quota, please check your plan and billing details.',
    quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
    quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
    retryDelay: '51s',
  });

  const failure = readUpstreamFailure(JSON.stringify(body));
  assert.equal(failure.quotaKind, 'exhausted');
  assert.match(String(failure.quotaId), /PerDay/);

  const { fetchImpl } = capture(() => jsonResponse(body, 429));
  await assert.rejects(
    analyzeFoodPhoto(IMAGE, { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl }),
    (error: unknown) => {
      assert.ok(isHttpError(error));
      assert.equal(error.code, 'vision_quota_exhausted');
      assert.equal(error.status, 503);
      assert.equal(error.retryAfterSeconds, null);
      // "Usage limit" is true for a spent day and for a billing cap alike.
      assert.match(error.message, /usage limit/i);
      assert.doesNotMatch(error.message, /no credit/i);
      return true;
    },
  );
});

test('a daily allowance wins when a 429 names both limits', async () => {
  const body = JSON.stringify({
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'Resource has been exhausted (e.g. check quota).',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            { quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' },
            { quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' },
          ],
        },
      ],
    },
  });
  const failure = readUpstreamFailure(body);
  assert.equal(failure.quotaKind, 'exhausted');

  const { fetchImpl } = capture(() => jsonResponse(JSON.parse(body), 429));
  await assert.rejects(
    analyzeFoodPhoto(IMAGE, { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_quota_exhausted',
  );
});

test('a RetryInfo-only 3 hour delay is still a temporary rate limit', async () => {
  // A long delay says "wait this long", not "the allowance is gone".
  const body = resourceExhaustedBody({ retryDelay: '3h' });
  const failure = readUpstreamFailure(JSON.stringify(body));
  assert.equal(failure.quotaKind, 'transient');
  assert.equal(failure.quotaId, null);
  assert.equal(failure.retryDelaySeconds, 10800);

  const { fetchImpl } = capture(() => jsonResponse(body, 429));
  await assert.rejects(
    analyzeFoodPhoto(IMAGE, { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl }),
    (error: unknown) => {
      assert.ok(isHttpError(error));
      assert.equal(error.code, 'vision_busy');
      assert.equal(error.retryAfterSeconds, 10800);
      assert.doesNotMatch(error.message, /no credit|usage limit/i);
      return true;
    },
  );
});

test('a structured daily quota stays exhausted even with a long RetryInfo', async () => {
  const body = resourceExhaustedBody({
    quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
    retryDelay: '3h',
  });
  const failure = readUpstreamFailure(JSON.stringify(body));
  assert.equal(failure.quotaKind, 'exhausted');
  assert.match(String(failure.quotaId), /PerDay/);

  const { fetchImpl } = capture(() => jsonResponse(body, 429));
  await assert.rejects(
    analyzeFoodPhoto(IMAGE, { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl }),
    (error: unknown) => {
      assert.ok(isHttpError(error));
      assert.equal(error.code, 'vision_quota_exhausted');
      assert.equal(error.retryAfterSeconds, null);
      assert.equal(
        error.message,
        'The AI service has reached its usage limit. Please try again later.',
      );
      return true;
    },
  );
});

test('a Retry-After header outranks RetryInfo', async () => {
  const body = resourceExhaustedBody({
    quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
    retryDelay: '37s',
  });
  const { fetchImpl } = capture(
    () =>
      new Response(JSON.stringify(body), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '9' },
      }),
  );
  await assert.rejects(
    analyzeFoodPhoto(IMAGE, { geminiKey: GEMINI_KEY, usdaKey: '', fetchImpl }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_busy' && error.retryAfterSeconds === 9,
  );
});
