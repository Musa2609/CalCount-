import { appEnv } from '@/lib/env';
import { errorMessage } from '@/lib/utils';
import type { Food, FoodServing } from '@/types/models';

/**
 * Open Food Facts integration for packaged products.
 *
 * Data is contributed by OFF volunteers, so results are always tagged with
 * `dataQuality: 'openfoodfacts'` and surfaced with an attribution notice and a
 * "check the label" caveat. Nothing here is presented as verified by CalCount.
 */

const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'brands',
  'categories',
  'image_front_small_url',
  'serving_size',
  'serving_quantity',
  'quantity',
  'nutriments',
].join(',');

const REQUEST_TIMEOUT_MS = 9000;

interface OffNutriments {
  [key: string]: number | string | undefined;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  categories?: string;
  image_front_small_url?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  quantity?: string;
  nutriments?: OffNutriments;
}

interface OffSearchResponse {
  products?: OffProduct[];
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return null;
  return parsed;
}

function energyKcalPer100g(nutriments: OffNutriments): number | null {
  const direct = toNumber(nutriments['energy-kcal_100g']);
  if (direct !== null) return direct;
  const kilojoules = toNumber(nutriments.energy_100g);
  if (kilojoules !== null) return kilojoules / 4.184;
  return null;
}

function servingsFor(id: string, label: string, grams: number): FoodServing[] {
  return [
    { label, grams },
    { label: '100 g', grams: 100 },
  ]
    .filter((serving, index, all) => all.findIndex((s) => s.grams === serving.grams) === index)
    .map((serving, index) => ({
      id: `${id.slice(0, 24)}${String(index + 1).padStart(12, '0')}`,
      foodId: id,
      label: serving.label,
      grams: serving.grams,
      isDefault: index === 0,
      sortOrder: index + 1,
    }));
}

export function mapOffProduct(product: OffProduct): Food | null {
  const name = (product.product_name_en || product.product_name || '').trim();
  const code = (product.code ?? '').trim();
  const nutriments = product.nutriments ?? {};
  const calories = energyKcalPer100g(nutriments);
  if (!name || !code || calories === null) return null;
  if (calories < 0 || calories > 950) return null;

  const id = `off-${code}`;
  const servingGrams = toNumber(product.serving_quantity);
  const grams = servingGrams && servingGrams > 0 && servingGrams <= 2000 ? servingGrams : 100;
  const servingLabel = product.serving_size?.trim() || (grams === 100 ? '100 g' : `${grams} g serving`);

  const sodiumGrams = toNumber(nutriments.sodium_100g);
  const saltGrams = toNumber(nutriments.salt_100g);

  return {
    id,
    userId: null,
    name,
    brand: product.brands?.split(',')[0]?.trim() || null,
    category: 'Packaged',
    description: product.categories?.split(',').slice(0, 3).join(' · ') || null,
    servingName: servingLabel,
    servingGrams: grams,
    caloriesPer100g: Math.round(calories),
    proteinPer100g: Math.max(0, toNumber(nutriments.proteins_100g) ?? 0),
    carbsPer100g: Math.max(0, toNumber(nutriments.carbohydrates_100g) ?? 0),
    fatPer100g: Math.max(0, toNumber(nutriments.fat_100g) ?? 0),
    fiberPer100g: toNumber(nutriments.fiber_100g),
    sugarPer100g: toNumber(nutriments.sugars_100g),
    sodiumPer100g:
      sodiumGrams !== null
        ? sodiumGrams * 1000
        : saltGrams !== null
          ? saltGrams * 400
          : null,
    source: 'Open Food Facts',
    sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
    dataQuality: 'openfoodfacts',
    cuisine: 'packaged',
    barcode: code,
    imageUrl: product.image_front_small_url ?? null,
    isPublic: true,
    servings: servingsFor(id, servingLabel, grams),
    createdAt: new Date().toISOString(),
  };
}

