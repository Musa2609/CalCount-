import { getSupabaseClient } from '@/lib/supabase/client';
import {
  assembleDiary,
  buildDefaultServings,
  recalculateLog,
} from '@/lib/backend/helpers';
import type { DataBackend, FoodSearchOptions, SaveMealInput } from '@/lib/backend/types';
import { nutrientsForQuantity } from '@/lib/nutrition';
import {
  MEAL_TYPES,
  type CustomFoodInput,
  type DailyGoal,
  type DiaryDay,
  type Food,
  type FoodLog,
  type FoodServing,
  type LogFoodInput,
  type MealRecord,
  type MealType,
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DbProfileRow {
  id: string;
  name: string;
  email: string | null;
  age: number | null;
  gender: Profile['gender'];
  height_cm: number | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  activity_level: Profile['activityLevel'];
  goal: Profile['goal'];
  unit_system: Profile['unitSystem'];
  calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

interface DbServingRow {
  id: string;
  food_id: string;
  label: string;
  grams: number;
  is_default: boolean;
  sort_order: number;
}

interface DbFoodRow {
  id: string;
  user_id: string | null;
  name: string;
  brand: string | null;
  category: string;
  description: string | null;
  serving_name: string;
  serving_grams: number;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number | null;
  sugar_per_100g: number | null;
  sodium_per_100g: number | null;
  source: string;
  source_url: string | null;
  data_quality: Food['dataQuality'];
  cuisine: Food['cuisine'];
  barcode: string | null;
  image_url: string | null;
  is_public: boolean;
  created_at: string;
  food_servings?: DbServingRow[];
}

interface DbCustomFoodRow {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  category: string;
  description: string | null;
  serving_name: string;
  serving_grams: number;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number | null;
  sugar_per_100g: number | null;
  sodium_per_100g: number | null;
  source: string;
  data_quality: Food['dataQuality'];
  created_at: string;
}

interface DbMealRow {
  id: string;
  user_id: string;
  log_date: string;
  meal_type: MealType;
  notes: string | null;
  created_at: string;
}

interface DbLogRow {
  id: string;
  user_id: string;
  meal_id: string;
  meal_type: MealType;
  log_date: string;
  food_id: string | null;
  custom_food_id: string | null;
  food_name: string;
  brand: string | null;
  quantity_grams: number;
  serving_label: string | null;
  serving_grams: number | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
  sugar_per_100g: number;
  sodium_per_100g: number;
  source: string;
  data_quality: Food['dataQuality'];
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

interface DbSavedMealRow {
  id: string;
  user_id: string;
  name: string;
  meal_type: MealType;
  created_at: string;
  saved_meal_items?: DbSavedItemRow[];
}

interface DbSavedItemRow {
  id: string;
  saved_meal_id: string;
  food_id: string | null;
  custom_food_id: string | null;
  food_name: string;
  brand: string | null;
  quantity_grams: number;
  serving_label: string | null;
  serving_grams: number | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
  sugar_per_100g: number;
  sodium_per_100g: number;
  source: string;
  data_quality: Food['dataQuality'];
  sort_order: number;
}

interface DbWeightRow {
  id: string;
  user_id: string;
  log_date: string;
  weight_kg: number;
  note: string | null;
  created_at: string;
}

interface DbGoalRow {
  id: string;
  user_id: string;
  effective_date: string;
  calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
}

function mapProfile(row: DbProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    age: row.age,
    gender: row.gender,
    heightCm: row.height_cm === null ? null : Number(row.height_cm),
    currentWeightKg: row.current_weight_kg === null ? null : Number(row.current_weight_kg),
    targetWeightKg: row.target_weight_kg === null ? null : Number(row.target_weight_kg),
    activityLevel: row.activity_level,
    goal: row.goal,
    unitSystem: row.unit_system,
    calorieTarget: Number(row.calorie_target),
    proteinTargetG: Number(row.protein_target_g),
    carbsTargetG: Number(row.carbs_target_g),
    fatTargetG: Number(row.fat_target_g),
    onboardingCompleted: row.onboarding_completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapServing(row: DbServingRow): FoodServing {
  return {
    id: row.id,
    foodId: row.food_id,
    label: row.label,
    grams: Number(row.grams),
    isDefault: row.is_default,
    sortOrder: row.sort_order,
  };
}

function mapFood(row: DbFoodRow): Food {
  const servings = (row.food_servings ?? []).map(mapServing);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    description: row.description,
    servingName: row.serving_name,
    servingGrams: Number(row.serving_grams),
    caloriesPer100g: Number(row.calories_per_100g),
    proteinPer100g: Number(row.protein_per_100g),
    carbsPer100g: Number(row.carbs_per_100g),
    fatPer100g: Number(row.fat_per_100g),
    fiberPer100g: row.fiber_per_100g === null ? null : Number(row.fiber_per_100g),
    sugarPer100g: row.sugar_per_100g === null ? null : Number(row.sugar_per_100g),
    sodiumPer100g: row.sodium_per_100g === null ? null : Number(row.sodium_per_100g),
    source: row.source,
    sourceUrl: row.source_url,
    dataQuality: row.data_quality,
    cuisine: row.cuisine,
    barcode: row.barcode,
    imageUrl: row.image_url,
    isPublic: row.is_public,
    servings: buildDefaultServings(
      row.id,
      row.serving_name,
      Number(row.serving_grams),
      servings,
    ),
    createdAt: row.created_at,
  };
}

function mapCustomFood(row: DbCustomFoodRow): Food {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    description: row.description,
    servingName: row.serving_name,
    servingGrams: Number(row.serving_grams),
    caloriesPer100g: Number(row.calories_per_100g),
    proteinPer100g: Number(row.protein_per_100g),
    carbsPer100g: Number(row.carbs_per_100g),
    fatPer100g: Number(row.fat_per_100g),
    fiberPer100g: row.fiber_per_100g === null ? null : Number(row.fiber_per_100g),
    sugarPer100g: row.sugar_per_100g === null ? null : Number(row.sugar_per_100g),
    sodiumPer100g: row.sodium_per_100g === null ? null : Number(row.sodium_per_100g),
    source: row.source,
    sourceUrl: null,
    dataQuality: row.data_quality,
    cuisine: 'indian',
    barcode: null,
    imageUrl: null,
    isPublic: false,
    isCustom: true,
    servings: buildDefaultServings(row.id, row.serving_name, Number(row.serving_grams)),
    createdAt: row.created_at,
  };
}

function mapLog(row: DbLogRow): FoodLog {
  return recalculateLog({
    id: row.id,
    userId: row.user_id,
    mealId: row.meal_id,
    mealType: row.meal_type,
    logDate: row.log_date,
    foodId: row.food_id,
    customFoodId: row.custom_food_id,
    foodName: row.food_name,
    brand: row.brand,
    quantityGrams: Number(row.quantity_grams),
    servingLabel: row.serving_label,
    servingGrams: row.serving_grams === null ? null : Number(row.serving_grams),
    caloriesPer100g: Number(row.calories_per_100g),
    proteinPer100g: Number(row.protein_per_100g),
    carbsPer100g: Number(row.carbs_per_100g),
    fatPer100g: Number(row.fat_per_100g),
    fiberPer100g: Number(row.fiber_per_100g),
    sugarPer100g: Number(row.sugar_per_100g),
    sodiumPer100g: Number(row.sodium_per_100g),
    source: row.source,
    dataQuality: row.data_quality,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapMeal(row: DbMealRow): MealRecord {
  return {
    id: row.id,
    userId: row.user_id,
    logDate: row.log_date,
    mealType: row.meal_type,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapSavedItem(row: DbSavedItemRow): SavedMealItem {
  return {
    id: row.id,
    savedMealId: row.saved_meal_id,
    foodId: row.food_id,
    customFoodId: row.custom_food_id,
    foodName: row.food_name,
    brand: row.brand,
    quantityGrams: Number(row.quantity_grams),
    servingLabel: row.serving_label,
    servingGrams: row.serving_grams === null ? null : Number(row.serving_grams),
    caloriesPer100g: Number(row.calories_per_100g),
    proteinPer100g: Number(row.protein_per_100g),
    carbsPer100g: Number(row.carbs_per_100g),
    fatPer100g: Number(row.fat_per_100g),
    fiberPer100g: Number(row.fiber_per_100g),
    sugarPer100g: Number(row.sugar_per_100g),
    sodiumPer100g: Number(row.sodium_per_100g),
    source: row.source,
    dataQuality: row.data_quality,
    sortOrder: row.sort_order,
  };
}

function mapSavedMeal(row: DbSavedMealRow): SavedMeal {
  const items = (row.saved_meal_items ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapSavedItem);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    mealType: row.meal_type,
    items,
    totals: sumSavedMealItems(items),
    createdAt: row.created_at,
  };
}

function mapWeight(row: DbWeightRow): WeightLog {
  return {
    id: row.id,
    userId: row.user_id,
    logDate: row.log_date,
    weightKg: Number(row.weight_kg),
    note: row.note,
    createdAt: row.created_at,
  };
}

function mapGoal(row: DbGoalRow): DailyGoal {
  return {
    id: row.id,
    userId: row.user_id,
    effectiveDate: row.effective_date,
    calorieTarget: Number(row.calorie_target),
    proteinTargetG: Number(row.protein_target_g),
    carbsTargetG: Number(row.carbs_target_g),
    fatTargetG: Number(row.fat_target_g),
  };
}

function sumSavedMealItems(items: SavedMealItem[]): Nutrients {
  return items.reduce<Nutrients>(
    (total, item) => {
      const n = nutrientsForQuantity(
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
        calories: total.calories + n.calories,
        protein: Math.round((total.protein + n.protein) * 10) / 10,
        carbs: Math.round((total.carbs + n.carbs) * 10) / 10,
        fat: Math.round((total.fat + n.fat) * 10) / 10,
        fiber: Math.round((total.fiber + n.fiber) * 10) / 10,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

function profileRow(profile: Profile) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    age: profile.age,
    gender: profile.gender,
    height_cm: profile.heightCm,
    current_weight_kg: profile.currentWeightKg,
    target_weight_kg: profile.targetWeightKg,
    activity_level: profile.activityLevel,
    goal: profile.goal,
    unit_system: profile.unitSystem,
    calorie_target: profile.calorieTarget,
    protein_target_g: profile.proteinTargetG,
    carbs_target_g: profile.carbsTargetG,
    fat_target_g: profile.fatTargetG,
    onboarding_completed: profile.onboardingCompleted,
  };
}

function sanitizeSearchTerm(value: string): string {
  return value.replace(/[%,()*]/g, ' ').trim();
}

function sortFoodResults(foods: Food[], query: string): Food[] {
  const needle = query.trim().toLowerCase();
  return foods.sort((a, b) => {
    if (needle) {
      const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
    }
    const aCustom = a.isCustom ? 0 : 1;
    const bCustom = b.isCustom ? 0 : 1;
    if (aCustom !== bCustom) return aCustom - bCustom;
    const aIndian = a.cuisine === 'indian' ? 0 : 1;
    const bIndian = b.cuisine === 'indian' ? 0 : 1;
    if (aIndian !== bIndian) return aIndian - bIndian;
    return a.name.localeCompare(b.name);
  });
}

export class SupabaseBackend implements DataBackend {
  mode = 'supabase' as const;

  private get client() {
    return getSupabaseClient();
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapProfile(data as DbProfileRow) : null;
  }

  async upsertProfile(profile: Profile): Promise<Profile> {
    const { data, error } = await this.client
      .from('profiles')
      .upsert(profileRow(profile), { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return mapProfile(data as DbProfileRow);
  }

  async updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
    const row: Record<string, unknown> = {};
    const mappings: [keyof Profile, string][] = [
      ['name', 'name'],
      ['email', 'email'],
      ['age', 'age'],
      ['gender', 'gender'],
      ['heightCm', 'height_cm'],
      ['currentWeightKg', 'current_weight_kg'],
      ['targetWeightKg', 'target_weight_kg'],
      ['activityLevel', 'activity_level'],
      ['goal', 'goal'],
      ['unitSystem', 'unit_system'],
      ['calorieTarget', 'calorie_target'],
      ['proteinTargetG', 'protein_target_g'],
      ['carbsTargetG', 'carbs_target_g'],
      ['fatTargetG', 'fat_target_g'],
      ['onboardingCompleted', 'onboarding_completed'],
    ];
    for (const [key, column] of mappings) {
      if (patch[key] !== undefined) row[column] = patch[key];
    }
    if (!Object.keys(row).length) {
      const existing = await this.getProfile(userId);
      if (!existing) throw new Error('Profile not found');
      return existing;
    }
    const { data, error } = await this.client
      .from('profiles')
      .update(row)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return mapProfile(data as DbProfileRow);
  }

  async searchFoods(userId: string, options: FoodSearchOptions = {}): Promise<Food[]> {
    const limit = options.limit ?? 60;
    const query = sanitizeSearchTerm(options.query ?? '');
    let foodsQuery = this.client
      .from('foods')
      .select('*, food_servings(*)')
      .or(`is_public.eq.true,user_id.eq.${userId}`)
      .order('name')
      .limit(limit);
    if (query) foodsQuery = foodsQuery.ilike('name', `%${query}%`);
    if (options.category) foodsQuery = foodsQuery.eq('category', options.category);
    if (options.indianOnly) foodsQuery = foodsQuery.eq('cuisine', 'indian');

    const [foodsResult, customResult] = await Promise.all([
      foodsQuery,
      this.queryCustomFoods(userId, query, options.category),
    ]);
    if (foodsResult.error) throw foodsResult.error;
    if (customResult.error) throw customResult.error;

    const foods = ((foodsResult.data ?? []) as unknown as DbFoodRow[]).map(mapFood);
    const custom = ((customResult.data ?? []) as unknown as DbCustomFoodRow[]).map(
      mapCustomFood,
    );
    const filteredCustom = options.indianOnly ? custom : custom;
    return sortFoodResults([...filteredCustom, ...foods], query).slice(0, limit);
  }

  private queryCustomFoods(userId: string, query: string, category?: string | null) {
    let builder = this.client
      .from('custom_foods')
      .select('*')
      .eq('user_id', userId)
      .order('name')
      .limit(60);
    if (query) builder = builder.ilike('name', `%${query}%`);
    if (category) builder = builder.eq('category', category);
    return builder;
  }

  async listCustomFoods(userId: string): Promise<Food[]> {
    const { data, error } = await this.client
      .from('custom_foods')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as DbCustomFoodRow[]).map(mapCustomFood);
  }

  async getFood(userId: string, foodId: string): Promise<Food | null> {
    if (!UUID_PATTERN.test(foodId)) return null;
    const { data: food, error: foodError } = await this.client
      .from('foods')
      .select('*, food_servings(*)')
      .eq('id', foodId)
      .maybeSingle();
    if (foodError) throw foodError;
    if (food) return mapFood(food as unknown as DbFoodRow);
    const { data: custom, error: customError } = await this.client
      .from('custom_foods')
      .select('*')
      .eq('id', foodId)
      .eq('user_id', userId)
      .maybeSingle();
    if (customError) throw customError;
    return custom ? mapCustomFood(custom as DbCustomFoodRow) : null;
  }

  async createCustomFood(userId: string, input: CustomFoodInput): Promise<Food> {
    const { data, error } = await this.client
      .from('custom_foods')
      .insert({
        user_id: userId,
        name: input.name.trim(),
        brand: input.brand?.trim() || null,
        category: input.category || 'My foods',
        serving_name: input.servingName,
        serving_grams: input.servingGrams,
        calories_per_100g: input.caloriesPer100g,
        protein_per_100g: input.proteinPer100g,
        carbs_per_100g: input.carbsPer100g,
        fat_per_100g: input.fatPer100g,
        fiber_per_100g: input.fiberPer100g ?? null,
        sugar_per_100g: input.sugarPer100g ?? null,
        sodium_per_100g: input.sodiumPer100g ?? null,
        source: 'User entered',
        data_quality: 'user',
      })
      .select()
      .single();
    if (error) throw error;
    return mapCustomFood(data as DbCustomFoodRow);
  }

  async deleteCustomFood(userId: string, foodId: string): Promise<void> {
    const { error } = await this.client
      .from('custom_foods')
      .delete()
      .eq('id', foodId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async listFavourites(userId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('user_favourites')
      .select('food_id')
      .eq('user_id', userId);
    if (error) throw error;
    return ((data ?? []) as { food_id: string }[]).map((r) => r.food_id);
  }

  async toggleFavourite(userId: string, foodId: string): Promise<boolean> {
    const { data: existing } = await this.client
      .from('user_favourites')
      .select('id')
      .eq('user_id', userId)
      .eq('food_id', foodId)
      .maybeSingle();
    if (existing) {
      await this.client
        .from('user_favourites')
        .delete()
        .eq('user_id', userId)
        .eq('food_id', foodId);
      return false;
    }
    await this.client.from('user_favourites').insert({ user_id: userId, food_id: foodId });
    return true;
  }

  async listRecentlyUsed(userId: string, limit = 10): Promise<Food[]> {
    const { data, error } = await this.client
      .from('food_logs')
      .select('food_id, custom_food_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const row of (data ?? []) as { food_id: string | null; custom_food_id: string | null }[]) {
      const id = row.custom_food_id ?? row.food_id;
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
        if (ids.length >= limit) break;
      }
    }
    const foods: Food[] = [];
    for (const id of ids) {
      const food = await this.getFood(userId, id);
      if (food) foods.push(food);
    }
    return foods;
  }

  async ensureMeals(userId: string, date: string): Promise<MealRecord[]> {
    const rows = MEAL_TYPES.map((mealType) => ({
      user_id: userId,
      log_date: date,
      meal_type: mealType,
    }));
    const { error: upsertError } = await this.client
      .from('meals')
      .upsert(rows, {
        onConflict: 'user_id,log_date,meal_type',
        ignoreDuplicates: true,
      });
    if (upsertError) throw upsertError;
    const { data, error } = await this.client
      .from('meals')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', date);
    if (error) throw error;
    return ((data ?? []) as DbMealRow[]).map(mapMeal);
  }

  async getDiary(userId: string, date: string): Promise<DiaryDay> {
    const [meals, logsResult] = await Promise.all([
      this.ensureMeals(userId, date),
      this.client
        .from('food_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('log_date', date)
        .order('created_at'),
    ]);
    if (logsResult.error) throw logsResult.error;
    const logs = ((logsResult.data ?? []) as DbLogRow[]).map(mapLog);
    return assembleDiary(date, meals, logs);
  }

  async getFoodLog(userId: string, logId: string): Promise<FoodLog | null> {
    if (!UUID_PATTERN.test(logId)) return null;
    const { data, error } = await this.client
      .from('food_logs')
      .select('*')
      .eq('id', logId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapLog(data as DbLogRow) : null;
  }

  async listLogsRange(userId: string, startDate: string, endDate: string): Promise<FoodLog[]> {
    const { data, error } = await this.client
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .order('log_date');
    if (error) throw error;
    return ((data ?? []) as DbLogRow[]).map(mapLog);
  }

  async addFoodLog(userId: string, input: LogFoodInput): Promise<FoodLog> {
    const [log] = await this.addFoodLogs(userId, [input]);
    return log;
  }

  async addFoodLogs(userId: string, inputs: LogFoodInput[]): Promise<FoodLog[]> {
    if (!inputs.length) return [];
    const dates = Array.from(new Set(inputs.map((input) => input.logDate)));
    const mealsByDate = new Map<string, MealRecord[]>();
    await Promise.all(
      dates.map(async (date) => {
        mealsByDate.set(date, await this.ensureMeals(userId, date));
      }),
    );

    const rows = inputs.map((input) => {
      const meals = mealsByDate.get(input.logDate) ?? [];
      const meal = meals.find((entry) => entry.mealType === input.mealType);
      if (!meal) throw new Error('Could not create the meal bucket. Please retry.');
      const isCustom = Boolean(input.food.isCustom);
      const foodId =
        !isCustom && UUID_PATTERN.test(input.food.id) && !input.food.id.startsWith('off-')
          ? input.food.id
          : null;
      return {
        user_id: userId,
        meal_id: meal.id,
        meal_type: input.mealType,
        log_date: input.logDate,
        food_id: foodId,
        custom_food_id: isCustom ? input.food.id : null,
        food_name: input.food.name,
        brand: input.food.brand,
        quantity_grams: input.quantityGrams,
        serving_label: input.servingLabel ?? null,
        serving_grams: input.servingGrams ?? null,
        calories_per_100g: input.food.caloriesPer100g,
        protein_per_100g: input.food.proteinPer100g,
        carbs_per_100g: input.food.carbsPer100g,
        fat_per_100g: input.food.fatPer100g,
        fiber_per_100g: input.food.fiberPer100g ?? 0,
        sugar_per_100g: input.food.sugarPer100g ?? 0,
        sodium_per_100g: input.food.sodiumPer100g ?? 0,
        source: input.food.source,
        data_quality: input.food.dataQuality,
        image_url: input.food.imageUrl,
        idempotency_key: input.idempotencyKey,
      };
    });

    const { data, error } = await this.client.from('food_logs').insert(rows).select();
    if (error) {
      if (error.code === '23505') {
        const keys = inputs.map((input) => input.idempotencyKey);
        const { data: existing, error: existingError } = await this.client
          .from('food_logs')
          .select('*')
          .eq('user_id', userId)
          .in('idempotency_key', keys);
        if (existingError) throw existingError;
        return ((existing ?? []) as DbLogRow[]).map(mapLog);
      }
      throw error;
    }
    return ((data ?? []) as DbLogRow[]).map(mapLog);
  }

  async updateFoodLog(userId: string, logId: string, patch: UpdateLogInput): Promise<FoodLog> {
    const current = await this.getFoodLog(userId, logId);
    if (!current) throw new Error('Food log not found');
    const nextDate = patch.logDate ?? current.logDate;
    const nextMealType = patch.mealType ?? current.mealType;
    let mealId = current.mealId;
    if (nextDate !== current.logDate || nextMealType !== current.mealType) {
      const meals = await this.ensureMeals(userId, nextDate);
      const meal = meals.find((entry) => entry.mealType === nextMealType);
      if (!meal) throw new Error('Could not move the log to that meal.');
      mealId = meal.id;
    }
    const { data, error } = await this.client
      .from('food_logs')
      .update({
        meal_id: mealId,
        meal_type: nextMealType,
        log_date: nextDate,
        quantity_grams: patch.quantityGrams ?? current.quantityGrams,
        serving_label:
          patch.servingLabel !== undefined ? patch.servingLabel : current.servingLabel,
        serving_grams:
          patch.servingGrams !== undefined ? patch.servingGrams : current.servingGrams,
      })
      .eq('id', logId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return mapLog(data as DbLogRow);
  }

  async deleteFoodLog(userId: string, logId: string): Promise<void> {
    const { error } = await this.client
      .from('food_logs')
      .delete()
      .eq('id', logId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async listSavedMeals(userId: string): Promise<SavedMeal[]> {
    const { data, error } = await this.client
      .from('saved_meals')
      .select('*, saved_meal_items(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as DbSavedMealRow[]).map(mapSavedMeal);
  }

  async createSavedMeal(userId: string, input: SaveMealInput): Promise<SavedMeal> {
    const { data: meal, error } = await this.client
      .from('saved_meals')
      .insert({
        user_id: userId,
        name: input.name.trim(),
        meal_type: input.mealType,
      })
      .select()
      .single();
    if (error) throw error;
    const savedMeal = meal as { id: string };
    if (input.logs.length) {
      const { error: itemsError } = await this.client.from('saved_meal_items').insert(
        input.logs.map((log, index) => ({
          saved_meal_id: savedMeal.id,
          food_id: log.foodId,
          custom_food_id: log.customFoodId,
          food_name: log.foodName,
          brand: log.brand,
          quantity_grams: log.quantityGrams,
          serving_label: log.servingLabel,
          serving_grams: log.servingGrams,
          calories_per_100g: log.caloriesPer100g,
          protein_per_100g: log.proteinPer100g,
          carbs_per_100g: log.carbsPer100g,
          fat_per_100g: log.fatPer100g,
          fiber_per_100g: log.fiberPer100g,
          sugar_per_100g: log.sugarPer100g,
          sodium_per_100g: log.sodiumPer100g,
          source: log.source,
          data_quality: log.dataQuality,
          sort_order: index,
        })),
      );
      if (itemsError) {
        await this.client.from('saved_meals').delete().eq('id', savedMeal.id);
        throw itemsError;
      }
    }
    const { data: full, error: fetchError } = await this.client
      .from('saved_meals')
      .select('*, saved_meal_items(*)')
      .eq('id', savedMeal.id)
      .single();
    if (fetchError) throw fetchError;
    return mapSavedMeal(full as unknown as DbSavedMealRow);
  }

  async deleteSavedMeal(userId: string, savedMealId: string): Promise<void> {
    const { error } = await this.client
      .from('saved_meals')
      .delete()
      .eq('id', savedMealId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async listRecipes(userId: string): Promise<Recipe[]> {
    const { data, error } = await this.client
      .from('recipes')
      .select('*, recipe_ingredients(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => this.mapRecipe(row));
  }

  async getRecipe(userId: string, recipeId: string): Promise<Recipe | null> {
    const { data, error } = await this.client
      .from('recipes')
      .select('*, recipe_ingredients(*)')
      .eq('id', recipeId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? this.mapRecipe(data as any) : null;
  }

  private mapRecipe(row: any): Recipe {
    const ingredients: RecipeIngredient[] = (row.recipe_ingredients ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((ing: any) => ({
        id: ing.id,
        recipeId: ing.recipe_id,
        foodId: ing.food_id,
        customFoodId: ing.custom_food_id,
        foodName: ing.food_name,
        brand: ing.brand,
        quantityGrams: Number(ing.quantity_grams),
        servingLabel: ing.serving_label,
        servingGrams: ing.serving_grams === null ? null : Number(ing.serving_grams),
        caloriesPer100g: Number(ing.calories_per_100g),
        proteinPer100g: Number(ing.protein_per_100g),
        carbsPer100g: Number(ing.carbs_per_100g),
        fatPer100g: Number(ing.fat_per_100g),
        fiberPer100g: Number(ing.fiber_per_100g),
        sugarPer100g: Number(ing.sugar_per_100g),
        sodiumPer100g: Number(ing.sodium_per_100g),
        source: ing.source,
        dataQuality: ing.data_quality,
        sortOrder: ing.sort_order,
      }));
    const servings = Number(row.servings) || 1;
    const totals = ingredients.reduce(
      (acc: any, ing: RecipeIngredient) => {
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
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      servings,
      servingWeightG: row.serving_weight_g === null ? null : Number(row.serving_weight_g),
      notes: row.notes,
      ingredients,
      totalCalories: totals.calories,
      totalProtein: Math.round(totals.protein * 10) / 10,
      totalCarbs: Math.round(totals.carbs * 10) / 10,
      totalFat: Math.round(totals.fat * 10) / 10,
      totalFiber: Math.round(totals.fiber * 10) / 10,
      perServingCalories: Math.round(totals.calories / servings),
      perServingProtein: Math.round((totals.protein / servings) * 10) / 10,
      perServingCarbs: Math.round((totals.carbs / servings) * 10) / 10,
      perServingFat: Math.round((totals.fat / servings) * 10) / 10,
      perServingFiber: Math.round((totals.fiber / servings) * 10) / 10,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createRecipe(userId: string, input: RecipeInput): Promise<Recipe> {
    const { data: recipe, error } = await this.client
      .from('recipes')
      .insert({
        user_id: userId,
        name: input.name.trim(),
        servings: input.servings,
        serving_weight_g: input.servingWeightG ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    const recipeId = (recipe as any).id;
    if (input.ingredients.length) {
      const { error: itemsError } = await this.client.from('recipe_ingredients').insert(
        input.ingredients.map((ing, index) => ({
          recipe_id: recipeId,
          food_id: ing.foodId,
          custom_food_id: ing.customFoodId,
          food_name: ing.foodName,
          brand: ing.brand,
          quantity_grams: ing.quantityGrams,
          serving_label: ing.servingLabel,
          serving_grams: ing.servingGrams,
          calories_per_100g: ing.caloriesPer100g,
          protein_per_100g: ing.proteinPer100g,
          carbs_per_100g: ing.carbsPer100g,
          fat_per_100g: ing.fatPer100g,
          fiber_per_100g: ing.fiberPer100g,
          sugar_per_100g: ing.sugarPer100g,
          sodium_per_100g: ing.sodiumPer100g,
          source: ing.source,
          data_quality: ing.dataQuality,
          sort_order: index,
        })),
      );
      if (itemsError) {
        await this.client.from('recipes').delete().eq('id', recipeId);
        throw itemsError;
      }
    }
    const full = await this.getRecipe(userId, recipeId);
    if (!full) throw new Error('Could not load the created recipe.');
    return full;
  }

  async updateRecipe(userId: string, recipeId: string, input: RecipeInput): Promise<Recipe> {
    const { error } = await this.client
      .from('recipes')
      .update({
        name: input.name.trim(),
        servings: input.servings,
        serving_weight_g: input.servingWeightG ?? null,
        notes: input.notes ?? null,
      })
      .eq('id', recipeId)
      .eq('user_id', userId);
    if (error) throw error;
    // Replace ingredients.
    await this.client.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    if (input.ingredients.length) {
      const { error: itemsError } = await this.client.from('recipe_ingredients').insert(
        input.ingredients.map((ing, index) => ({
          recipe_id: recipeId,
          food_id: ing.foodId,
          custom_food_id: ing.customFoodId,
          food_name: ing.foodName,
          brand: ing.brand,
          quantity_grams: ing.quantityGrams,
          serving_label: ing.servingLabel,
          serving_grams: ing.servingGrams,
          calories_per_100g: ing.caloriesPer100g,
          protein_per_100g: ing.proteinPer100g,
          carbs_per_100g: ing.carbsPer100g,
          fat_per_100g: ing.fatPer100g,
          fiber_per_100g: ing.fiberPer100g,
          sugar_per_100g: ing.sugarPer100g,
          sodium_per_100g: ing.sodiumPer100g,
          source: ing.source,
          data_quality: ing.dataQuality,
          sort_order: index,
        })),
      );
      if (itemsError) throw itemsError;
    }
    const full = await this.getRecipe(userId, recipeId);
    if (!full) throw new Error('Could not load the updated recipe.');
    return full;
  }

  async deleteRecipe(userId: string, recipeId: string): Promise<void> {
    const { error } = await this.client
      .from('recipes')
      .delete()
      .eq('id', recipeId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async listWeights(userId: string, sinceDate?: string): Promise<WeightLog[]> {
    let builder = this.client
      .from('weight_logs')
      .select('*')
      .eq('user_id', userId)
      .order('log_date');
    if (sinceDate) builder = builder.gte('log_date', sinceDate);
    const { data, error } = await builder;
    if (error) throw error;
    return ((data ?? []) as DbWeightRow[]).map(mapWeight);
  }

  async upsertWeight(
    userId: string,
    input: { logDate: string; weightKg: number; note?: string | null },
  ): Promise<WeightLog> {
    const { data, error } = await this.client
      .from('weight_logs')
      .upsert(
        {
          user_id: userId,
          log_date: input.logDate,
          weight_kg: input.weightKg,
          note: input.note ?? null,
        },
        { onConflict: 'user_id,log_date' },
      )
      .select()
      .single();
    if (error) throw error;
    const { data: latest } = await this.client
      .from('weight_logs')
      .select('weight_kg')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      await this.client
        .from('profiles')
        .update({ current_weight_kg: (latest as { weight_kg: number }).weight_kg })
        .eq('id', userId);
    }
    return mapWeight(data as DbWeightRow);
  }

  async deleteWeight(userId: string, weightId: string): Promise<void> {
    const { error } = await this.client
      .from('weight_logs')
      .delete()
      .eq('id', weightId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async getGoalForDate(userId: string, date: string): Promise<DailyGoal | null> {
    const { data, error } = await this.client
      .from('daily_goals')
      .select('*')
      .eq('user_id', userId)
      .lte('effective_date', date)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapGoal(data as DbGoalRow) : null;
  }

  async listGoals(userId: string): Promise<DailyGoal[]> {
    const { data, error } = await this.client
      .from('daily_goals')
      .select('*')
      .eq('user_id', userId)
      .order('effective_date');
    if (error) throw error;
    return ((data ?? []) as DbGoalRow[]).map(mapGoal);
  }

  async upsertGoal(
    userId: string,
    input: Omit<DailyGoal, 'id' | 'userId'>,
  ): Promise<DailyGoal> {
    const { data, error } = await this.client
      .from('daily_goals')
      .upsert(
        {
          user_id: userId,
          effective_date: input.effectiveDate,
          calorie_target: input.calorieTarget,
          protein_target_g: input.proteinTargetG,
          carbs_target_g: input.carbsTargetG,
          fat_target_g: input.fatTargetG,
        },
        { onConflict: 'user_id,effective_date' },
      )
      .select()
      .single();
    if (error) throw error;
    return mapGoal(data as DbGoalRow);
  }
}

// Re-export the local helper so screens can convert saved-meal snapshots.
export { savedItemToFood } from './local';
