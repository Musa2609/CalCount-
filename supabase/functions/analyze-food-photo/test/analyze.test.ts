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
import { extractResponseText, parseFoodAnalysis } from '../lib/openai.ts';
import { createConcurrencyGuard, createRateLimiter } from '../lib/rateLimit.ts';
import { scoreMatch, tokenize, toUsdaMatch } from '../lib/usda.ts';
import { validateAnalyzePayload } from '../lib/validation.ts';
import type { FetchLike } from '../lib/types.ts';

const OPENAI_KEY = 'sk-test-secret-openai';
const USDA_KEY = 'usda-test-secret-key';

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function responsesPayload(items: unknown[], model = 'gpt-4.1-mini'): unknown {
  return {
    id: 'resp_test',
    model,
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify({ items }) }],
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
  usdaSearch?: (url: string) => Response | Promise<Response>;
  usdaDetail?: (url: string) => Response | Promise<Response>;
}

function router(options: RouterOptions): FetchLike {
  return async (input, init) => {
    const url = String(input);
    if (url.includes('/v1/responses')) {
      if (options.responses) return options.responses();
      return jsonResponse(responsesPayload([]));
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
// OpenAI response parsing
// ---------------------------------------------------------------------------

test('extracts text from the Responses output array and output_text', () => {
  assert.equal(
    extractResponseText({
      output: [
        { type: 'reasoning', content: [{ type: 'output_text', text: 'ignore me' }] },
        { type: 'message', content: [{ type: 'output_text', text: '{"items":[]}' }] },
      ],
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
    responses: () =>
      jsonResponse(
        responsesPayload([
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
    { openAiKey: OPENAI_KEY, usdaKey: USDA_KEY, fetchImpl },
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
    { openAiKey: OPENAI_KEY, usdaKey: USDA_KEY, fetchImpl: router({ responses: () => jsonResponse(responsesPayload([])) }) },
  );
  assert.deepEqual(result.items, []);
  assert.match(result.warnings[0], /No food was recognised/);
});

test('discards items whose nutrition values are unusable', async () => {
  const result = await analyzeFoodPhoto(
    { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' },
    {
      openAiKey: OPENAI_KEY,
      usdaKey: '',
      fetchImpl: router({
        responses: () =>
          jsonResponse(
            responsesPayload([
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
      openAiKey: OPENAI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        responses: () =>
          jsonResponse(
            responsesPayload([
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
      openAiKey: OPENAI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({ responses: () => new Response('boom', { status: 500 }) }),
    }),
    (error: unknown) =>
      isHttpError(error) &&
      error.status === 502 &&
      error.code === 'vision_failed' &&
      !error.message.includes(OPENAI_KEY),
  );

  await assert.rejects(
    analyzeFoodPhoto(base, {
      openAiKey: OPENAI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({ responses: () => new Response('rate limited', { status: 429 }) }),
    }),
    (error: unknown) => isHttpError(error) && error.status === 503 && error.retryAfterSeconds === 15,
  );

  await assert.rejects(
    analyzeFoodPhoto(base, {
      openAiKey: OPENAI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        responses: () =>
          jsonResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'sorry' }] }] }),
      }),
    }),
    (error: unknown) => isHttpError(error) && error.code === 'vision_invalid_response',
  );

  await assert.rejects(
    analyzeFoodPhoto(base, {
      openAiKey: '',
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
      { openAiKey: OPENAI_KEY, usdaKey: '', fetchImpl: hanging, openAiTimeoutMs: 10 },
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
  // A different user is unaffected.
  assert.equal(limiter.check('user-b', start + 2_000).allowed, true);
  // Window expiry restores the allowance.
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
// OpenAI 429 disambiguation (production incident: every call returned 429 and
// was reported to the user as "busy")
// ---------------------------------------------------------------------------

test('reports an exhausted OpenAI quota instead of a temporary busy state', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      openAiKey: OPENAI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        responses: () =>
          jsonResponse(
            {
              error: {
                type: 'insufficient_quota',
                code: 'insufficient_quota',
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
      error.upstream === '429/insufficient_quota' &&
      !/busy/i.test(error.message) &&
      !error.message.includes(OPENAI_KEY),
  );
});

test('keeps a real rate limit as busy and honours Retry-After', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      openAiKey: OPENAI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        responses: () =>
          new Response(JSON.stringify({ error: { type: 'rate_limit_exceeded' } }), {
            status: 429,
            headers: { 'content-type': 'application/json', 'retry-after': '7' },
          }),
      }),
    }),
    (error: unknown) =>
      isHttpError(error) &&
      error.code === 'vision_busy' &&
      error.retryAfterSeconds === 7 &&
      error.upstream === '429/rate_limit_exceeded',
  );
});

test('flags an unknown vision model as a configuration problem', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      openAiKey: OPENAI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({
        responses: () =>
          jsonResponse({ error: { type: 'invalid_request_error', code: 'model_not_found' } }, 404),
      }),
    }),
    (error: unknown) =>
      isHttpError(error) &&
      error.status === 502 &&
      error.code === 'vision_model_missing' &&
      error.upstream === '404/model_not_found',
  );
});

test('an unreadable upstream error body still maps by status', async () => {
  const base = { base64: base64(JPEG_BYTES), mimeType: 'image/jpeg' };
  await assert.rejects(
    analyzeFoodPhoto(base, {
      openAiKey: OPENAI_KEY,
      usdaKey: USDA_KEY,
      fetchImpl: router({ responses: () => new Response('<html>gateway</html>', { status: 429 }) }),
    }),
    (error: unknown) =>
      isHttpError(error) && error.code === 'vision_busy' && error.upstream === '429',
  );
});
