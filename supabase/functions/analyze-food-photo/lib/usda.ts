import type { FetchLike } from './types.ts';

/**
 * USDA FoodData Central lookup.
 *
 * Search is an index, not the nutrition panel, so the best candidate is
 * re-fetched by FDC id before its numbers are used. A lookup can fail three
 * ways and they are deliberately distinct:
 *   - matched      : a confident match with a complete nutrient panel
 *   - no_match     : the database answered but nothing suitable was found
 *   - unavailable  : the request itself failed (network, timeout, quota, key)
 * `unavailable` must never be reported as "no match" internally, because the
 * user-facing warning differs, and neither path is allowed to invent values.
 */
export const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
export const DEFAULT_USDA_TIMEOUT_MS = 8_000;
export const MIN_MATCH_SCORE = 0.6;

const DATA_TYPES = 'Foundation,SR Legacy,Survey (FNDDS)';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'bowl', 'cup', 'dish', 'fresh', 'homemade', 'in', 'of',
  'on', 'or', 'piece', 'pieces', 'plate', 'portion', 'serving', 'side', 'some', 'the',
  'topped', 'with',
]);

export interface UsdaMatch {
  fdcId: number;
  description: string;
  dataType: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
}

export type UsdaLookup =
  | { status: 'matched'; match: UsdaMatch }
  | { status: 'no_match' }
  | { status: 'unavailable' };

