import { goalForDate, sumNutrients } from '@/lib/nutrition';
import type { DailyGoal, FoodLog, Profile, WeightLog } from '@/types/models';

export interface RangeDay {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  target: number;
  hasLogs: boolean;
}

type GoalTargets = Pick<Profile, 'calorieTarget' | 'proteinTargetG' | 'carbsTargetG' | 'fatTargetG'>;

/**
 * Builds one row per day in `dates` (ascending) from real food logs.
 * Days without logs are included as zeroes so charts keep a stable time axis.
 */
export function summariseRange(
  dates: string[],
  logs: FoodLog[],
  goals: DailyGoal[],
  fallback: GoalTargets,
): RangeDay[] {
  const byDate = new Map<string, FoodLog[]>();
  for (const log of logs) {
    const bucket = byDate.get(log.logDate);
    if (bucket) bucket.push(log);
    else byDate.set(log.logDate, [log]);
  }

  return dates.map((date) => {
    const dayLogs = byDate.get(date) ?? [];
    const totals = sumNutrients(dayLogs);
    const goal = goalForDate(goals, date, fallback);
    return {
      date,
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      target: goal.calorieTarget,
      hasLogs: dayLogs.length > 0,
    };
  });
}

export function averageOverLoggedDays(days: RangeDay[]): number {
  const logged = days.filter((day) => day.hasLogs);
  if (!logged.length) return 0;
  return Math.round(logged.reduce((total, day) => total + day.calories, 0) / logged.length);
}

export function averageMacro(days: RangeDay[], key: 'protein' | 'carbs' | 'fat'): number {
  const logged = days.filter((day) => day.hasLogs);
  if (!logged.length) return 0;
  return Math.round((logged.reduce((total, day) => total + day[key], 0) / logged.length) * 10) / 10;
}

/**
 * Share of logged days where intake landed within ±10% of that day's goal.
 * Days without logs are excluded — a skipped day is not "on target".
 */
export function adherenceRate(days: RangeDay[]): number {
  const logged = days.filter((day) => day.hasLogs && day.target > 0);
  if (!logged.length) return 0;
  const onTarget = logged.filter(
    (day) => Math.abs(day.calories - day.target) <= day.target * 0.1,
  ).length;
  return Math.round((onTarget / logged.length) * 100);
}

export function daysLogged(days: RangeDay[]): number {
  return days.filter((day) => day.hasLogs).length;
}

export interface WeightStats {
  latest: number | null;
  first: number | null;
  changeKg: number | null;
  entries: WeightLog[];
}

export function weightStats(weights: WeightLog[]): WeightStats {
  if (!weights.length) {
    return { latest: null, first: null, changeKg: null, entries: [] };
  }
  const sorted = [...weights].sort((a, b) => a.logDate.localeCompare(b.logDate));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  return {
    latest: latest.weightKg,
    first: first.weightKg,
    changeKg: Math.round((latest.weightKg - first.weightKg) * 100) / 100,
    entries: sorted,
  };
}

/** Linear interpolation between weight entries, used for a smooth trend line. */
export function weightTrendPoints(weights: WeightLog[], dates: string[]): (number | null)[] {
  if (!weights.length) return dates.map(() => null);
  const sorted = [...weights].sort((a, b) => a.logDate.localeCompare(b.logDate));
  let cursor = 0;
  let lastValue: number | null = null;
  return dates.map((date) => {
    while (cursor < sorted.length && sorted[cursor].logDate <= date) {
      lastValue = sorted[cursor].weightKg;
      cursor += 1;
    }
    return lastValue;
  });
}
