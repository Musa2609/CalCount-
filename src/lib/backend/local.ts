import AsyncStorage from '@react-native-async-storage/async-storage';

import { SEED_FOODS } from '@/data/seed';
import {
  assembleDiary,
  buildDefaultServings,
  customFoodToFood,
  makeFoodLog,
  recalculateLog,
} from '@/lib/backend/helpers';
import type { DataBackend, FoodSearchOptions, SaveMealInput } from '@/lib/backend/types';
import { nutrientsForQuantity } from '@/lib/nutrition';
import { makeId } from '@/lib/utils';
import {
  MEAL_TYPES,
  type CustomFoodInput,
  type DailyGoal,
  type DiaryDay,
  type Food,
  type FoodLog,
  type MealRecord,
  type Nutrients,
  type Profile,
  type Recipe,
  type RecipeIngredient,
  type RecipeInput,
  type SavedMeal,
  type SavedMealItem,
  type UpdateLogInput,
  type WeightLog,
} from '@/types/models';

const DB_KEY = 'calcount:local:db:v1';
export const LOCAL_SESSION_KEY = 'calcount:local:session:v1';
export const LOCAL_USER_ID = '00000000-0000-4000-8000-00000000caca';

type StoredFoodLog = Omit<FoodLog, keyof Nutrients> & {
  idempotencyKey?: string;
};

interface LocalDb {
  version: 1;
  profiles: Record<string, Profile>;
  customFoods: Food[];
  meals: MealRecord[];
  logs: StoredFoodLog[];
  savedMeals: SavedMeal[];
  recipes: Recipe[];
  weights: WeightLog[];
  goals: DailyGoal[];
  favourites: Record<string, string[]>; // userId -> foodId[]
}

interface LocalDbFile extends Partial<Omit<LocalDb, 'version'>> {
  version?: number;
}

function emptyDb(): LocalDb {
  return {
    version: 1,
    profiles: {},
    customFoods: [],
    meals: [],
    logs: [],
    savedMeals: [],
    recipes: [],
    weights: [],
    goals: [],
    favourites: {},
  };
}

function stripTotals(log: FoodLog): StoredFoodLog {
  const { calories: _calories, protein: _protein, carbs: _carbs, fat: _fat, fiber: _fiber, ...rest } = log;
  return rest;
}

function hydrateLog(log: StoredFoodLog): FoodLog {
  return recalculateLog(log);
}

let cache: LocalDb | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

async function loadDb(): Promise<LocalDb> {
  if (cache) return cache;
  let loaded: LocalDb;
  try {
    const raw = await AsyncStorage.getItem(DB_KEY);
    const parsed = raw ? (JSON.parse(raw) as LocalDbFile) : null;
    loaded = {
      ...emptyDb(),
      ...(parsed ?? {}),
      version: 1,
      profiles: parsed?.profiles ?? {},
      customFoods: parsed?.customFoods ?? [],
      meals: parsed?.meals ?? [],
      logs: parsed?.logs ?? [],
      savedMeals: parsed?.savedMeals ?? [],
      recipes: parsed?.recipes ?? [],
      weights: parsed?.weights ?? [],
      goals: parsed?.goals ?? [],
      favourites: parsed?.favourites ?? {},
    };
  } catch {
    loaded = emptyDb();
  }
  cache = loaded;
  return loaded;
}

