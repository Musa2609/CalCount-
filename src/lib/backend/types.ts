import type {
  AppSession,
  AuthResult,
  BackendMode,
  CustomFoodInput,
  DailyGoal,
  DiaryDay,
  Food,
  FoodLog,
  LogFoodInput,
  MealRecord,
  MealType,
  Profile,
  Recipe,
  RecipeInput,
  SavedMeal,
  UpdateLogInput,
  WeightLog,
} from '@/types/models';

export interface FoodSearchOptions {
  query?: string;
  category?: string | null;
  indianOnly?: boolean;
  limit?: number;
}

export interface SaveMealInput {
  name: string;
  mealType: MealType;
  logs: FoodLog[];
}

export interface AuthApi {
  getSession(): Promise<AppSession | null>;
  onAuthStateChange(listener: (session: AppSession | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(name: string, email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  continueLocally?(): Promise<AuthResult>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  deleteAccount(): Promise<void>;
  signInWithGoogle?(): Promise<AuthResult>;
}

export interface DataBackend {
  mode: BackendMode;
  getProfile(userId: string): Promise<Profile | null>;
  upsertProfile(profile: Profile): Promise<Profile>;
  updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile>;
  searchFoods(userId: string, options?: FoodSearchOptions): Promise<Food[]>;
  listCustomFoods(userId: string): Promise<Food[]>;
  getFood(userId: string, foodId: string): Promise<Food | null>;
  listFavourites(userId: string): Promise<string[]>;
  toggleFavourite(userId: string, foodId: string): Promise<boolean>;
  listRecentlyUsed(userId: string, limit?: number): Promise<Food[]>;
  createCustomFood(userId: string, input: CustomFoodInput): Promise<Food>;
  deleteCustomFood(userId: string, foodId: string): Promise<void>;
  ensureMeals(userId: string, date: string): Promise<MealRecord[]>;
  getDiary(userId: string, date: string): Promise<DiaryDay>;
  getFoodLog(userId: string, logId: string): Promise<FoodLog | null>;
  listLogsRange(userId: string, startDate: string, endDate: string): Promise<FoodLog[]>;
  addFoodLog(userId: string, input: LogFoodInput): Promise<FoodLog>;
  addFoodLogs(userId: string, inputs: LogFoodInput[]): Promise<FoodLog[]>;
  updateFoodLog(userId: string, logId: string, patch: UpdateLogInput): Promise<FoodLog>;
  deleteFoodLog(userId: string, logId: string): Promise<void>;
  listSavedMeals(userId: string): Promise<SavedMeal[]>;
  createSavedMeal(userId: string, input: SaveMealInput): Promise<SavedMeal>;
  deleteSavedMeal(userId: string, savedMealId: string): Promise<void>;
  listRecipes(userId: string): Promise<Recipe[]>;
  getRecipe(userId: string, recipeId: string): Promise<Recipe | null>;
  createRecipe(userId: string, input: RecipeInput): Promise<Recipe>;
  updateRecipe(userId: string, recipeId: string, input: RecipeInput): Promise<Recipe>;
  deleteRecipe(userId: string, recipeId: string): Promise<void>;
  listWeights(userId: string, sinceDate?: string): Promise<WeightLog[]>;
  upsertWeight(
    userId: string,
    input: { logDate: string; weightKg: number; note?: string | null },
  ): Promise<WeightLog>;
  deleteWeight(userId: string, weightId: string): Promise<void>;
  getGoalForDate(userId: string, date: string): Promise<DailyGoal | null>;
  listGoals(userId: string): Promise<DailyGoal[]>;
  upsertGoal(
    userId: string,
    input: Omit<DailyGoal, 'id' | 'userId'>,
  ): Promise<DailyGoal>;
}