interface NutrientReading {
  number: string | null;
  amount: number | null;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function tokenMatches(token: string, descriptionTokens: Set<string>): boolean {
  if (descriptionTokens.has(token)) return true;
  // Cheap plural handling: "tomatoes" vs "tomato", "eggs" vs "egg".
  if (token.endsWith('s') && descriptionTokens.has(token.slice(0, -1))) return true;
  if (descriptionTokens.has(`${token}s`)) return true;
  return false;
}

/** Fraction of the query's meaningful words that appear in the candidate. */
export function scoreMatch(queryTokens: string[], description: string): number {
  if (!queryTokens.length) return 0;
  const descriptionTokens = new Set(
    description
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  let hits = 0;
  for (const token of queryTokens) {
    if (tokenMatches(token, descriptionTokens)) hits += 1;
  }
  return hits / queryTokens.length;
}

function isExcludedDescription(description: string, queryTokens: string[]): boolean {
  const lower = description.toLowerCase();
  const blocked = ['babyfood', 'baby food', 'infant formula', 'infant'];
  if (queryTokens.some((token) => blocked.some((entry) => entry.includes(token)))) return false;
  return blocked.some((entry) => lower.includes(entry));
}

function readNutrient(entry: unknown): NutrientReading {
  if (!entry || typeof entry !== 'object') return { number: null, amount: null };
  const record = entry as Record<string, unknown>;
  const nutrient = record.nutrient;
  if (nutrient && typeof nutrient === 'object') {
    const nested = nutrient as Record<string, unknown>;
    return {
      number: typeof nested.number === 'string' ? nested.number : null,
      amount: typeof record.amount === 'number' ? record.amount : null,
    };
  }
  return {
    number: typeof record.nutrientNumber === 'string' ? record.nutrientNumber : null,
    amount: typeof record.value === 'number' ? record.value : null,
  };
}

function collectNutrients(foodNutrients: unknown): Map<string, number> {
  const values = new Map<string, number>();
  if (!Array.isArray(foodNutrients)) return values;
  for (const entry of foodNutrients) {
    const { number, amount } = readNutrient(entry);
    if (!number || amount === null || !Number.isFinite(amount) || amount < 0) continue;
    if (!values.has(number)) values.set(number, amount);
  }
  return values;
}

function pick(values: Map<string, number>, numbers: string[]): number | null {
  for (const number of numbers) {
    const value = values.get(number);
    if (value !== undefined) return value;
  }
  return null;
}

export function toUsdaMatch(
  fdcId: number,
  description: string,
  dataType: string,
  foodNutrients: unknown,
): UsdaMatch | null {
  const values = collectNutrients(foodNutrients);
  // 1008 = energy (kcal); 2047/2048 = Atwater energy variants.
  const calories = pick(values, ['1008', '2047', '2048']);
  const protein = pick(values, ['1003']);
  const fat = pick(values, ['1004']);
  const carbs = pick(values, ['1005']);
  if (calories === null || protein === null || fat === null || carbs === null) return null;
  // A food cannot be more than 100 g of macros per 100 g; catch bad records.
  if (protein + fat + carbs > 105) return null;
  if (calories > 950) return null;
  const fiber = pick(values, ['1079']);
  return {
    fdcId,
    description,
    dataType,
    caloriesPer100g: round1(calories),
    proteinPer100g: round1(protein),
    carbsPer100g: round1(carbs),
    fatPer100g: round1(fat),
    fiberPer100g: fiber === null ? null : round1(fiber),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

interface SearchFood {
  fdcId?: unknown;
  description?: unknown;
  dataType?: unknown;
  foodNutrients?: unknown;
}

async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.text().catch(() => '');
      return null;
    }
    return await response.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function findUsdaMatch(args: {
  name: string;
  apiKey: string;
  fetchImpl: FetchLike;
  timeoutMs?: number;
  baseUrl?: string;
}): Promise<UsdaLookup> {
  if (!args.apiKey) return { status: 'unavailable' };

  const queryTokens = tokenize(args.name);
  if (!queryTokens.length) return { status: 'no_match' };

  const baseUrl = args.baseUrl ?? USDA_BASE_URL;
  const timeoutMs = args.timeoutMs ?? DEFAULT_USDA_TIMEOUT_MS;
  const searchUrl = `${baseUrl}/foods/search?${new URLSearchParams({
    api_key: args.apiKey,
    query: queryTokens.slice(0, 5).join(' '),
    dataType: DATA_TYPES,
    pageSize: '10',
  }).toString()}`;

  const searchPayload = await fetchJson(args.fetchImpl, searchUrl, timeoutMs);
  if (searchPayload === null) return { status: 'unavailable' };

  const foods = (searchPayload as { foods?: unknown }).foods;
  if (!Array.isArray(foods) || foods.length === 0) return { status: 'no_match' };

  let best: { food: SearchFood; score: number } | null = null;
  for (const candidate of foods as SearchFood[]) {
    const description = typeof candidate.description === 'string' ? candidate.description : '';
    if (!description) continue;
    if (isExcludedDescription(description, queryTokens)) continue;
    const score = scoreMatch(queryTokens, description);
    if (score < MIN_MATCH_SCORE) continue;
    if (!best || score > best.score) best = { food: candidate, score };
  }
  if (!best) return { status: 'no_match' };

  const fdcId = typeof best.food.fdcId === 'number' ? best.food.fdcId : null;
  if (!fdcId) return { status: 'no_match' };
  const description = String(best.food.description ?? '');
  const dataType = typeof best.food.dataType === 'string' ? best.food.dataType : '';

  // Search results carry a partial panel; the detail endpoint has the complete
  // one. If the detail call fails, the partial panel is still usable, and if
  // neither has a complete panel this is a miss rather than a guess.
  const detailPayload = await fetchJson(
    args.fetchImpl,
    `${baseUrl}/food/${fdcId}?${new URLSearchParams({ api_key: args.apiKey }).toString()}`,
    timeoutMs,
  );
  const detailNutrients =
    detailPayload && typeof detailPayload === 'object'
      ? (detailPayload as { foodNutrients?: unknown }).foodNutrients
      : null;

  const fromDetail = detailNutrients
    ? toUsdaMatch(fdcId, description, dataType, detailNutrients)
    : null;
  if (fromDetail) return { status: 'matched', match: fromDetail };

  const fromSearch = toUsdaMatch(fdcId, description, dataType, best.food.foodNutrients);
  if (fromSearch) return { status: 'matched', match: fromSearch };

  return { status: 'no_match' };
}