function mutate<T>(mutator: (draft: LocalDb) => T | Promise<T>): Promise<T> {
  const task = writeQueue.then(async () => {
    const current = await loadDb();
    const draft: LocalDb = JSON.parse(JSON.stringify(current)) as LocalDb;
    const result = await mutator(draft);
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(draft));
    cache = draft;
    return result;
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

function sortFoods(foods: Food[], query: string): Food[] {
  const needle = query.trim().toLowerCase();
  return foods.sort((a, b) => {
    if (needle) {
      const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
    }
    const aIndian = a.cuisine === 'indian' ? 0 : 1;
    const bIndian = b.cuisine === 'indian' ? 0 : 1;
    if (aIndian !== bIndian) return aIndian - bIndian;
    return a.name.localeCompare(b.name);
  });
}

export class LocalBackend implements DataBackend {
  mode = 'local' as const;

  async getProfile(userId: string): Promise<Profile | null> {
    const db = await loadDb();
    return db.profiles[userId] ?? null;
  }

  async upsertProfile(profile: Profile): Promise<Profile> {
    return mutate((draft) => {
      const stored: Profile = { ...profile, id: profile.id, updatedAt: new Date().toISOString() };
      draft.profiles[profile.id] = stored;
      return stored;
    });
  }

  async updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
    return mutate((draft) => {
      const existing = draft.profiles[userId];
      if (!existing) throw new Error('Profile not found');
      const updated: Profile = {
        ...existing,
        ...patch,
        id: userId,
        updatedAt: new Date().toISOString(),
      };
      draft.profiles[userId] = updated;
      return updated;
    });
  }

  async searchFoods(userId: string, options: FoodSearchOptions = {}): Promise<Food[]> {
    const db = await loadDb();
    const query = (options.query ?? '').trim().toLowerCase();
    const custom = db.customFoods.filter((food) => food.userId === userId);
    const pool = [...SEED_FOODS, ...custom];
    const filtered = pool.filter((food) => {
      if (options.category && food.category !== options.category) return false;
      if (options.indianOnly && food.cuisine !== 'indian') return false;
      if (!query) return true;
      const haystack = [food.name, food.brand ?? '', food.category, food.description ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
    return sortFoods(filtered, query).slice(0, options.limit ?? 80);
  }

  async listCustomFoods(userId: string): Promise<Food[]> {
    const db = await loadDb();
    return db.customFoods.filter((food) => food.userId === userId);
  }

  async getFood(userId: string, foodId: string): Promise<Food | null> {
    const db = await loadDb();
    return (
      db.customFoods.find((food) => food.id === foodId && food.userId === userId) ??
      SEED_FOODS.find((food) => food.id === foodId) ??
      null
    );
  }

  async createCustomFood(userId: string, input: CustomFoodInput): Promise<Food> {
    const now = new Date().toISOString();
    const food = customFoodToFood(userId, input, makeId('food'), now);
    return mutate((draft) => {
      draft.customFoods.unshift(food);
      return food;
    });
  }

  async deleteCustomFood(userId: string, foodId: string): Promise<void> {
    return mutate((draft) => {
      draft.customFoods = draft.customFoods.filter(
        (food) => !(food.id === foodId && food.userId === userId),
      );
    });
  }

  async listFavourites(userId: string): Promise<string[]> {
    const db = await loadDb();
    return db.favourites?.[userId] ?? [];
  }

  async toggleFavourite(userId: string, foodId: string): Promise<boolean> {
    return mutate((draft) => {
      if (!draft.favourites) draft.favourites = {};
      const current = draft.favourites[userId] ?? [];
      const index = current.indexOf(foodId);
      if (index >= 0) {
        current.splice(index, 1);
        draft.favourites[userId] = current;
        return false;
      }
      draft.favourites[userId] = [...current, foodId];
      return true;
    });
  }

  async listRecentlyUsed(userId: string, limit = 10): Promise<Food[]> {
    const db = await loadDb();
    const recentLogs = db.logs
      .filter((log) => log.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const seen = new Set<string>();
    const foodIds: string[] = [];
    for (const log of recentLogs) {
      const foodId = log.customFoodId ?? log.foodId;
      if (foodId && !seen.has(foodId)) {
        seen.add(foodId);
        foodIds.push(foodId);
        if (foodIds.length >= limit) break;
      }
    }
    const foods: Food[] = [];
    for (const id of foodIds) {
      const food = await this.getFood(userId, id);
      if (food) foods.push(food);
    }
    return foods;
  }

  async ensureMeals(userId: string, date: string): Promise<MealRecord[]> {
    return mutate((draft) => {
      const now = new Date().toISOString();
      for (const mealType of MEAL_TYPES) {
        const existing = draft.meals.find(
          (meal) =>
            meal.userId === userId && meal.logDate === date && meal.mealType === mealType,
        );
        if (!existing) {
          draft.meals.push({
            id: makeId('meal'),
            userId,
            logDate: date,
            mealType,
            notes: null,
            createdAt: now,
          });
        }
      }
      return draft.meals.filter((meal) => meal.userId === userId && meal.logDate === date);
    });
  }

  async getDiary(userId: string, date: string): Promise<DiaryDay> {
    const meals = await this.ensureMeals(userId, date);
    const db = await loadDb();
    const logs = db.logs
      .filter((log) => log.userId === userId && log.logDate === date)
      .map(hydrateLog);
    return assembleDiary(date, meals, logs);
  }

  async getFoodLog(userId: string, logId: string): Promise<FoodLog | null> {
    const db = await loadDb();
    const log = db.logs.find((entry) => entry.userId === userId && entry.id === logId);
    return log ? hydrateLog(log) : null;
  }

  async listLogsRange(userId: string, startDate: string, endDate: string): Promise<FoodLog[]> {
    const db = await loadDb();
    return db.logs
      .filter(
        (log) =>
          log.userId === userId && log.logDate >= startDate && log.logDate <= endDate,
      )
      .map(hydrateLog)
      .sort((a, b) => a.logDate.localeCompare(b.logDate));
  }

  async addFoodLog(userId: string, input: Parameters<DataBackend['addFoodLog']>[1]): Promise<FoodLog> {
    const [log] = await this.addFoodLogs(userId, [input]);
    return log;
  }

  async addFoodLogs(
    userId: string,
    inputs: Parameters<DataBackend['addFoodLogs']>[1],
  ): Promise<FoodLog[]> {
    if (!inputs.length) return [];
    return mutate((draft) => {
      const now = new Date().toISOString();
      const results: FoodLog[] = [];
      for (const input of inputs) {
        const duplicate = input.idempotencyKey
          ? draft.logs.find(
              (log) =>
                log.userId === userId && log.idempotencyKey === input.idempotencyKey,
            )
          : undefined;

        if (duplicate) {
          results.push(hydrateLog(duplicate));
          continue;
        }

        let meal = draft.meals.find(
          (record) =>
            record.userId === userId &&
            record.logDate === input.logDate &&
            record.mealType === input.mealType,
        );
        if (!meal) {
          meal = {
            id: makeId('meal'),
            userId,
            logDate: input.logDate,
            mealType: input.mealType,
            notes: null,
            createdAt: now,
          };
          draft.meals.push(meal);
        }

        const log = makeFoodLog(userId, meal.id, input, makeId('log'), now);
        const stored = { ...stripTotals(log), idempotencyKey: input.idempotencyKey };
        draft.logs.push(stored);
        results.push(log);
      }
      return results;
    });
  }

  async updateFoodLog(userId: string, logId: string, patch: UpdateLogInput): Promise<FoodLog> {
    return mutate((draft) => {
      const stored = draft.logs.find((log) => log.userId === userId && log.id === logId);
      if (!stored) throw new Error('Food log not found');
      const old = hydrateLog(stored);
      const nextDate = patch.logDate ?? old.logDate;
      const nextMealType = patch.mealType ?? old.mealType;
      let meal = draft.meals.find(
        (record) =>
          record.userId === userId &&
          record.logDate === nextDate &&
          record.mealType === nextMealType,
      );
      if (!meal) {
        meal = {
          id: makeId('meal'),
          userId,
          logDate: nextDate,
          mealType: nextMealType,
          notes: null,
          createdAt: new Date().toISOString(),
        };
        draft.meals.push(meal);
      }
      const updated: FoodLog = {
        ...old,
        quantityGrams: patch.quantityGrams ?? old.quantityGrams,
        servingLabel:
          patch.servingLabel !== undefined ? patch.servingLabel : old.servingLabel,
        servingGrams:
          patch.servingGrams !== undefined ? patch.servingGrams : old.servingGrams,
        mealType: nextMealType,
        logDate: nextDate,
        mealId: meal.id,
        updatedAt: new Date().toISOString(),
      };
      const recalculated = recalculateLog(updated);
      draft.logs = draft.logs.map((entry) =>
        entry.id === logId ? stripTotals(recalculated) : entry,
      );
      return recalculated;
    });
  }

  async deleteFoodLog(userId: string, logId: string): Promise<void> {
    return mutate((draft) => {
      draft.logs = draft.logs.filter(
        (log) => !(log.id === logId && log.userId === userId),
      );
    });
  }

  async listSavedMeals(userId: string): Promise<SavedMeal[]> {
    const db = await loadDb();
    return db.savedMeals
      .filter((meal) => meal.userId === userId)
      .map((meal) => ({
        ...meal,
        totals: sumSavedMealItems(meal.items),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createSavedMeal(userId: string, input: SaveMealInput): Promise<SavedMeal> {
    return mutate((draft) => {
      const id = makeId('saved');
      const items: SavedMealItem[] = input.logs.map((log, index) => ({
        id: makeId('saveditem'),
        savedMealId: id,
        foodId: log.foodId,
        customFoodId: log.customFoodId,
        foodName: log.foodName,
        brand: log.brand,
        quantityGrams: log.quantityGrams,
        servingLabel: log.servingLabel,
        servingGrams: log.servingGrams,
        caloriesPer100g: log.caloriesPer100g,
        proteinPer100g: log.proteinPer100g,
        carbsPer100g: log.carbsPer100g,
        fatPer100g: log.fatPer100g,
        fiberPer100g: log.fiberPer100g,
        sugarPer100g: log.sugarPer100g,
        sodiumPer100g: log.sodiumPer100g,
        source: log.source,
        dataQuality: log.dataQuality,
        sortOrder: index,
      }));
      const saved: SavedMeal = {
        id,
        userId,
        name: input.name.trim(),
        mealType: input.mealType,
        items,
        totals: sumSavedMealItems(items),
        createdAt: new Date().toISOString(),
      };
      draft.savedMeals.unshift(saved);
      return saved;
    });
  }

  async deleteSavedMeal(userId: string, savedMealId: string): Promise<void> {
    return mutate((draft) => {
      draft.savedMeals = draft.savedMeals.filter(
        (meal) => !(meal.id === savedMealId && meal.userId === userId),
      );
    });
  }

  async listRecipes(userId: string): Promise<Recipe[]> {
    const db = await loadDb();
    return (db.recipes ?? [])
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRecipe(userId: string, recipeId: string): Promise<Recipe | null> {
    const db = await loadDb();
    return (db.recipes ?? []).find((r) => r.id === recipeId && r.userId === userId) ?? null;
  }

  private computeRecipeTotals(ingredients: RecipeIngredient[], servings: number) {
    const totals = ingredients.reduce(
      (acc, ing) => {
        const n = nutrientsForQuantity(
          {
            caloriesPer100g: ing.caloriesPer100g,
            proteinPer100g: ing.proteinPer100g,
            carbsPer100g: ing.carbsPer100g,
            fatPer100g: ing.fatPer100g,
            fiberPer100g: ing.fiberPer100g,
          },
          ing.quantityGrams,
        );
        return {
          calories: acc.calories + n.calories,
          protein: acc.protein + n.protein,
          carbs: acc.carbs + n.carbs,
          fat: acc.fat + n.fat,
          fiber: acc.fiber + n.fiber,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );
    const safeServings = servings > 0 ? servings : 1;
    return {
      totalCalories: totals.calories,
      totalProtein: Math.round(totals.protein * 10) / 10,
      totalCarbs: Math.round(totals.carbs * 10) / 10,
      totalFat: Math.round(totals.fat * 10) / 10,
      totalFiber: Math.round(totals.fiber * 10) / 10,
      perServingCalories: Math.round(totals.calories / safeServings),
      perServingProtein: Math.round((totals.protein / safeServings) * 10) / 10,
      perServingCarbs: Math.round((totals.carbs / safeServings) * 10) / 10,
      perServingFat: Math.round((totals.fat / safeServings) * 10) / 10,
      perServingFiber: Math.round((totals.fiber / safeServings) * 10) / 10,
    };
  }

  async createRecipe(userId: string, input: RecipeInput): Promise<Recipe> {
    return mutate((draft) => {
      const id = makeId('recipe');
      const now = new Date().toISOString();
      const ingredients: RecipeIngredient[] = input.ingredients.map((ing, index) => ({
        ...ing,
        id: makeId('ring'),
        recipeId: id,
        sortOrder: index,
      }));
      const totals = this.computeRecipeTotals(ingredients, input.servings);
      const recipe: Recipe = {
        id,
        userId,
        name: input.name.trim(),
        servings: input.servings,
        servingWeightG: input.servingWeightG ?? null,
        notes: input.notes ?? null,
        ingredients,
        ...totals,
        createdAt: now,
        updatedAt: now,
      };
      if (!draft.recipes) draft.recipes = [];
      draft.recipes.unshift(recipe);
      return recipe;
    });
  }

  async updateRecipe(userId: string, recipeId: string, input: RecipeInput): Promise<Recipe> {
    return mutate((draft) => {
      if (!draft.recipes) draft.recipes = [];
      const existing = draft.recipes.find((r) => r.id === recipeId && r.userId === userId);
      if (!existing) throw new Error('Recipe not found');
      const ingredients: RecipeIngredient[] = input.ingredients.map((ing, index) => ({
        ...ing,
        id: makeId('ring'),
        recipeId,
        sortOrder: index,
      }));
      const totals = this.computeRecipeTotals(ingredients, input.servings);
      const updated: Recipe = {
        ...existing,
        name: input.name.trim(),
        servings: input.servings,
        servingWeightG: input.servingWeightG ?? null,
        notes: input.notes ?? null,
        ingredients,
        ...totals,
        updatedAt: new Date().toISOString(),
      };
      draft.recipes = draft.recipes.map((r) => (r.id === recipeId ? updated : r));
      return updated;
    });
  }

  async deleteRecipe(userId: string, recipeId: string): Promise<void> {
    return mutate((draft) => {
      if (!draft.recipes) return;
      draft.recipes = draft.recipes.filter(
        (r) => !(r.id === recipeId && r.userId === userId),
      );
    });
  }

  async listWeights(userId: string, sinceDate?: string): Promise<WeightLog[]> {
    const db = await loadDb();
    return db.weights
      .filter(
        (weight) =>
          weight.userId === userId && (!sinceDate || weight.logDate >= sinceDate),
      )
      .sort((a, b) => a.logDate.localeCompare(b.logDate));
  }

  async upsertWeight(
    userId: string,
    input: { logDate: string; weightKg: number; note?: string | null },
  ): Promise<WeightLog> {
    return mutate((draft) => {
      const now = new Date().toISOString();
      const existing = draft.weights.find(
        (weight) => weight.userId === userId && weight.logDate === input.logDate,
      );
      const weight: WeightLog = {
        id: existing?.id ?? makeId('weight'),
        userId,
        logDate: input.logDate,
        weightKg: input.weightKg,
        note: input.note ?? null,
        createdAt: existing?.createdAt ?? now,
      };
      draft.weights = draft.weights.filter(
        (entry) => !(entry.userId === userId && entry.logDate === input.logDate),
      );
      draft.weights.push(weight);
      const latest = [...draft.weights]
        .filter((entry) => entry.userId === userId)
        .sort((a, b) => b.logDate.localeCompare(a.logDate))[0];
      const profile = draft.profiles[userId];
      if (profile && latest) {
        draft.profiles[userId] = {
          ...profile,
          currentWeightKg: latest.weightKg,
          updatedAt: now,
        };
      }
      return weight;
    });
  }

  async deleteWeight(userId: string, weightId: string): Promise<void> {
    return mutate((draft) => {
      draft.weights = draft.weights.filter(
        (weight) => !(weight.id === weightId && weight.userId === userId),
      );
      const latest = [...draft.weights]
        .filter((entry) => entry.userId === userId)
        .sort((a, b) => b.logDate.localeCompare(a.logDate))[0];
      const profile = draft.profiles[userId];
      if (profile) {
        draft.profiles[userId] = {
          ...profile,
          currentWeightKg: latest?.weightKg ?? profile.currentWeightKg,
          updatedAt: new Date().toISOString(),
        };
      }
    });
  }

  async getGoalForDate(userId: string, date: string): Promise<DailyGoal | null> {
    const db = await loadDb();
    return (
      db.goals
        .filter((goal) => goal.userId === userId && goal.effectiveDate <= date)
        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null
    );
  }

  async listGoals(userId: string): Promise<DailyGoal[]> {
    const db = await loadDb();
    return db.goals
      .filter((goal) => goal.userId === userId)
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  }

  async upsertGoal(
    userId: string,
    input: Omit<DailyGoal, 'id' | 'userId'>,
  ): Promise<DailyGoal> {
    return mutate((draft) => {
      const existing = draft.goals.find(
        (goal) => goal.userId === userId && goal.effectiveDate === input.effectiveDate,
      );
      const goal: DailyGoal = {
        ...input,
        id: existing?.id ?? makeId('goal'),
        userId,
      };
      draft.goals = draft.goals.filter(
        (entry) =>
          !(entry.userId === userId && entry.effectiveDate === input.effectiveDate),
      );
      draft.goals.push(goal);
      return goal;
    });
  }
}

export function sumSavedMealItems(items: SavedMealItem[]): Nutrients {
  return items.reduce<Nutrients>(
    (total, item) => {
      const nutrients = nutrientsForQuantity(
        {
          caloriesPer100g: item.caloriesPer100g,
          proteinPer100g: item.proteinPer100g,
          carbsPer100g: item.carbsPer100g,
          fatPer100g: item.fatPer100g,
          fiberPer100g: item.fiberPer100g,
        },
        item.quantityGrams,
      );
      return {
        calories: total.calories + nutrients.calories,
        protein: Math.round((total.protein + nutrients.protein) * 10) / 10,
        carbs: Math.round((total.carbs + nutrients.carbs) * 10) / 10,
        fat: Math.round((total.fat + nutrients.fat) * 10) / 10,
        fiber: Math.round((total.fiber + nutrients.fiber) * 10) / 10,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

/** Used by local UI to create a hydrated Food for saved-meal items. */
export function savedItemToFood(item: SavedMealItem): Food {
  return {
    id: item.customFoodId ?? item.foodId ?? `saved-${item.id}`,
    userId: null,
    name: item.foodName,
    brand: item.brand,
    category: 'Saved',
    description: null,
    servingName: item.servingLabel ?? '1 serving',
    servingGrams: item.servingGrams ?? 100,
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
    servings: buildDefaultServings(item.foodId ?? item.id, item.servingLabel ?? '1 serving', item.servingGrams ?? 100),
    createdAt: new Date().toISOString(),
  };
}
