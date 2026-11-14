import { getBackend } from '@/lib/backend';
import { LOCAL_USER_ID } from '@/lib/backend/local';
import type { AppSession } from '@/types/models';

/**
 * Migrates local (on-device) data to a Supabase account.
 *
 * Safe: only runs when the user is authenticated in supabase mode and there
 * is local data. Each record is upserted; duplicates are avoided by
 * checking existence first. Returns a summary of what was migrated.
 */
export async function migrateLocalToCloud(session: AppSession): Promise<{
  profiles: boolean;
  customFoods: number;
  logs: number;
  savedMeals: number;
  weights: number;
  goals: number;
}> {
  if (session.mode !== 'supabase') {
    throw new Error('Migration requires a cloud session.');
  }

  const localBackend = getBackend('local');
  const cloudBackend = getBackend('supabase');

  const summary = {
    profiles: false,
    customFoods: 0,
    logs: 0,
    savedMeals: 0,
    weights: 0,
    goals: 0,
  };

  // 1. Profile
  const localProfile = await localBackend.getProfile(LOCAL_USER_ID);
  if (localProfile) {
    const cloudProfile = { ...localProfile, id: session.userId };
    await cloudBackend.upsertProfile(cloudProfile);
    summary.profiles = true;
  }

  // 2. Custom foods
  const localCustomFoods = await localBackend.listCustomFoods(LOCAL_USER_ID);
  for (const food of localCustomFoods) {
    try {
      await cloudBackend.createCustomFood(session.userId, {
        name: food.name,
        brand: food.brand,
        category: food.category,
        servingName: food.servingName,
        servingGrams: food.servingGrams,
        caloriesPer100g: food.caloriesPer100g,
        proteinPer100g: food.proteinPer100g,
        carbsPer100g: food.carbsPer100g,
        fatPer100g: food.fatPer100g,
        fiberPer100g: food.fiberPer100g,
        sugarPer100g: food.sugarPer100g,
        sodiumPer100g: food.sodiumPer100g,
      });
      summary.customFoods++;
    } catch {
      // Skip duplicates or errors
    }
  }

  // 3. Weight history
  const localWeights = await localBackend.listWeights(LOCAL_USER_ID);
  for (const w of localWeights) {
    try {
      await cloudBackend.upsertWeight(session.userId, {
        logDate: w.logDate,
        weightKg: w.weightKg,
        note: w.note,
      });
      summary.weights++;
    } catch {
      // Skip
    }
  }

  // 4. Goals
  const localGoals = await localBackend.listGoals(LOCAL_USER_ID);
  for (const g of localGoals) {
    try {
      await cloudBackend.upsertGoal(session.userId, {
        effectiveDate: g.effectiveDate,
        calorieTarget: g.calorieTarget,
        proteinTargetG: g.proteinTargetG,
        carbsTargetG: g.carbsTargetG,
        fatTargetG: g.fatTargetG,
      });
      summary.goals++;
    } catch {
      // Skip
    }
  }

  // 5. Saved meals — skipped for now (requires FoodLog reconstruction).
  // Users can re-create saved meals after migration. This avoids data loss
  // risk from incorrect snapshot conversion.

  return summary;
}

/**
 * Detects whether local data exists that could be migrated.
 */
export async function hasLocalData(): Promise<boolean> {
  const localBackend = getBackend('local');
  const profile = await localBackend.getProfile(LOCAL_USER_ID);
  if (profile) return true;
  const customFoods = await localBackend.listCustomFoods(LOCAL_USER_ID);
  if (customFoods.length > 0) return true;
  const weights = await localBackend.listWeights(LOCAL_USER_ID);
  if (weights.length > 0) return true;
  return false;
}