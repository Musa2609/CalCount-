import { MEAL_TYPES } from '@/types/models';
import type {
  CustomFoodInput,
  DiaryDay,
  Food,
  FoodLog,
  FoodServing,
  LogFoodInput,
  MealRecord,
  MealSection,
  Nutrients,
} from '@/types/models';
import { makeId } from '@/lib/utils';
import { nutrientsForQuantity, sumNutrients } from '@/lib/nutrition';

export function buildDefaultServings(
  foodId: string,
  servingName: string,
  servingGrams: number,
  existing: FoodServing[] = [],
): FoodServing[] {
  const definitions = [
    { label: servingName, grams: servingGrams, isDefault: true },
    { label: '100 g', grams: 100, isDefault: false },
  ];
  const combined = [...existing];
  definitions.forEach((definition, index) => {
    if (!combined.some((serving) => serving.grams === definition.grams)) {
      combined.push({
        id: `${foodId.slice(0, 24)}${String(index + 1 + existing.length).padStart(12, '0')}`,
        foodId,
        label: definition.label,
        grams: definition.grams,
        isDefault: definition.isDefault,
        sortOrder: combined.length + 1,
      });
    }
  });
  return combined
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((serving, index) => ({ ...serving, sortOrder: index + 1 }));
}

export function customFoodToFood(userId: string, input: CustomFoodInput, id: string, now: string): Food {
  return {
    id,
    userId,
    name: input.name.trim(),
    brand: input.brand?.trim() || null,
    category: input.category || 'My foods',
    description: null,
    servingName: input.servingName,
    servingGrams: input.servingGrams,
    caloriesPer100g: input.caloriesPer100g,
    proteinPer100g: input.proteinPer100g,
    carbsPer100g: input.carbsPer100g,
    fatPer100g: input.fatPer100g,
    fiberPer100g: input.fiberPer100g ?? null,
    sugarPer100g: input.sugarPer100g ?? null,
    sodiumPer100g: input.sodiumPer100g ?? null,
    source: 'User entered',
    sourceUrl: null,
    dataQuality: 'user',
    cuisine: 'indian',
    barcode: null,
    imageUrl: null,
    isPublic: false,
    isCustom: true,
    servings: buildDefaultServings(id, input.servingName, input.servingGrams),
    createdAt: now,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeFoodLog(
  userId: string,
  mealId: string,
  input: LogFoodInput,
  id: string,
  now: string,
): FoodLog {
  const { food, quantityGrams } = input;
  return {
    id,
    userId,
    mealId,
    mealType: input.mealType,
    logDate: input.logDate,
    foodId: !food.isCustom && UUID_PATTERN.test(food.id) ? food.id : null,
    customFoodId: food.isCustom ? food.id : null,
    foodName: food.name,
    brand: food.brand,
    quantityGrams,
    servingLabel: input.servingLabel ?? null,
    servingGrams: input.servingGrams ?? null,
    caloriesPer100g: food.caloriesPer100g,
    proteinPer100g: food.proteinPer100g,
    carbsPer100g: food.carbsPer100g,
    fatPer100g: food.fatPer100g,
    fiberPer100g: food.fiberPer100g ?? 0,
    sugarPer100g: food.sugarPer100g ?? 0,
    sodiumPer100g: food.sodiumPer100g ?? 0,
    source: food.source,
    dataQuality: food.dataQuality,
    imageUrl: food.imageUrl,
    ...nutrientsForQuantity(food, quantityGrams),
    createdAt: now,
    updatedAt: now,
  };
}

export function assembleDiary(date: string, meals: MealRecord[], logs: FoodLog[]): DiaryDay {
  const sections: MealSection[] = MEAL_TYPES.map((mealType) => {
    const meal = meals.find((record) => record.mealType === mealType) ?? null;
    const mealLogs = logs
      .filter((log) => log.mealType === mealType)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      mealType,
      mealId: meal?.id ?? null,
      notes: meal?.notes ?? null,
      logs: mealLogs,
      totals: sumNutrients(mealLogs),
    };
  });

  return {
    date,
    meals: sections,
    totals: sumNutrients(logs),
  };
}

export function recalculateLog(log: Omit<FoodLog, keyof Nutrients>): FoodLog {
  return {
    ...log,
    ...nutrientsForQuantity(
      {
        caloriesPer100g: log.caloriesPer100g,
        proteinPer100g: log.proteinPer100g,
        carbsPer100g: log.carbsPer100g,
        fatPer100g: log.fatPer100g,
        fiberPer100g: log.fiberPer100g,
      },
      log.quantityGrams,
    ),
  };
}

export function makeMealRecord(
  userId: string,
  date: string,
  mealType: MealRecord['mealType'],
  now: string,
): MealRecord {
  return {
    id: makeId('meal'),
    userId,
    logDate: date,
    mealType,
    notes: null,
    createdAt: now,
  };
}