async function requestJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Open Food Facts responded with ${response.status}`);
  }
  return response.json();
}

export interface OffSearchOutcome {
  foods: Food[];
  error: string | null;
}

/** Searches packaged products. Failures are reported, never silently replaced by fake data. */
export async function searchOpenFoodFacts(query: string, limit = 15): Promise<OffSearchOutcome> {
  const term = query.trim();
  if (!appEnv.openFoodFactsEnabled || term.length < 2) return { foods: [], error: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url =
      `${SEARCH_URL}?search_terms=${encodeURIComponent(term)}` +
      `&search_simple=1&action=process&json=1&page_size=${limit}&fields=${FIELDS}`;
    const payload = (await requestJson(url, controller.signal)) as OffSearchResponse;
    const foods = (payload.products ?? [])
      .map(mapOffProduct)
      .filter((food): food is Food => Boolean(food));
    return { foods, error: null };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'The packaged-food lookup timed out.'
        : errorMessage(error, 'Packaged-food search is unavailable right now.');
    return { foods: [], error: message };
  } finally {
    clearTimeout(timer);
  }
}

export const BARCODE_DISABLED_MESSAGE =
  'Barcode lookup is turned off in this build. Set EXPO_PUBLIC_OPEN_FOOD_FACTS to true to enable it.';

/**
 * Every way a barcode lookup can end. Callers must branch on `status`: turning
 * an outage into "product not found" tells the user to give up on a product
 * that may well exist.
 */
export type BarcodeLookupOutcome =
  | { status: 'found'; barcode: string; food: Food }
  | { status: 'not_found'; barcode: string }
  | { status: 'disabled'; barcode: string }
  | { status: 'invalid'; barcode: string }
  | { status: 'network_error'; barcode: string; timedOut: boolean }
  | { status: 'service_error'; barcode: string; httpStatus: number }
  | { status: 'invalid_response'; barcode: string };

/** Looks a barcode up on Open Food Facts, distinguishing every failure mode. */
export async function lookupOpenFoodFactsBarcode(rawBarcode: string): Promise<BarcodeLookupOutcome> {
  const barcode = rawBarcode.replace(/\D/g, '');
  if (!appEnv.openFoodFactsEnabled) return { status: 'disabled', barcode };
  if (barcode.length < 6) return { status: 'invalid', barcode };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${PRODUCT_URL}/${barcode}.json?fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } catch {
    // Offline, DNS failure or a request that ran past the timeout.
    return { status: 'network_error', barcode, timedOut: controller.signal.aborted };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) return { status: 'not_found', barcode };
  if (!response.ok) {
    return { status: 'service_error', barcode, httpStatus: response.status };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: 'invalid_response', barcode };
  }
  if (!payload || typeof payload !== 'object') return { status: 'invalid_response', barcode };

  const record = payload as { product?: OffProduct; status?: number; status_verbose?: string };
  const reportedMissing =
    record.status === 0 ||
    (typeof record.status_verbose === 'string' && /not found/i.test(record.status_verbose));
  if (reportedMissing || !record.product) return { status: 'not_found', barcode };

  const food = mapOffProduct(record.product);
  // The product exists but carries no usable name or energy value.
  if (!food) return { status: 'invalid_response', barcode };

  return { status: 'found', barcode, food };
}

/** Human-readable message for every non-`found` outcome. */
export function barcodeFailureMessage(
  outcome: Exclude<BarcodeLookupOutcome, { status: 'found' }>,
): string {
  switch (outcome.status) {
    case 'disabled':
      return BARCODE_DISABLED_MESSAGE;
    case 'invalid':
      return 'Enter at least 6 digits from the barcode.';
    case 'not_found':
      return `No product found for barcode ${outcome.barcode}. Try searching by name or add it manually.`;
    case 'network_error':
      return outcome.timedOut
        ? 'Open Food Facts took too long to answer. Check your connection and try again.'
        : 'Could not reach Open Food Facts. Check your connection and try again.';
    case 'service_error':
      return `Open Food Facts is having trouble right now (HTTP ${outcome.httpStatus}). Try again in a few minutes.`;
    case 'invalid_response':
      return 'Open Food Facts returned a response CalCount could not read. Try again.';
  }
}

/**
 * Convenience wrapper for callers that only care whether a product was found.
 * Prefer {@link lookupOpenFoodFactsBarcode} when the reason for a miss matters.
 */
export async function findOpenFoodFactsByBarcode(barcode: string): Promise<Food | null> {
  const outcome = await lookupOpenFoodFactsBarcode(barcode);
  return outcome.status === 'found' ? outcome.food : null;
}
