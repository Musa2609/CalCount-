import { useCallback } from 'react';

import { useApp } from '@/context/AppContext';
import { makeIdempotencyKey } from '@/lib/utils';
import type { Food, FoodLog, MealType } from '@/types/models';

export interface LogFoodArgs {
  food: Food;
  quantityGrams: number;
  mealType: MealType;
  logDate: string;
  servingLabel?: string | null;
  servingGrams?: number | null;
}

/** Logs a food from anywhere in the app and refreshes dependent screens. */
export function useLogFood() {
  const { backend, session, invalidate } = useApp();

  const logFood = useCallback(
    async (args: LogFoodArgs): Promise<FoodLog> => {
      if (!session) throw new Error('You need to be signed in to log food.');
      const log = await backend.addFoodLog(session.userId, {
        ...args,
        servingLabel: args.servingLabel ?? null,
        servingGrams: args.servingGrams ?? null,
        idempotencyKey: makeIdempotencyKey(),
      });
      invalidate();
      return log;
    },
    [backend, session, invalidate],
  );

  const logFoods = useCallback(
    async (items: LogFoodArgs[]): Promise<FoodLog[]> => {
      if (!session) throw new Error('You need to be signed in to log food.');
      if (!items.length) return [];
      const logs = await backend.addFoodLogs(
        session.userId,
        items.map((args) => ({
          ...args,
          servingLabel: args.servingLabel ?? null,
          servingGrams: args.servingGrams ?? null,
          idempotencyKey: makeIdempotencyKey(),
        })),
      );
      invalidate();
      return logs;
    },
    [backend, session, invalidate],
  );

  return { logFood, logFoods };
}
