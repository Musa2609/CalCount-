import rawSeed from './foodSeed.json';
import type { DataQuality, Food, FoodServing } from '@/types/models';

interface RawSeedFood {
  id: string;
  name: string;
  brand?: string;
  category: string;
  description?: string;
  servingName: string;
  servingGrams: number;
  extraServings?: { label: string; grams: number }[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  source: string;
  sourceUrl?: string;
  quality: DataQuality;
  cuisine: 'indian' | 'international' | 'packaged';
  barcode?: string;
}

const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function servingId(foodId: string, serial: number): string {
  return `${foodId.slice(0, 24)}${String(serial).padStart(12, '0')}`;
}

export function buildServings(food: RawSeedFood): FoodServing[] {
  const definitions = [
    { label: food.servingName, grams: food.servingGrams, isDefault: true },
    ...(food.extraServings ?? []).map((serving) => ({ ...serving, isDefault: false })),
    { label: '100 g', grams: 100, isDefault: false },
  ];

  return definitions
    .filter(
      (serving, index, all) =>
        all.findIndex((candidate) => candidate.grams === serving.grams) === index,
    )
    .map((serving, index) => ({
      id: servingId(food.id, index + 1),
      foodId: food.id,
      label: serving.label,
      grams: serving.grams,
      isDefault: serving.isDefault,
      sortOrder: index + 1,
    }));
}

function mapSeedFood(food: RawSeedFood): Food {
  return {
    id: food.id,
    userId: null,
    name: food.name,
    brand: food.brand ?? null,
    category: food.category,
    description: food.description ?? null,
    servingName: food.servingName,
    servingGrams: food.servingGrams,
    caloriesPer100g: food.kcal,
    proteinPer100g: food.protein,
    carbsPer100g: food.carbs,
    fatPer100g: food.fat,
    fiberPer100g: food.fiber ?? null,
    sugarPer100g: food.sugar ?? null,
    sodiumPer100g: food.sodium ?? null,
    source: food.source,
    sourceUrl: food.sourceUrl ?? null,
    dataQuality: food.quality,
    cuisine: food.cuisine,
    barcode: food.barcode ?? null,
    imageUrl: null,
    isPublic: true,
    servings: buildServings(food),
    createdAt: SEED_TIMESTAMP,
  };
}

export const SEED_FOODS: Food[] = (rawSeed.foods as RawSeedFood[]).map(mapSeedFood);

export const SEED_CATEGORIES: string[] = Array.from(
  new Set(SEED_FOODS.map((food) => food.category)),
).sort((a, b) => a.localeCompare(b));

export const foodSeedMeta = rawSeed.note;
