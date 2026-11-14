import { errorMessage } from '@/lib/utils';
import type { Food, FoodServing } from '@/types/models';

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY ?? '';

interface UsdaFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  brandName?: string;
  foodCategory?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: { nutrientName: string; value: number; unitName: string }[];
}

interface UsdaSearchResponse {
  foods?: UsdaFood[];
  totalHits?: number;
}

function getNutrient(food: UsdaFood, names: string[]): number | null {
  for (const n of food.foodNutrients ?? []) {
    if (names.some((name) => n.nutrientName.toLowerCase().includes(name.toLowerCase()))) {
      return n.value;
    }
  }
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

export function mapUsdaFood(food: UsdaFood): Food | null {
  const name = (food.description ?? '').trim();
  if (!name) return null;

  const calories = getNutrient(food, ['energy', 'calories']);
  if (calories === null) return null;

  const protein = getNutrient(food, ['protein']) ?? 0;
  const carbs = getNutrient(food, ['carbohydrate']) ?? 0;
  const fat = getNutrient(food, ['total lipid', 'fat']) ?? 0;
  const fiber = getNutrient(food, ['fiber']);
  const sugar = getNutrient(food, ['sugars, total', 'sugar']);
  const sodium = getNutrient(food, ['sodium']);

  const servingGrams = food.servingSize && food.servingSize > 0 && food.servingSize <= 2000
    ? food.servingSize
    : 100;
  const servingLabel = food.servingSizeUnit
    ? `${servingGrams} ${food.servingSizeUnit}`
    : servingGrams === 100
      ? '100 g'
      : `${servingGrams} g serving`;

  const id = `usda-${food.fdcId}`;
  const brand = food.brandOwner?.trim() || food.brandName?.trim() || null;

  // USDA values are per 100g by default in search results
  return {
    id,
    userId: null,
    name,
    brand,
    category: food.foodCategory ?? 'USDA',
    description: null,
    servingName: servingLabel,
    servingGrams,
    caloriesPer100g: Math.round(calories),
    proteinPer100g: Math.max(0, protein),
    carbsPer100g: Math.max(0, carbs),
    fatPer100g: Math.max(0, fat),
    fiberPer100g: fiber,
    sugarPer100g: sugar,
    sodiumPer100g: sodium !== null ? sodium * 1000 : null, // mg -> per 100g (USDA sodium is in mg)
    source: 'USDA FoodData Central',
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${food.fdcId}`,
    dataQuality: 'sourced',
    cuisine: 'international',
    barcode: null,
    imageUrl: null,
    isPublic: true,
    servings: servingsFor(id, servingLabel, servingGrams),
    createdAt: new Date().toISOString(),
  };
}

export interface UsdaSearchOutcome {
  foods: Food[];
  error: string | null;
}

export async function searchUsda(query: string, limit = 15): Promise<UsdaSearchOutcome> {
  const term = query.trim();
  if (!term || term.length < 2 || !API_KEY) return { foods: [], error: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const url = `${SEARCH_URL}?api_key=${API_KEY}&query=${encodeURIComponent(term)}&pageSize=${limit}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`USDA responded with ${response.status}`);
    }
    const payload = (await response.json()) as UsdaSearchResponse;
    const foods = (payload.foods ?? [])
      .map(mapUsdaFood)
      .filter((food): food is Food => Boolean(food));
    return { foods, error: null };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'The USDA lookup timed out.'
        : errorMessage(error, 'USDA search is unavailable right now.');
    return { foods: [], error: message };
  } finally {
    clearTimeout(timer);
  }
}