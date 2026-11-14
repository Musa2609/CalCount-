import type { Food, FoodLog, FoodServing, SavedMealItem } from '@/types/models';

function servingsFor(id: string, label: string, grams: number): FoodServing[] {
  const definitions = [
    { label, grams },
    { label: '100 g', grams: 100 },
  ];
  return definitions
    .filter(
      (serving, index, all) =>
        all.findIndex((candidate) => candidate.grams === serving.grams) === index,
    )
    .map((serving, index) => ({
      id: `${id.slice(0, 24)}${String(index + 1).padStart(12, '0')}`,
      foodId: id,
      label: serving.label,
      grams: serving.grams,
      isDefault: index === 0,
      sortOrder: index + 1,
    }));
}

/**
 * Rebuilds a loggable food from a diary entry's stored snapshot.
 * Logs keep an immutable nutrient snapshot, so this never re-reads a food row
 * that may have changed since it was logged.
 */
export function foodFromLog(log: FoodLog): Food {
  const label = log.servingLabel ?? '1 serving';
  const grams = log.servingGrams ?? 100;
  return {
    id: log.customFoodId ?? log.foodId ?? `snapshot-${log.id}`,
    userId: null,
    name: log.foodName,
    brand: log.brand,
    category: 'From your diary',
    description: null,
    servingName: label,
    servingGrams: grams,
    caloriesPer100g: log.caloriesPer100g,
    proteinPer100g: log.proteinPer100g,
    carbsPer100g: log.carbsPer100g,
    fatPer100g: log.fatPer100g,
    fiberPer100g: log.fiberPer100g,
    sugarPer100g: log.sugarPer100g,
    sodiumPer100g: log.sodiumPer100g,
    source: log.source,
    sourceUrl: null,
    dataQuality: log.dataQuality,
    cuisine: null,
    barcode: null,
    imageUrl: log.imageUrl,
    isPublic: false,
    isCustom: Boolean(log.customFoodId),
    servings: servingsFor(log.id, label, grams),
    createdAt: log.createdAt,
  };
}

export function foodFromSavedItem(item: SavedMealItem): Food {
  const label = item.servingLabel ?? '1 serving';
  const grams = item.servingGrams ?? 100;
  return {
    id: item.customFoodId ?? item.foodId ?? `saved-${item.id}`,
    userId: null,
    name: item.foodName,
    brand: item.brand,
    category: 'Saved meal',
    description: null,
    servingName: label,
    servingGrams: grams,
    caloriesPer100g: item.caloriesPer100g,
    proteinPer100g: item.proteinPer100g,
    carbsPer100g: item.carbsPer100g,
    fatPer100g: item.fatPer100g,
    fiberPer100g: item.fiberPer100g,
    sugarPer100g: item.sugarPer100g,
    sodiumPer100g: item.sodiumPer100g,
    source: item.source,
    sourceUrl: null,
    dataQuality: item.dataQuality,
    cuisine: null,
    barcode: null,
    imageUrl: null,
    isPublic: false,
    isCustom: Boolean(item.customFoodId),
    servings: servingsFor(item.id, label, grams),
    createdAt: new Date().toISOString(),
  };
}
