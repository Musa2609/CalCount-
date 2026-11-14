import {
  ACTIVITY_OPTIONS,
} from '@/constants/nutrition';
import type {
  ActivityLevel,
  DailyGoal,
  FitnessGoal,
  Food,
  FoodLog,
  Gender,
  Nutrients,
  Profile,
} from '@/types/models';

export const EMPTY_NUTRIENTS: Nutrients = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
};

export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Core nutrition formula:
 * nutrient consumed = (nutrient per 100g × quantity in grams) / 100
 */
export function scalePer100(valuePer100g: number, quantityGrams: number): number {
  if (!Number.isFinite(valuePer100g) || !Number.isFinite(quantityGrams)) return 0;
  return (valuePer100g * quantityGrams) / 100;
}

export type Per100Nutrients = Pick<
  Food,
  'caloriesPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g' | 'fiberPer100g'
>;

export function nutrientsForQuantity(food: Per100Nutrients, quantityGrams: number): Nutrients {
  const grams = Math.max(0, quantityGrams);
  return {
    calories: Math.round(scalePer100(food.caloriesPer100g, grams)),
    protein: round(scalePer100(food.proteinPer100g, grams)),
    carbs: round(scalePer100(food.carbsPer100g, grams)),
    fat: round(scalePer100(food.fatPer100g, grams)),
    fiber: round(scalePer100(food.fiberPer100g ?? 0, grams)),
  };
}

export function logNutrients(log: FoodLog): Nutrients {
  return nutrientsForQuantity(
    {
      caloriesPer100g: log.caloriesPer100g,
      proteinPer100g: log.proteinPer100g,
      carbsPer100g: log.carbsPer100g,
      fatPer100g: log.fatPer100g,
      fiberPer100g: log.fiberPer100g,
    },
    log.quantityGrams,
  );
}

export function sumNutrients(logs: FoodLog[]): Nutrients {
  return logs.reduce<Nutrients>(
    (total, log) => {
      const n = logNutrients(log);
      return {
        calories: total.calories + n.calories,
        protein: round(total.protein + n.protein),
        carbs: round(total.carbs + n.carbs),
        fat: round(total.fat + n.fat),
        fiber: round(total.fiber + n.fiber),
      };
    },
    { ...EMPTY_NUTRIENTS },
  );
}

export function caloriesFromMacros(protein: number, carbs: number, fat: number): number {
  return Math.round(protein * 4 + carbs * 4 + fat * 9);
}

export function progressRatio(value: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(1, value / target));
}

export function macroPercentages(protein: number, carbs: number, fat: number) {
  const calories = Math.max(1, caloriesFromMacros(protein, carbs, fat));
  return {
    protein: Math.round((protein * 4 * 100) / calories),
    carbs: Math.round((carbs * 4 * 100) / calories),
    fat: Math.round((fat * 9 * 100) / calories),
  };
}

export function activityFactor(level: ActivityLevel): number {
  return ACTIVITY_OPTIONS.find((option) => option.value === level)?.factor ?? 1.2;
}

/**
 * Mifflin–St Jeor basal metabolic rate (kcal/day).
 * For non-binary "other", the midpoint of the male/female constants is used.
 */
export function calculateBmr(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender | null;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  const offset = input.gender === 'male' ? 5 : input.gender === 'female' ? -161 : -78;
  return Math.max(0, Math.round(base + offset));
}

export function calculateTdee(bmr: number, level: ActivityLevel): number {
  return Math.round(bmr * activityFactor(level));
}

export function minimumCalorieFloor(gender: Gender | null): number {
  if (gender === 'male') return 1500;
  if (gender === 'female') return 1200;
  return 1350;
}

export function goalCalorieDelta(goal: FitnessGoal): number {
  switch (goal) {
    case 'lose':
      return -500;
    case 'gain':
      return 300;
    case 'muscle':
      return 250;
    default:
      return 0;
  }
}

export function estimateCalorieTarget(tdee: number, goal: FitnessGoal, gender: Gender | null): number {
  const floor = minimumCalorieFloor(gender);
  const raw = tdee + goalCalorieDelta(goal);
  return Math.max(floor, Math.round(raw / 10) * 10);
}

export function suggestMacroTargets(
  calories: number,
  weightKg: number,
  goal: FitnessGoal,
): Pick<Profile, 'proteinTargetG' | 'carbsTargetG' | 'fatTargetG'> {
  const proteinFactor =
    goal === 'muscle' ? 2 : goal === 'lose' || goal === 'gain' ? 1.8 : 1.6;
  const protein = Math.round(proteinFactor * weightKg);
  const fat = Math.max(
    Math.round(0.6 * weightKg),
    Math.round((calories * 0.27) / 9),
  );
  const remaining = calories - protein * 4 - fat * 9;
  const carbs = Math.max(0, Math.round(remaining / 4));
  const safeFat = carbs === 0 ? Math.max(0, Math.round((calories - protein * 4) / 9)) : fat;
  return { proteinTargetG: protein, carbsTargetG: carbs, fatTargetG: safeFat };
}

export interface GoalPlan {
  bmr: number;
  tdee: number;
  calorieTarget: number;
  weeklyChangeKg: number;
  macros: Pick<Profile, 'proteinTargetG' | 'carbsTargetG' | 'fatTargetG'>;
}

export function buildGoalPlan(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender | null;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
  calorieTarget?: number;
}): GoalPlan {
  const bmr = calculateBmr(input);
  const tdee = calculateTdee(bmr, input.activityLevel);
  const recommended = estimateCalorieTarget(tdee, input.goal, input.gender);
  const calorieTarget = input.calorieTarget && input.calorieTarget > 0
    ? Math.round(input.calorieTarget)
    : recommended;
  return {
    bmr,
    tdee,
    calorieTarget,
    weeklyChangeKg: round(((calorieTarget - tdee) * 7) / 7700, 2),
    macros: suggestMacroTargets(calorieTarget, input.weightKg, input.goal),
  };
}

export function goalForDate(
  goals: DailyGoal[],
  dateKey: string,
  fallback: Pick<Profile, 'calorieTarget' | 'proteinTargetG' | 'carbsTargetG' | 'fatTargetG'>,
): Pick<Profile, 'calorieTarget' | 'proteinTargetG' | 'carbsTargetG' | 'fatTargetG'> {
  const applicable = goals
    .filter((goal) => goal.effectiveDate <= dateKey)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  if (!applicable) return fallback;
  return {
    calorieTarget: applicable.calorieTarget,
    proteinTargetG: applicable.proteinTargetG,
    carbsTargetG: applicable.carbsTargetG,
    fatTargetG: applicable.fatTargetG,
  };
}
