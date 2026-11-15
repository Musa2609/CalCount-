/**
 * CalCount functional QA suite.
 *
 * Runs the app's *real* modules (not re-implementations) in Node:
 *   TZ=Asia/Kolkata node --import ./qa/register.mjs --test qa/qa.ts
 *
 * The local backend is exercised against an in-memory AsyncStorage stub so
 * logging, editing, deleting and "app restart" persistence can be verified.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SEED_FOODS } from '@/data/seed';
import {
  errorForStatus,
  formatRetryDelay,
  parseRetryAfter,
  parseVisionResponse,
  parseVisionResult,
  retryPolicyFor,
  VisionEmptyError,
  VisionServiceError,
} from '@/lib/vision';
import { appEnv } from '@/lib/env';
import {
  barcodeFailureMessage,
  findOpenFoodFactsByBarcode,
  lookupOpenFoodFactsBarcode,
} from '@/lib/openfoodfacts';
import {
  caloriesFromMacros,
  calculateBmr,
  calculateTdee,
  estimateCalorieTarget,
  goalForDate,
  macroPercentages,
  nutrientsForQuantity,
  progressRatio,
  suggestMacroTargets,
  sumNutrients,
  buildGoalPlan,
} from '@/lib/nutrition';
import {
  addDaysToKey,
  dateRangeKeys,
  differenceInDaysKeys,
  formatFriendlyDate,
  fromDateKey,
  isFutureKey,
  isTodayKey,
  subtractDaysFromKey,
  toDateKey,
  todayKey,
} from '@/lib/dates';
import {
  cmToInches,
  formatHeight,
  inchesToCm,
  kgToLb,
  lbToKg,
  weightToKg,
} from '@/lib/units';
import {
  adherenceRate,
  averageMacro,
  averageOverLoggedDays,
  daysLogged,
  summariseRange,
  weightStats,
  weightTrendPoints,
} from '@/lib/analytics';
import { parseNumericInput, validateQuantity } from '@/lib/validation';
import { createProfile } from '@/lib/profile';
import { buildDefaultServings, makeFoodLog } from '@/lib/backend/helpers';
import { foodFromLog, foodFromSavedItem } from '@/lib/food';
import { makeIdempotencyKey } from '@/lib/utils';
import { __store } from './stubs/async-storage.mjs';
import type { Food, MealType } from '@/types/models';

const USER = { userId: '00000000-0000-4000-8000-00000000caca', email: null, mode: 'local' as const };

function makeFood(overrides: Partial<Food> = {}): Food {
  const base: Food = {
    id: 'qa-food-1',
    userId: null,
    name: 'QA food',
    brand: null,
    category: 'Test',
    description: null,
    servingName: '1 serving',
    servingGrams: 100,
    caloriesPer100g: 120,
    proteinPer100g: 5,
    carbsPer100g: 20,
    fatPer100g: 2,
    fiberPer100g: 1,
    sugarPer100g: null,
    sodiumPer100g: null,
    source: 'QA',
    sourceUrl: null,
    dataQuality: 'user',
    cuisine: 'indian',
    barcode: null,
    imageUrl: null,
    isPublic: false,
    isCustom: false,
    servings: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}

function logInput(food: Food, quantityGrams: number, mealType: MealType, logDate: string, key: string) {
  return {
    food,
    quantityGrams,
    mealType,
    logDate,
    servingLabel: food.servingName,
    servingGrams: food.servingGrams,
    idempotencyKey: key,
  };
}

// ---------------------------------------------------------------------------
// 1. Nutrition arithmetic
// ---------------------------------------------------------------------------

test('calorie scaling is per-100g based', () => {
  const food = makeFood({ caloriesPer100g: 120 });
  assert.equal(nutrientsForQuantity(food, 100).calories, 120);
  assert.equal(nutrientsForQuantity(food, 250).calories, 300);
  assert.equal(nutrientsForQuantity(food, 30).calories, 36);
  // 33 g of 120 kcal/100 g = 39.6 -> displayed as 40
  assert.equal(nutrientsForQuantity(food, 33).calories, 40);
});

test('macro scaling keeps one decimal and handles missing fiber', () => {
  const food = makeFood({ proteinPer100g: 7.3, carbsPer100g: 12.7, fatPer100g: 3.1, fiberPer100g: null });
  const n = nutrientsForQuantity(food, 150);
  assert.equal(n.protein, 11);
  assert.equal(n.carbs, 19.1);
  assert.equal(n.fat, 4.7);
  assert.equal(n.fiber, 0, 'null fiber must not produce NaN');
});

test('sumNutrients adds rounded per-entry values without NaN', () => {
  const now = '2026-05-01T08:00:00.000Z';
  const logs = [
    makeFoodLog(USER.userId, 'm1', logInput(makeFood({ caloriesPer100g: 120 }), 150, 'breakfast', '2026-05-01', 'k1'), 'l1', now),
    makeFoodLog(USER.userId, 'm2', logInput(makeFood({ caloriesPer100g: 200, proteinPer100g: 10 }), 50, 'lunch', '2026-05-01', 'k2'), 'l2', now),
  ];
  const totals = sumNutrients(logs);
  assert.equal(totals.calories, 180 + 100);
  // 150 g at 5 g/100 g = 7.5, 50 g at 10 g/100 g = 5
  assert.equal(totals.protein, 12.5);
  assert.ok(Number.isFinite(totals.fiber));
});

test('macro calorie conversion matches Atwater factors', () => {
  assert.equal(caloriesFromMacros(10, 20, 5), 10 * 4 + 20 * 4 + 5 * 9);
  const pct = macroPercentages(30, 50, 20);
  assert.equal(pct.protein + pct.carbs + pct.fat, 100);
});

test('progressRatio clamps and survives a zero target', () => {
  assert.equal(progressRatio(50, 100), 0.5);
  assert.equal(progressRatio(150, 100), 1);
  assert.equal(progressRatio(50, 0), 0);
});

// ---------------------------------------------------------------------------
// 2. BMR / TDEE / targets
// ---------------------------------------------------------------------------

test('Mifflin-St Jeor BMR for each gender', () => {
  // 80 kg, 180 cm, 30 y
  assert.equal(calculateBmr({ weightKg: 80, heightCm: 180, age: 30, gender: 'male' }), 1780);
  assert.equal(calculateBmr({ weightKg: 80, heightCm: 180, age: 30, gender: 'female' }), 1614);
  assert.equal(calculateBmr({ weightKg: 80, heightCm: 180, age: 30, gender: 'other' }), 1697);
  assert.equal(calculateBmr({ weightKg: 80, heightCm: 180, age: 30, gender: null }), 1697);
});

test('TDEE applies the activity factor', () => {
  assert.equal(calculateTdee(2000, 'sedentary'), 2400);
  assert.equal(calculateTdee(2000, 'moderate'), 3100);
  assert.equal(calculateTdee(2000, 'very_active'), 3800);
});

test('calorie targets respect the safety floor and 10 kcal rounding', () => {
  // 1239 BMR * 1.2 = 1487 TDEE, -500 = 987 -> female floor 1200
  assert.equal(estimateCalorieTarget(1487, 'lose', 'female'), 1200);
  assert.equal(estimateCalorieTarget(1487, 'lose', 'male'), 1500);
  assert.equal(estimateCalorieTarget(1487, 'lose', 'other'), 1350);
  assert.equal(estimateCalorieTarget(2500, 'maintain', 'male'), 2500);
  assert.equal(estimateCalorieTarget(2500, 'gain', 'male'), 2800);
  assert.equal(estimateCalorieTarget(2500, 'muscle', 'male'), 2750);
  // never rounds a floor down below the floor
  assert.equal(estimateCalorieTarget(1200, 'lose', 'female') % 10, 0);
});

test('suggested macros land close to the calorie target', () => {
  for (const goal of ['lose', 'maintain', 'gain', 'muscle'] as const) {
    const macros = suggestMacroTargets(2200, 75, goal);
    const kcal = caloriesFromMacros(macros.proteinTargetG, macros.carbsTargetG, macros.fatTargetG);
    assert.ok(Math.abs(kcal - 2200) <= 20, `${goal}: macros give ${kcal} kcal for a 2200 target`);
    assert.ok(macros.carbsTargetG >= 0, `${goal}: carbs must not go negative`);
    assert.ok(macros.fatTargetG > 0, `${goal}: fat must stay above zero`);
  }
});

test('goal plan reports BMR, TDEE and implied weekly change consistently', () => {
  const plan = buildGoalPlan({
    weightKg: 80,
    heightCm: 180,
    age: 30,
    gender: 'male',
    activityLevel: 'moderate',
    goal: 'lose',
  });
  assert.equal(plan.bmr, 1780);
  assert.equal(plan.tdee, 2759);
  assert.equal(plan.calorieTarget, 2260);
  assert.equal(plan.weeklyChangeKg, Math.round(((2260 - 2759) * 7) / 7700 * 100) / 100);
});

test('goalForDate picks the latest goal effective on or before the date', () => {
  const goals = [
    { id: 'g1', userId: 'u', effectiveDate: '2026-01-01', calorieTarget: 1800, proteinTargetG: 120, carbsTargetG: 180, fatTargetG: 60 },
    { id: 'g2', userId: 'u', effectiveDate: '2026-06-01', calorieTarget: 2400, proteinTargetG: 160, carbsTargetG: 260, fatTargetG: 70 },
  ];
  const fallback = { calorieTarget: 9999, proteinTargetG: 1, carbsTargetG: 1, fatTargetG: 1 };
  assert.equal(goalForDate(goals, '2026-05-31', fallback).calorieTarget, 1800);
  assert.equal(goalForDate(goals, '2026-06-01', fallback).calorieTarget, 2400);
  assert.equal(goalForDate(goals, '2026-12-31', fallback).calorieTarget, 2400);
  assert.equal(goalForDate(goals, '2025-12-31', fallback).calorieTarget, 9999);
});

// ---------------------------------------------------------------------------
// 3. Dates and timezone behaviour
// ---------------------------------------------------------------------------

test('date keys are stable local calendar days (no UTC drift)', () => {
  const lateNight = new Date(2026, 4, 1, 23, 45);
  const earlyMorning = new Date(2026, 4, 1, 0, 15);
  assert.equal(toDateKey(lateNight), '2026-05-01');
  assert.equal(toDateKey(earlyMorning), '2026-05-01');
  assert.equal(toDateKey(fromDateKey('2026-05-01')), '2026-05-01');
});

test('day arithmetic crosses month, year and DST boundaries', () => {
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysToKey('2026-02-28', 1), '2026-03-01');
  assert.equal(subtractDaysFromKey('2026-01-01', 1), '2025-12-31');
  // US DST starts 2026-03-08 and ends 2026-11-01
  assert.equal(addDaysToKey('2026-03-07', 2), '2026-03-09');
  assert.equal(addDaysToKey('2026-10-31', 2), '2026-11-02');
  assert.equal(differenceInDaysKeys('2026-03-09', '2026-03-07'), 2);
  assert.equal(differenceInDaysKeys('2026-11-03', '2026-11-01'), 2);
});

test('date ranges are inclusive and correctly sized', () => {
  const range = dateRangeKeys('2026-03-10', 5);
  assert.deepEqual(range, ['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
  assert.equal(dateRangeKeys('2026-03-10', 90).length, 90);
  assert.equal(dateRangeKeys('2026-03-10', 0).length, 1, 'guard against a zero/negative window');
});

test('today/future helpers agree with the local clock', () => {
  assert.ok(isTodayKey(todayKey()));
  assert.equal(isTodayKey(addDaysToKey(todayKey(), -1)), false);
  assert.equal(isFutureKey(addDaysToKey(todayKey(), 1)), true);
  assert.equal(isFutureKey(todayKey()), false);
  assert.equal(formatFriendlyDate(todayKey()), 'Today');
  assert.equal(formatFriendlyDate(addDaysToKey(todayKey(), -1)), 'Yesterday');
});

// ---------------------------------------------------------------------------
// 4. Units and input parsing
// ---------------------------------------------------------------------------

test('unit conversions round-trip', () => {
  assert.ok(Math.abs(lbToKg(kgToLb(70)) - 70) < 1e-9);
  assert.ok(Math.abs(inchesToCm(cmToInches(172)) - 172) < 1e-9);
  assert.equal(Math.round(weightToKg(154, 'imperial') * 10) / 10, 69.9);
  assert.equal(weightToKg(70, 'metric'), 70);
  assert.equal(formatHeight(172, 'metric'), '172 cm');
  assert.equal(formatHeight(172, 'imperial'), `5' 8"`);
});

test('numeric input accepts decimals and rejects junk', () => {
  assert.equal(parseNumericInput('150'), 150);
  assert.equal(parseNumericInput('12.5'), 12.5);
  assert.equal(parseNumericInput('12,5'), 12.5);
  assert.equal(parseNumericInput(''), null);
  assert.equal(parseNumericInput('.'), null);
  assert.equal(parseNumericInput('abc'), null);
});

test('quantity validation blocks zero, negatives, junk and absurd values', () => {
  assert.equal(validateQuantity(null), 'Enter a quantity');
  assert.ok(validateQuantity(0));
  assert.ok(validateQuantity(-5));
  assert.ok(validateQuantity(5001));
  assert.equal(validateQuantity(0.5), null);
  assert.equal(validateQuantity(5000), null);
});

// ---------------------------------------------------------------------------
// 5. Seed catalogue integrity
// ---------------------------------------------------------------------------

test('every seed food has valid, self-consistent nutrition per 100 g', () => {
  const problems: string[] = [];
  const seen = new Set<string>();

  assert.ok(SEED_FOODS.length > 50, `expected a usable catalogue, got ${SEED_FOODS.length}`);

  for (const food of SEED_FOODS) {
    const label = `${food.id} (${food.name})`;
    if (seen.has(food.id)) problems.push(`${label}: duplicate id`);
    seen.add(food.id);

    if (!food.name?.trim()) problems.push(`${label}: missing name`);
    if (!(food.servingGrams > 0) || food.servingGrams > 5000) {
      problems.push(`${label}: bad servingGrams ${food.servingGrams}`);
    }
    for (const [key, value] of [
      ['caloriesPer100g', food.caloriesPer100g],
      ['proteinPer100g', food.proteinPer100g],
      ['carbsPer100g', food.carbsPer100g],
      ['fatPer100g', food.fatPer100g],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) problems.push(`${label}: ${key}=${value}`);
    }
    if (food.caloriesPer100g > 1000) problems.push(`${label}: ${food.caloriesPer100g} kcal/100g is impossible`);
    const macroGrams = food.proteinPer100g + food.carbsPer100g + food.fatPer100g;
    if (macroGrams > 100.5) problems.push(`${label}: macros total ${macroGrams} g per 100 g`);
    // Energy cross-check using EU/FAO factors: fibre contributes ~2 kcal/g,
    // not 4. Cooked pulses (dal, rajma) legitimately sit well below a naive
    // 4/4/9 total, so a 25 kcal floor keeps small produce rows honest too.
    const fiber = food.fiberPer100g ?? 0;
    const netCarbs = Math.max(0, food.carbsPer100g - fiber);
    const estimatedKcal = Math.round(
      food.proteinPer100g * 4 + netCarbs * 4 + fiber * 2 + food.fatPer100g * 9,
    );
    if (
      Math.abs(estimatedKcal - food.caloriesPer100g) >
      Math.max(25, food.caloriesPer100g * 0.25)
    ) {
      problems.push(
        `${label}: calories ${food.caloriesPer100g} but macros/fibre imply ${estimatedKcal}`,
      );
    }
    if (!['sourced', 'estimated', 'user', 'openfoodfacts'].includes(food.dataQuality)) {
      problems.push(`${label}: unknown dataQuality ${food.dataQuality}`);
    }
    if (food.fiberPer100g !== null && (!Number.isFinite(food.fiberPer100g) || food.fiberPer100g < 0)) {
      problems.push(`${label}: bad fiber ${food.fiberPer100g}`);
    }
  }

  assert.deepEqual(problems, [], `seed catalogue problems:\n${problems.join('\n')}`);
});

// ---------------------------------------------------------------------------
// 6. Local backend: logging, editing, totals
// ---------------------------------------------------------------------------

const { LocalBackend } = await import('@/lib/backend/local');
const backend = new LocalBackend();

test('onboarding writes a profile, goal and first weigh-in that read back', async () => {
  const profile = createProfile({
    session: USER,
    name: 'QA Tester',
    age: 30,
    gender: 'male',
    heightCm: 180,
    currentWeightKg: 80,
    targetWeightKg: 75,
    activityLevel: 'moderate',
    goal: 'lose',
    unitSystem: 'metric',
    calorieTarget: 2260,
    proteinTargetG: 144,
    carbsTargetG: 253,
    fatTargetG: 67,
    onboardingCompleted: true,
  });
  const saved = await backend.upsertProfile(profile);
  assert.equal(saved.onboardingCompleted, true);
  assert.equal(saved.id, USER.userId);

  const reloaded = await backend.getProfile(USER.userId);
  assert.equal(reloaded?.name, 'QA Tester');
  assert.equal(reloaded?.calorieTarget, 2260);

  await backend.upsertGoal(USER.userId, {
    effectiveDate: '2026-05-01',
    calorieTarget: 2260,
    proteinTargetG: 144,
    carbsTargetG: 253,
    fatTargetG: 67,
  });
  await backend.upsertWeight(USER.userId, { logDate: '2026-05-01', weightKg: 80 });

  const goal = await backend.getGoalForDate(USER.userId, '2026-05-01');
  assert.equal(goal?.calorieTarget, 2260);
  const weights = await backend.listWeights(USER.userId);
  assert.equal(weights.length, 1);
  assert.equal(weights[0].weightKg, 80);
});

test('food can be logged into all four meals with correct per-meal totals', async () => {
  const date = '2026-05-01';
  const foods = {
    breakfast: makeFood({ id: 'b', caloriesPer100g: 120 }),
    lunch: makeFood({ id: 'l', caloriesPer100g: 200 }),
    dinner: makeFood({ id: 'd', caloriesPer100g: 100 }),
    snacks: makeFood({ id: 's', caloriesPer100g: 400 }),
  };
  await backend.addFoodLog(USER.userId, logInput(foods.breakfast, 150, 'breakfast', date, 'k-b'));
  await backend.addFoodLog(USER.userId, logInput(foods.lunch, 100, 'lunch', date, 'k-l'));
  await backend.addFoodLog(USER.userId, logInput(foods.dinner, 50, 'dinner', date, 'k-d'));
  await backend.addFoodLog(USER.userId, logInput(foods.snacks, 25, 'snacks', date, 'k-s'));

  const diary = await backend.getDiary(USER.userId, date);
  assert.deepEqual(diary.meals.map((m) => m.mealType), ['breakfast', 'lunch', 'dinner', 'snacks']);
  assert.deepEqual(diary.meals.map((m) => m.logs.length), [1, 1, 1, 1]);
  assert.deepEqual(diary.meals.map((m) => m.totals.calories), [180, 200, 50, 100]);
  assert.equal(diary.totals.calories, 530);
  assert.equal(
    diary.totals.calories,
    diary.meals.reduce((total, meal) => total + meal.totals.calories, 0),
    'day total must equal the sum of meal totals',
  );
});

test('reading the diary twice does not duplicate meal records', async () => {
  const date = '2026-05-02';
  await backend.getDiary(USER.userId, date);
  await backend.getDiary(USER.userId, date);
  const diary = await backend.getDiary(USER.userId, date);
  assert.equal(diary.meals.length, 4);
  const stored = JSON.parse(__store.get('calcount:local:db:v1') as string);
  const mealsForDay = stored.meals.filter((m: { logDate: string }) => m.logDate === date);
  assert.equal(mealsForDay.length, 4, 'ensureMeals must be idempotent');
});

test('editing a quantity recalculates calories and macros', async () => {
  const date = '2026-05-03';
  const food = makeFood({ id: 'edit', caloriesPer100g: 120, proteinPer100g: 10 });
  const log = await backend.addFoodLog(USER.userId, logInput(food, 100, 'breakfast', date, 'k-edit'));
  assert.equal(log.calories, 120);

  const updated = await backend.updateFoodLog(USER.userId, log.id, { quantityGrams: 250 });
  assert.equal(updated.calories, 300);
  assert.equal(updated.protein, 25);
  assert.equal(updated.quantityGrams, 250);

  const diary = await backend.getDiary(USER.userId, date);
  assert.equal(diary.totals.calories, 300);
  assert.equal(diary.meals[0].logs[0].calories, 300);
});

test('moving an entry to another meal updates both sections', async () => {
  const date = '2026-05-04';
  const food = makeFood({ id: 'move', caloriesPer100g: 100 });
  const log = await backend.addFoodLog(USER.userId, logInput(food, 100, 'breakfast', date, 'k-move'));

  await backend.updateFoodLog(USER.userId, log.id, { mealType: 'dinner' });
  const diary = await backend.getDiary(USER.userId, date);
  const breakfast = diary.meals.find((m) => m.mealType === 'breakfast');
  const dinner = diary.meals.find((m) => m.mealType === 'dinner');
  assert.equal(breakfast?.logs.length, 0);
  assert.equal(dinner?.logs.length, 1);
  assert.equal(diary.totals.calories, 100, 'totals must not double count');
});

test('deleting an entry removes it and its calories', async () => {
  const date = '2026-05-05';
  const food = makeFood({ id: 'del', caloriesPer100g: 100 });
  const log = await backend.addFoodLog(USER.userId, logInput(food, 100, 'lunch', date, 'k-del'));
  await backend.deleteFoodLog(USER.userId, log.id);
  const diary = await backend.getDiary(USER.userId, date);
  assert.equal(diary.totals.calories, 0);
  assert.equal(diary.meals.find((m) => m.mealType === 'lunch')?.logs.length, 0);
  assert.equal(await backend.getFoodLog(USER.userId, log.id), null);
});

test('an idempotency key prevents duplicate writes on retry', async () => {
  const date = '2026-05-06';
  const food = makeFood({ id: 'idem', caloriesPer100g: 100 });
  await backend.addFoodLog(USER.userId, logInput(food, 100, 'lunch', date, 'same-key'));
  await backend.addFoodLog(USER.userId, logInput(food, 100, 'lunch', date, 'same-key'));

  const batch = await backend.addFoodLogs(USER.userId, [
    logInput(food, 100, 'dinner', date, 'batch-key'),
    logInput(food, 50, 'dinner', date, 'batch-key'),
  ]);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].id, batch[1].id, 'duplicate inside a batch resolves to the stored row');

  const diary = await backend.getDiary(USER.userId, date);
  assert.equal(diary.meals.find((m) => m.mealType === 'lunch')?.logs.length, 1);
  assert.equal(diary.meals.find((m) => m.mealType === 'dinner')?.logs.length, 1);
  assert.equal(diary.totals.calories, 200);
});

test('logs stay isolated per calendar day and ranges are inclusive', async () => {
  const a = '2026-06-01';
  const b = '2026-06-02';
  const food = makeFood({ id: 'range', caloriesPer100g: 100 });
  await backend.addFoodLog(USER.userId, logInput(food, 100, 'lunch', a, 'iso-a'));
  await backend.addFoodLog(USER.userId, logInput(food, 200, 'lunch', b, 'iso-b'));

  assert.equal((await backend.getDiary(USER.userId, a)).totals.calories, 100);
  assert.equal((await backend.getDiary(USER.userId, b)).totals.calories, 200);

  const single = await backend.listLogsRange(USER.userId, a, a);
  assert.equal(single.length, 1);
  assert.equal(single[0].logDate, a);

  const both = await backend.listLogsRange(USER.userId, a, b);
  assert.equal(both.length, 2);
  assert.deepEqual(both.map((l) => l.logDate), [a, b]);
});

// ---------------------------------------------------------------------------
// 7. Saved meals, custom foods, weight history
// ---------------------------------------------------------------------------

test('a saved meal snapshots items and totals from the diary meal', async () => {
  const date = '2026-05-01';
  const diary = await backend.getDiary(USER.userId, date);
  const breakfast = diary.meals.find((m) => m.mealType === 'breakfast')!;
  const saved = await backend.createSavedMeal(USER.userId, {
    name: 'My breakfast',
    mealType: 'breakfast',
    logs: breakfast.logs,
  });
  assert.equal(saved.items.length, breakfast.logs.length);
  assert.equal(saved.totals.calories, breakfast.totals.calories);

  const listed = await backend.listSavedMeals(USER.userId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, 'My breakfast');
  assert.equal(listed[0].totals.calories, breakfast.totals.calories);
});

test('a custom food is searchable, then deletable without touching old logs', async () => {
  const created = await backend.createCustomFood(USER.userId, {
    name: 'QA Paneer Bhurji',
    brand: 'Home',
    category: 'My foods',
    servingName: '1 katori',
    servingGrams: 150,
    caloriesPer100g: 220,
    proteinPer100g: 12,
    carbsPer100g: 6,
    fatPer100g: 16,
  });
  assert.ok(created.isCustom);
  assert.ok(created.servings.some((s) => s.grams === 150));
  assert.ok(created.servings.some((s) => s.grams === 100));

  const found = await backend.searchFoods(USER.userId, { query: 'paneer bhurji' });
  assert.ok(found.some((f) => f.id === created.id));

  const log = await backend.addFoodLog(
    USER.userId,
    logInput(created, 150, 'dinner', '2026-05-07', 'k-custom'),
  );
  assert.equal(log.calories, 330);

  await backend.deleteCustomFood(USER.userId, created.id);
  assert.equal(await backend.getFood(USER.userId, created.id), null);
  const stillThere = await backend.getDiary(USER.userId, '2026-05-07');
  assert.equal(stillThere.totals.calories, 330, 'past diary entries keep their snapshot');
});

test('applying a saved meal reproduces its stored nutrition exactly', async () => {
  const [saved] = await backend.listSavedMeals(USER.userId);
  const date = '2026-08-01';
  await backend.addFoodLogs(
    USER.userId,
    saved.items.map((item) => ({
      food: foodFromSavedItem(item),
      quantityGrams: item.quantityGrams,
      mealType: 'breakfast' as MealType,
      logDate: date,
      servingLabel: item.servingLabel,
      servingGrams: item.servingGrams,
      idempotencyKey: makeIdempotencyKey(),
    })),
  );
  const diary = await backend.getDiary(USER.userId, date);
  assert.equal(diary.totals.calories, saved.totals.calories);
  assert.equal(diary.meals.find((m) => m.mealType === 'breakfast')?.logs.length, saved.items.length);
});

test('copying a diary entry reproduces its nutrition on another day', async () => {
  const source = (await backend.getDiary(USER.userId, '2026-05-01')).meals[0].logs[0];
  const date = '2026-08-02';
  const [copy] = await backend.addFoodLogs(USER.userId, [
    {
      food: foodFromLog(source),
      quantityGrams: source.quantityGrams,
      mealType: 'lunch',
      logDate: date,
      servingLabel: source.servingLabel,
      servingGrams: source.servingGrams,
      idempotencyKey: makeIdempotencyKey(),
    },
  ]);
  assert.equal(copy.foodName, source.foodName);
  assert.equal(copy.calories, source.calories);
  assert.equal(copy.protein, source.protein);
});

test('a logged entry stores a nutrient snapshot, not a live food reference', () => {
  const food = makeFood({ id: 'snapshot', caloriesPer100g: 100 });
  const log = makeFoodLog(
    USER.userId,
    'm1',
    logInput(food, 100, 'lunch', '2026-08-03', 'snap-key'),
    'snap-log',
    '2026-08-03T10:00:00.000Z',
  );
  food.caloriesPer100g = 999;
  assert.equal(log.caloriesPer100g, 100);
  assert.equal(log.calories, 100);
});

test('default servings include the house serving and 100 g exactly once', () => {
  const foodId = 'f0000000-0000-4000-8000-00000000abcd';
  const first = buildDefaultServings(foodId, '1 bowl', 150);
  assert.deepEqual(first.map((s) => s.grams), [150, 100]);
  assert.equal(first[0].isDefault, true);
  assert.equal(new Set(first.map((s) => s.id)).size, first.length);

  const again = buildDefaultServings(foodId, '1 bowl', 150, first);
  assert.equal(again.length, 2, 'rebuilding servings must not duplicate rows');

  const hundredGramServing = buildDefaultServings(foodId, '100 g', 100);
  assert.equal(hundredGramServing.length, 1);
});

test('weigh-ins upsert per day and keep the profile weight in sync', async () => {
  const uid = USER.userId;
  await backend.upsertWeight(uid, { logDate: '2026-05-01', weightKg: 80 });
  await backend.upsertWeight(uid, { logDate: '2026-05-02', weightKg: 79.4 });
  await backend.upsertWeight(uid, { logDate: '2026-05-02', weightKg: 79.1 });

  const weights = await backend.listWeights(uid);
  assert.deepEqual(weights.map((w) => w.weightKg), [80, 79.1]);
  assert.equal((await backend.getProfile(uid))?.currentWeightKg, 79.1);

  const latest = weights[weights.length - 1];
  await backend.deleteWeight(uid, latest.id);
  assert.equal((await backend.getProfile(uid))?.currentWeightKg, 80);
  assert.equal((await backend.listWeights(uid)).length, 1);
});

test('goal history keeps old targets on older dates', async () => {
  const uid = USER.userId;
  await backend.upsertGoal(uid, {
    effectiveDate: '2026-07-01',
    calorieTarget: 2000,
    proteinTargetG: 150,
    carbsTargetG: 200,
    fatTargetG: 60,
  });
  await backend.upsertGoal(uid, {
    effectiveDate: '2026-07-15',
    calorieTarget: 2400,
    proteinTargetG: 170,
    carbsTargetG: 260,
    fatTargetG: 70,
  });

  assert.equal((await backend.getGoalForDate(uid, '2026-07-10'))?.calorieTarget, 2000);
  assert.equal((await backend.getGoalForDate(uid, '2026-07-20'))?.calorieTarget, 2400);
  const goals = await backend.listGoals(uid);
  assert.deepEqual(goals.map((g) => g.effectiveDate), [
    '2026-05-01',
    '2026-07-01',
    '2026-07-15',
  ]);
});

// ---------------------------------------------------------------------------
// 8. Restart / persistence
// ---------------------------------------------------------------------------

test('all user data survives a cold start', async () => {
  const before = {
    diary: await backend.getDiary(USER.userId, '2026-05-01'),
    profile: await backend.getProfile(USER.userId),
    meals: await backend.listSavedMeals(USER.userId),
    weights: await backend.listWeights(USER.userId),
  };

  // Fresh module instance == app restart: in-memory cache dropped, storage kept.
  const cold = await import('../src/lib/backend/local.ts?cold=1');
  const restarted = new cold.LocalBackend();

  const after = {
    diary: await restarted.getDiary(USER.userId, '2026-05-01'),
    profile: await restarted.getProfile(USER.userId),
    meals: await restarted.listSavedMeals(USER.userId),
    weights: await restarted.listWeights(USER.userId),
  };

  assert.equal(after.diary.totals.calories, before.diary.totals.calories);
  assert.deepEqual(
    after.diary.meals.map((m) => m.logs.map((l) => l.id)),
    before.diary.meals.map((m) => m.logs.map((l) => l.id)),
    'diary entries must not disappear or duplicate after restart',
  );
  assert.equal(after.profile?.name, before.profile?.name);
  assert.equal(after.profile?.calorieTarget, before.profile?.calorieTarget);
  assert.equal(after.meals.length, before.meals.length);
  assert.equal(after.weights.length, before.weights.length);
});

test('the persisted database is a single versioned JSON document', async () => {
  const raw = __store.get('calcount:local:db:v1');
  assert.ok(typeof raw === 'string', 'expected the app database under its storage key');
  const parsed = JSON.parse(raw as string);
  assert.equal(parsed.version, 1);
  for (const key of ['profiles', 'customFoods', 'meals', 'logs', 'savedMeals', 'weights', 'goals']) {
    assert.ok(Array.isArray(parsed[key]) || typeof parsed[key] === 'object', `missing ${key}`);
  }
});

test('corrupt stored data falls back to an empty database instead of crashing', async () => {
  const backup = __store.get('calcount:local:db:v1');
  __store.set('calcount:local:db:v1', '{not json');
  const cold = await import('../src/lib/backend/local.ts?cold=corrupt');
  const recovered = new cold.LocalBackend();
  assert.equal(await recovered.getProfile(USER.userId), null);
  __store.set('calcount:local:db:v1', backup as string);
});

// ---------------------------------------------------------------------------
// 9. Analytics
// ---------------------------------------------------------------------------

test('summariseRange buckets by day and applies each day its own target', async () => {
  const logs = await backend.listLogsRange(USER.userId, '2026-05-01', '2026-05-03');
  const dates = dateRangeKeys('2026-05-03', 3);
  const goals = await backend.listGoals(USER.userId);
  const days = summariseRange(dates, logs, goals, {
    calorieTarget: 2000,
    proteinTargetG: 100,
    carbsTargetG: 200,
    fatTargetG: 60,
  });

  assert.equal(days.length, 3);
  assert.equal(days[0].calories, 530);
  assert.equal(days[1].calories, 0);
  assert.equal(days[1].hasLogs, false);
  assert.equal(days[2].calories, 300);
  assert.equal(days[0].target, 2260, 'target comes from the goal effective on that date');
});

test('averages only count logged days and adherence ignores empty days', () => {
  const days = [
    { date: 'a', calories: 2000, protein: 100, carbs: 200, fat: 60, target: 2000, hasLogs: true },
    { date: 'b', calories: 0, protein: 0, carbs: 0, fat: 0, target: 2000, hasLogs: false },
    { date: 'c', calories: 2500, protein: 120, carbs: 250, fat: 80, target: 2000, hasLogs: true },
  ];
  assert.equal(averageOverLoggedDays(days), 2250);
  assert.equal(averageMacro(days, 'protein'), 110);
  assert.equal(daysLogged(days), 2);
  assert.equal(adherenceRate(days), 50, 'one of two logged days was within 10%');
});

test('weight trend and stats behave for empty and populated histories', () => {
  assert.equal(weightStats([]).latest, null);
  assert.deepEqual(weightTrendPoints([], ['2026-05-01']), [null]);

  const weights = [
    { id: 'w1', userId: 'u', logDate: '2026-05-01', weightKg: 80, note: null, createdAt: '' },
    { id: 'w2', userId: 'u', logDate: '2026-05-03', weightKg: 79, note: null, createdAt: '' },
  ];
  const stats = weightStats(weights);
  assert.equal(stats.latest, 79);
  assert.equal(stats.first, 80);
  assert.equal(stats.changeKg, -1);

  const points = weightTrendPoints(weights, ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04']);
  assert.deepEqual(points, [80, 80, 79, 79]);
});

// ---------------------------------------------------------------------------
// Photo recognition contract (analyze-food-photo Edge Function)
// ---------------------------------------------------------------------------

test('vision parser keeps the original contract working', () => {
  // Shape produced before USDA matching existed: only the required fields.
  const items = parseVisionResponse({
    items: [
      {
        name: 'Grilled chicken',
        grams: 150,
        caloriesPer100g: 165,
        proteinPer100g: 31,
        carbsPer100g: 0,
        fatPer100g: 3.6,
      },
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].grams, 150);
  assert.equal(items[0].nutritionSource, null);
  assert.equal(items[0].fdcId, null);
  assert.deepEqual(items[0].ingredients, []);
});

test('vision parser reads USDA provenance and warnings', () => {
  const result = parseVisionResult({
    items: [
      {
        name: 'Brown rice',
        grams: 180,
        caloriesPer100g: 123,
        proteinPer100g: 2.7,
        carbsPer100g: 25.6,
        fatPer100g: 1,
        confidence: 0.91,
        fiberPer100g: 1.6,
        category: 'grain',
        ingredients: ['rice'],
        nutritionSource: 'usda',
        matchedFoodName: 'Rice, brown, long-grain, cooked',
        fdcId: 168878,
        notes: '',
      },
      {
        name: 'Sauce',
        grams: 40,
        caloriesPer100g: 120,
        proteinPer100g: 1,
        carbsPer100g: 6,
        fatPer100g: 10,
        confidence: 0.4,
        nutritionSource: 'ai_estimate',
      },
    ],
    warnings: ['"Sauce" is an AI estimate — no confident USDA FoodData Central match was found.'],
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].nutritionSource, 'usda');
  assert.equal(result.items[0].matchedFoodName, 'Rice, brown, long-grain, cooked');
  assert.equal(result.items[0].fiberPer100g, 1.6);
  assert.equal(result.items[1].nutritionSource, 'ai_estimate');
  assert.equal(result.items[1].matchedFoodName, null);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /AI estimate/);
});

test('vision parser rejects empty and invalid payloads', () => {
  assert.throws(() => parseVisionResponse({ items: [] }), VisionEmptyError);
  assert.throws(() => parseVisionResponse({}), /unexpected response/);
  assert.throws(
    () =>
      parseVisionResponse({
        items: [{ name: 'Rice', grams: 100, caloriesPer100g: -1, proteinPer100g: 1, carbsPer100g: 1, fatPer100g: 1 }],
      }),
    /caloriesPer100g/,
  );
  assert.throws(
    () => parseVisionResponse({ items: [{ grams: 100, caloriesPer100g: 1, proteinPer100g: 1, carbsPer100g: 1, fatPer100g: 1 }] }),
    /missing a name/,
  );
});

test('vision errors keep the server code and retry delay', () => {
  const busy = errorForStatus(503, {
    error: 'Photo recognition is busy right now. Please try again in a moment.',
    code: 'vision_busy',
    retryAfterSeconds: 10800,
  });
  assert.ok(busy instanceof VisionServiceError);
  assert.equal(busy.code, 'vision_busy');
  assert.equal(busy.retryAfterSeconds, 10800);
  // The server's generic "in a moment" must not survive a three-hour delay.
  assert.match(busy.message, /in 3 hours\.$/);
  assert.doesNotMatch(busy.message, /in a moment/);

  const headerOnly = errorForStatus(503, { code: 'busy' }, '120');
  assert.equal(headerOnly.code, 'busy');
  assert.equal(headerOnly.retryAfterSeconds, 120);
  assert.match(headerOnly.message, /in 2 minutes\.$/);

  const bodyWins = errorForStatus(503, { code: 'vision_busy', retryAfterSeconds: 90 }, '600');
  assert.equal(bodyWins.retryAfterSeconds, 90);

  const limited = errorForStatus(429, {
    error: 'You have analysed a lot of photos in a short time. Please wait a moment.',
    code: 'rate_limited',
    retryAfterSeconds: 300,
  });
  assert.equal(limited.code, 'rate_limited');
  assert.equal(limited.retryAfterSeconds, 300);
  assert.match(limited.message, /in 5 minutes\.$/);
});

test('vision quota exhaustion is reported without a retry delay', () => {
  const exhausted = errorForStatus(503, {
    error: 'The AI service has reached its usage limit. Please try again later.',
    code: 'vision_quota_exhausted',
  });
  assert.equal(exhausted.code, 'vision_quota_exhausted');
  assert.equal(exhausted.retryAfterSeconds, null);
  assert.match(exhausted.message, /usage limit/);
  assert.match(exhausted.message, /later/);

  // A missing body message still explains the limit.
  const bare = errorForStatus(503, { code: 'vision_quota_exhausted' });
  assert.match(bare.message, /AI usage limit/);

  // Unrelated failures keep their own wording and no retry delay.
  const tooLarge = errorForStatus(413, { error: 'That photo is too large.' });
  assert.equal(tooLarge.message, 'That photo is too large.');
  assert.equal(tooLarge.code, null);
  assert.equal(tooLarge.retryAfterSeconds, null);
  assert.equal(errorForStatus(401, {}).message, 'Your session expired. Sign in again to analyse a photo.');
});

test('vision retry header and delay wording', () => {
  assert.equal(parseRetryAfter('120'), 120);
  assert.equal(parseRetryAfter('0.4'), 1);
  assert.equal(parseRetryAfter(''), null);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter('soon'), null);
  const seconds = parseRetryAfter(new Date(Date.now() + 300_000).toUTCString());
  assert.ok(seconds !== null && seconds >= 295 && seconds <= 301);

  assert.equal(formatRetryDelay(0), 'in a moment');
  assert.equal(formatRetryDelay(30), 'in a moment');
  assert.equal(formatRetryDelay(59), 'in a moment');
  assert.equal(formatRetryDelay(60), 'in 1 minute');
  assert.equal(formatRetryDelay(300), 'in 5 minutes');
  assert.equal(formatRetryDelay(3600), 'in 1 hour');
  assert.equal(formatRetryDelay(7200), 'in 2 hours');
  assert.equal(formatRetryDelay(10800), 'in 3 hours');
});

test('vision retry policy cooldown gates the retry button', () => {
  const busy = errorForStatus(503, { code: 'vision_busy', retryAfterSeconds: 10800 });
  assert.deepEqual(retryPolicyFor(busy), { allowsRetry: true, cooldownMs: 10_800_000 });

  const limited = errorForStatus(429, { code: 'rate_limited', retryAfterSeconds: 60 });
  assert.deepEqual(retryPolicyFor(limited), { allowsRetry: true, cooldownMs: 60_000 });

  const exhausted = errorForStatus(503, {
    code: 'vision_quota_exhausted',
    retryAfterSeconds: 3600,
  });
  assert.deepEqual(retryPolicyFor(exhausted), { allowsRetry: false, cooldownMs: 0 });

  // Network failures, empty results and unknown errors stay immediately retryable.
  assert.deepEqual(retryPolicyFor(new Error('boom')), { allowsRetry: true, cooldownMs: 0 });
  assert.deepEqual(retryPolicyFor(new VisionEmptyError()), { allowsRetry: true, cooldownMs: 0 });
  assert.deepEqual(retryPolicyFor(errorForStatus(500, {})), {
    allowsRetry: true,
    cooldownMs: 0,
  });
});

// ---------------------------------------------------------------------------
// Barcode lookup outcome states
// ---------------------------------------------------------------------------

function withFetch<T>(impl: () => Promise<Response>, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl as unknown as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const OFF_PRODUCT = {
  product: {
    code: '8901058000000',
    product_name: 'Masala Oats',
    brands: 'Saffola',
    serving_quantity: 40,
    nutriments: {
      'energy-kcal_100g': 380,
      proteins_100g: 9,
      carbohydrates_100g: 62,
      fat_100g: 10,
      fiber_100g: 7,
    },
  },
  status: 1,
};

test('barcode lookup returns the mapped food on a hit', async () => {
  const outcome = await withFetch(
    async () => new Response(JSON.stringify(OFF_PRODUCT), { status: 200 }),
    () => lookupOpenFoodFactsBarcode('8901058000000'),
  );
  assert.equal(outcome.status, 'found');
  if (outcome.status !== 'found') return;
  assert.equal(outcome.food.name, 'Masala Oats');
  assert.equal(outcome.food.caloriesPer100g, 380);
  assert.equal(outcome.food.barcode, '8901058000000');
  assert.equal(outcome.food.dataQuality, 'openfoodfacts');
});

test('barcode lookup separates "not found" from transport and server failures', async () => {
  const missing = await withFetch(
    async () => new Response(JSON.stringify({ status: 0, status_verbose: 'product not found' }), { status: 404 }),
    () => lookupOpenFoodFactsBarcode('8901058000000'),
  );
  assert.equal(missing.status, 'not_found');
  assert.match(barcodeFailureMessage(missing as Exclude<typeof missing, { status: 'found' }>), /No product found/);

  const flaggedMissing = await withFetch(
    async () => new Response(JSON.stringify({ status: 0, status_verbose: 'product not found' }), { status: 200 }),
    () => lookupOpenFoodFactsBarcode('8901058000000'),
  );
  assert.equal(flaggedMissing.status, 'not_found');

  const offline = await withFetch(
    () => Promise.reject(new TypeError('Network request failed')),
    () => lookupOpenFoodFactsBarcode('8901058000000'),
  );
  assert.equal(offline.status, 'network_error');
  if (offline.status === 'network_error') {
    assert.equal(offline.timedOut, false);
    assert.match(barcodeFailureMessage(offline), /Could not reach Open Food Facts/);
  }

  const down = await withFetch(
    async () => new Response('upstream down', { status: 503 }),
    () => lookupOpenFoodFactsBarcode('8901058000000'),
  );
  assert.equal(down.status, 'service_error');
  if (down.status === 'service_error') {
    assert.equal(down.httpStatus, 503);
    assert.match(barcodeFailureMessage(down), /HTTP 503/);
  }
});

test('barcode lookup reports unreadable payloads instead of claiming a miss', async () => {
  const html = await withFetch(
    async () => new Response('<html>rate limited</html>', { status: 200 }),
    () => lookupOpenFoodFactsBarcode('8901058000000'),
  );
  assert.equal(html.status, 'invalid_response');
  assert.match(
    barcodeFailureMessage(html as Exclude<typeof html, { status: 'found' }>),
    /could not read/,
  );

  const noEnergy = await withFetch(
    async () =>
      new Response(JSON.stringify({ status: 1, product: { code: '1', product_name: 'Mystery' } }), {
        status: 200,
      }),
    () => lookupOpenFoodFactsBarcode('8901058000000'),
  );
  assert.equal(noEnergy.status, 'invalid_response');

  const tooShort = await withFetch(
    async () => {
      throw new Error('fetch should not be called');
    },
    () => lookupOpenFoodFactsBarcode('123'),
  );
  assert.equal(tooShort.status, 'invalid');
});

test('barcode lookup says so when the feature is switched off', async () => {
  await withFetch(
    async () => {
      throw new Error('fetch should not be called while disabled');
    },
    async () => {
      const previous = appEnv.openFoodFactsEnabled;
      appEnv.openFoodFactsEnabled = false;
      try {
        const outcome = await lookupOpenFoodFactsBarcode('8901058000000');
        assert.equal(outcome.status, 'disabled');
        assert.match(barcodeFailureMessage(outcome), /turned off/);

        const legacy = await findOpenFoodFactsByBarcode('8901058000000');
        assert.equal(legacy, null);
      } finally {
        appEnv.openFoodFactsEnabled = previous;
      }
    },
  );
});
