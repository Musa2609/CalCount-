import { useCallback } from 'react';

import { useApp } from '@/context/AppContext';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { foodFromSavedItem } from '@/lib/food';
import { makeIdempotencyKey } from '@/lib/utils';
import type { MealType, SavedMeal } from '@/types/models';

export function useSavedMeals() {
  const { backend, session, revision, invalidate } = useApp();
  const userId = session?.userId ?? null;

  const resource = useAsyncResource<SavedMeal[]>(
    () => (userId ? backend.listSavedMeals(userId) : Promise.resolve([])),
    [backend, userId, revision],
    Boolean(userId),
  );

  const applySavedMeal = useCallback(
    async (savedMeal: SavedMeal, mealType: MealType, date: string) => {
      if (!userId) throw new Error('You need to be signed in to log a saved meal.');
      if (!savedMeal.items.length) throw new Error('That saved meal has no items.');
      await backend.addFoodLogs(
        userId,
        savedMeal.items.map((item) => ({
          food: foodFromSavedItem(item),
          quantityGrams: item.quantityGrams,
          mealType,
          logDate: date,
          servingLabel: item.servingLabel,
          servingGrams: item.servingGrams,
          idempotencyKey: makeIdempotencyKey(),
        })),
      );
      invalidate();
    },
    [backend, userId, invalidate],
  );

  const deleteSavedMeal = useCallback(
    async (id: string) => {
      if (!userId) throw new Error('You need to be signed in.');
      await backend.deleteSavedMeal(userId, id);
      invalidate();
    },
    [backend, userId, invalidate],
  );

  return {
    savedMeals: resource.data ?? [],
    loading: resource.loading,
    error: resource.error,
    reload: resource.reload,
    applySavedMeal,
    deleteSavedMeal,
  };
}
