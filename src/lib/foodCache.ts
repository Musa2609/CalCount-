import type { Food } from '@/types/models';

/**
 * Remote search results (e.g. Open Food Facts) are not stored in our database,
 * so the detail screen needs a way to look them up after navigation.
 * An in-memory map is enough: results are transient and cheap to re-fetch.
 */
const cache = new Map<string, Food>();

export function cacheFood(food: Food): Food {
  cache.set(food.id, food);
  return food;
}

export function cacheFoods(foods: Food[]): Food[] {
  foods.forEach(cacheFood);
  return foods;
}

export function getCachedFood(id: string): Food | null {
  return cache.get(id) ?? null;
}

export function clearFoodCache(): void {
  cache.clear();
}
