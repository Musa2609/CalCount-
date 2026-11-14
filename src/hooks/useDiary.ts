import { useCallback } from 'react';

import { useApp } from '@/context/AppContext';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { foodFromLog } from '@/lib/food';
import { makeIdempotencyKey } from '@/lib/utils';
import type { DiaryDay, Food, MealType, UpdateLogInput } from '@/types/models';

export interface AddFoodArgs {
  food: Food;
  quantityGrams: number;
  mealType: MealType;
  servingLabel?: string | null;
  servingGrams?: number | null;
}

/**
 * One source of truth for a single day's diary.
 * Every mutation re-reads through the backend and bumps the app revision so
 * other screens (home, progress) stay in sync with real stored data.
 */
export function useDiary(date: string) {
  const { backend, session, revision, invalidate } = useApp();
  const userId = session?.userId ?? null;

  const resource = useAsyncResource<DiaryDay>(
    () =>
      userId
        ? backend.getDiary(userId, date)
        : Promise.resolve({ date, meals: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } }),
    [backend, userId, date, revision],
    Boolean(userId),
  );

  const addFood = useCallback(
    async ({ food, quantityGrams, mealType, servingLabel, servingGrams }: AddFoodArgs) => {
      if (!userId) throw new Error('You need to be signed in to log food.');
      const log = await backend.addFoodLog(userId, {
        food,
        quantityGrams,
        mealType,
        logDate: date,
        servingLabel: servingLabel ?? null,
        servingGrams: servingGrams ?? null,
        idempotencyKey: makeIdempotencyKey(),
      });
      invalidate();
      return log;
    },
    [backend, userId, date, invalidate],
  );

  const updateLog = useCallback(
    async (logId: string, patch: UpdateLogInput) => {
      if (!userId) throw new Error('You need to be signed in to edit food.');
      const log = await backend.updateFoodLog(userId, logId, patch);
      invalidate();
      return log;
    },
    [backend, userId, invalidate],
  );

  const deleteLog = useCallback(
    async (logId: string) => {
      if (!userId) throw new Error('You need to be signed in to delete food.');
      await backend.deleteFoodLog(userId, logId);
      invalidate();
    },
    [backend, userId, invalidate],
  );

  /** Copies every entry in one meal into another meal on the same day. */
  const copyMeal = useCallback(
    async (from: MealType, to: MealType) => {
      if (!userId) throw new Error('You need to be signed in to copy meals.');
      const section = resource.data?.meals.find((meal) => meal.mealType === from);
      if (!section || section.logs.length === 0) {
        throw new Error('There is nothing to copy from that meal yet.');
      }
      await backend.addFoodLogs(
        userId,
        section.logs.map((log) => ({
          food: foodFromLog(log),
          quantityGrams: log.quantityGrams,
          mealType: to,
          logDate: date,
          servingLabel: log.servingLabel,
          servingGrams: log.servingGrams,
          idempotencyKey: makeIdempotencyKey(),
        })),
      );
      invalidate();
    },
    [backend, userId, date, invalidate, resource.data],
  );

  /** Repeats a meal from the day before, the most common "same breakfast again" case. */
  const copyMealFromYesterday = useCallback(
    async (mealType: MealType) => {
      if (!userId) throw new Error('You need to be signed in to copy meals.');
      const { subtractDaysFromKey } = await import('@/lib/dates');
      const yesterday = subtractDaysFromKey(date, 1);
      const logs = await backend.listLogsRange(userId, yesterday, yesterday);
      const mealLogs = logs.filter((log) => log.mealType === mealType);
      if (mealLogs.length === 0) {
        throw new Error('No entries for that meal yesterday.');
      }
      await backend.addFoodLogs(
        userId,
        mealLogs.map((log) => ({
          food: foodFromLog(log),
          quantityGrams: log.quantityGrams,
          mealType,
          logDate: date,
          servingLabel: log.servingLabel,
          servingGrams: log.servingGrams,
          idempotencyKey: makeIdempotencyKey(),
        })),
      );
      invalidate();
    },
    [backend, userId, date, invalidate],
  );

  const saveMeal = useCallback(
    async (name: string, mealType: MealType) => {
      if (!userId) throw new Error('You need to be signed in to save meals.');
      const section = resource.data?.meals.find((meal) => meal.mealType === mealType);
      if (!section || section.logs.length === 0) {
        throw new Error('Add some food before saving this meal.');
      }
      const saved = await backend.createSavedMeal(userId, {
        name: name.trim(),
        mealType,
        logs: section.logs,
      });
      return saved;
    },
    [backend, userId, resource.data],
  );

  return {
    diary: resource.data,
    loading: resource.loading,
    error: resource.error,
    reload: resource.reload,
    addFood,
    updateLog,
    deleteLog,
    copyMeal,
    copyMealFromYesterday,
    saveMeal,
  };
}
