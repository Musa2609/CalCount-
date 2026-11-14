import { useApp } from '@/context/AppContext';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { useCallback } from 'react';

import type { DailyGoal, Profile } from '@/types/models';

export type GoalTargets = Pick<
  Profile,
  'calorieTarget' | 'proteinTargetG' | 'carbsTargetG' | 'fatTargetG'
>;

const EMPTY_TARGETS: GoalTargets = {
  calorieTarget: 0,
  proteinTargetG: 0,
  carbsTargetG: 0,
  fatTargetG: 0,
};

/**
 * Goals are versioned per day in `daily_goals`; the profile holds the current
 * default. A date's target is the most recent goal effective on/before it.
 */
export function useGoals(date: string) {
  const { backend, session, profile, revision } = useApp();
  const userId = session?.userId ?? null;

  const resource = useAsyncResource<DailyGoal | null>(
    () => (userId ? backend.getGoalForDate(userId, date) : Promise.resolve(null)),
    [backend, userId, date, revision],
    Boolean(userId),
  );

  const fallback: GoalTargets = profile
    ? {
        calorieTarget: profile.calorieTarget,
        proteinTargetG: profile.proteinTargetG,
        carbsTargetG: profile.carbsTargetG,
        fatTargetG: profile.fatTargetG,
      }
    : EMPTY_TARGETS;

  const targets: GoalTargets = resource.data
    ? {
        calorieTarget: resource.data.calorieTarget,
        proteinTargetG: resource.data.proteinTargetG,
        carbsTargetG: resource.data.carbsTargetG,
        fatTargetG: resource.data.fatTargetG,
      }
    : fallback;

  const saveTargets = useCallback(
    async (next: GoalTargets, effectiveDate = date) => {
      if (!userId) throw new Error('You need to be signed in to change targets.');
      return backend.upsertGoal(userId, { effectiveDate, ...next });
    },
    [backend, userId, date],
  );

  return { targets, loading: resource.loading, error: resource.error, reload: resource.reload, saveTargets };
}
