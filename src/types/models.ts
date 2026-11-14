export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const FITNESS_GOALS = ['lose', 'maintain', 'gain', 'muscle'] as const;
export type FitnessGoal = (typeof FITNESS_GOALS)[number];

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const DATA_QUALITIES = ['sourced', 'estimated', 'user', 'openfoodfacts'] as const;
export type DataQuality = (typeof DATA_QUALITIES)[number];

export type BackendMode = 'supabase' | 'local';

export interface AppSession {
  userId: string;
  email: string | null;
  mode: BackendMode;
}

export interface Profile {
  id: string;
  name: string;
  email: string | null;
  age: number | null;
  gender: Gender | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
  unitSystem: UnitSystem;
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FoodServing {
  id: string;
  foodId: string;
  label: string;
  grams: number;
  isDefault: boolean;
  sortOrder: number;
}

export interface Food {
  id: string;
  userId: string | null;
  name: string;
  brand: string | null;
  category: string;
  description: string | null;
  servingName: string;
  servingGrams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  sugarPer100g: number | null;
  sodiumPer100g: number | null;
  source: string;
  sourceUrl: string | null;
  dataQuality: DataQuality;
  cuisine: 'indian' | 'international' | 'packaged' | null;
  barcode: string | null;
  imageUrl: string | null;
  isPublic: boolean;
  isCustom?: boolean;
  servings: FoodServing[];
  createdAt: string;
}

export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface FoodLog {
  id: string;
  userId: string;
  mealId: string;
  mealType: MealType;
  logDate: string;
  foodId: string | null;
  customFoodId: string | null;
  foodName: string;
  brand: string | null;
  quantityGrams: number;
  servingLabel: string | null;
  servingGrams: number | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  sugarPer100g: number;
  sodiumPer100g: number;
  source: string;
  dataQuality: DataQuality;
  imageUrl: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  createdAt: string;
  updatedAt: string;
}

export interface MealRecord {
  id: string;
  userId: string;
  logDate: string;
  mealType: MealType;
  notes: string | null;
  createdAt: string;
}

export interface MealSection {
  mealType: MealType;
  mealId: string | null;
  notes: string | null;
  logs: FoodLog[];
  totals: Nutrients;
}

export interface DiaryDay {
  date: string;
  meals: MealSection[];
  totals: Nutrients;
}

export interface WeightLog {
  id: string;
  userId: string;
  logDate: string;
  weightKg: number;
  note: string | null;
  createdAt: string;
}

export interface DailyGoal {
  id: string;
  userId: string;
  effectiveDate: string;
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
}

export interface SavedMealItem {
  id: string;
  savedMealId: string;
  foodId: string | null;
  customFoodId: string | null;
  foodName: string;
  brand: string | null;
  quantityGrams: number;
  servingLabel: string | null;
  servingGrams: number | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  sugarPer100g: number;
  sodiumPer100g: number;
  source: string;
  dataQuality: DataQuality;
  sortOrder: number;
}

export interface SavedMeal {
  id: string;
  userId: string;
  name: string;
  mealType: MealType;
  items: SavedMealItem[];
  totals: Nutrients;
  createdAt: string;
}

export interface LogFoodInput {
  mealType: MealType;
  logDate: string;
  food: Food;
  quantityGrams: number;
  servingLabel?: string | null;
  servingGrams?: number | null;
  idempotencyKey: string;
}

export interface UpdateLogInput {
  quantityGrams?: number;
  servingLabel?: string | null;
  servingGrams?: number | null;
  mealType?: MealType;
  logDate?: string;
}

export interface CustomFoodInput {
  name: string;
  brand?: string | null;
  category: string;
  servingName: string;
  servingGrams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g?: number | null;
  sugarPer100g?: number | null;
  sodiumPer100g?: number | null;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  foodId: string | null;
  customFoodId: string | null;
  foodName: string;
  brand: string | null;
  quantityGrams: number;
  servingLabel: string | null;
  servingGrams: number | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  sugarPer100g: number;
  sodiumPer100g: number;
  source: string;
  dataQuality: DataQuality;
  sortOrder: number;
}

export interface Recipe {
  id: string;
  userId: string;
  name: string;
  servings: number;
  servingWeightG: number | null;
  notes: string | null;
  ingredients: RecipeIngredient[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  perServingCalories: number;
  perServingProtein: number;
  perServingCarbs: number;
  perServingFat: number;
  perServingFiber: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeInput {
  name: string;
  servings: number;
  servingWeightG?: number | null;
  notes?: string | null;
  ingredients: Omit<RecipeIngredient, 'id' | 'recipeId' | 'sortOrder'>[];
}

export interface DailySummary {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  calorieTarget: number;
  loggedMeals: number;
  logCount: number;
}

export interface AuthResult {
  session: AppSession | null;
  needsEmailConfirmation?: boolean;
  message?: string;
}
