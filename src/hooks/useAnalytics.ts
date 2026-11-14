import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import {
  adherenceRate,
  averageMacro,
  averageOverLoggedDays,
  daysLogged,
  summariseRange,
  weightStats,
  type RangeDay,
} from '@/lib/analytics';
import { dateRangeKeys, todayKey } from '@/lib/dates';
import type { WeightLog } from '@/types/models';

interface AnalyticsData {
  days: RangeDay[];
  weights: WeightLog[];
}

const FALLBACK_TARGETS = {
  calorieTarget: 2000,
  proteinTargetG: 120,
  carbsTargetG: 220,
  fatTargetG: 65,
};

export function useAnalytics(rangeDays: number) {
  const { backend, session, profile, revision } = useApp();
  const userId = session?.userId ?? null;
  const endKey = todayKey();
  const dates = useMemo(() => dateRangeKeys(endKey, rangeDays), [endKey, rangeDays]);
  const startKey = dates[0] ?? endKey;
  const fallback = profile
    ? {
        calorieTarget: profile.calorieTarget,
        proteinTargetG: profile.proteinTargetG,
        carbsTargetG: profile.carbsTargetG,
        fatTargetG: profile.fatTargetG,
      }
    : FALLBACK_TARGETS;

  const resource = useAsyncResource<AnalyticsData>(
    async () => {
      if (!userId) return { days: [], weights: [] };
      const [logs, weights, goals] = await Promise.all([
        backend.listLogsRange(userId, startKey, endKey),
        backend.listWeights(userId, startKey),
        backend.listGoals(userId),
      ]);
      return { days: summariseRange(dates, logs, goals, fallback), weights };
    },
    [
      backend,
      userId,
      startKey,
      endKey,
      rangeDays,
      revision,
      fallback.calorieTarget,
      fallback.proteinTargetG,
      fallback.carbsTargetG,
      fallback.fatTargetG,
    ],
    Boolean(userId),
  );

  const days = useMemo(() => resource.data?.days ?? [], [resource.data]);
  const weights = useMemo(() => resource.data?.weights ?? [], [resource.data]);
  const stats = useMemo(
    () => ({
      averageCalories: averageOverLoggedDays(days),
      averageProtein: averageMacro(days, 'protein'),
      averageCarbs: averageMacro(days, 'carbs'),
      averageFat: averageMacro(days, 'fat'),
      adherence: adherenceRate(days),
      loggedDays: daysLogged(days),
      weight: weightStats(weights),
    }),
    [days, weights],
  );

  return {
    days,
    weights,
    stats,
    loading: resource.loading,
    error: resource.error,
    reload: resource.reload,
  };
}
