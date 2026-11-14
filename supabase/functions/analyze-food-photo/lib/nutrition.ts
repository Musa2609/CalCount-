import type { UsdaLookup, UsdaMatch } from './usda.ts';

/**
 * Turns the model's raw JSON plus the USDA lookups into the response the app
 * consumes. Every number is range-checked here, because this is the boundary
 * between "something a model wrote" and "something a diary will trust".
 */
export type NutritionSource = 'usda' | 'ai_estimate';

export const MIN_GRAMS = 5;
export const MAX_GRAMS = 3000;
export const MAX_KCAL_PER_100G = 950;
export const MAX_MACRO_PER_100G = 100;

export interface AiFoodItem {
  name: string;
  category: string | null;
  ingredients: string[];
  grams: number;
  confidence: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  notes: string | null;
}

export interface AnalyzedItem {
  name: string;
  grams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  confidence: number;
  category: string | null;
  ingredients: string[];
  nutritionSource: NutritionSource;
  matchedFoodName: string | null;
  fdcId: number | null;
  notes: string | null;
}

export interface BuildResult {
  items: AnalyzedItem[];
  warnings: string[];
}

function readNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundGrams(value: number): number {
  return Math.round(clamp(value, MIN_GRAMS, MAX_GRAMS) / 5) * 5;
}

/** Drops unparseable rows instead of inventing defaults for them. */
export function sanitizeAiItems(raw: unknown[]): { items: AiFoodItem[]; dropped: number } {
  const items: AiFoodItem[] = [];
  let dropped = 0;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      dropped += 1;
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = readString(record.name, 80);
    const grams = readNumber(record.grams);
    const calories = readNumber(record.caloriesPer100g);
    const protein = readNumber(record.proteinPer100g);
    const carbs = readNumber(record.carbsPer100g);
    const fat = readNumber(record.fatPer100g);
    if (
      !name ||
      grams === null ||
      calories === null ||
      protein === null ||
      carbs === null ||
      fat === null ||
      calories > MAX_KCAL_PER_100G ||
      protein > MAX_MACRO_PER_100G ||
      carbs > MAX_MACRO_PER_100G ||
      fat > MAX_MACRO_PER_100G
    ) {
      dropped += 1;
      continue;
    }
    const confidence = readNumber(record.confidence);
    const ingredients = Array.isArray(record.ingredients)
      ? record.ingredients
          .map((value) => readString(value, 40))
          .filter((value): value is string => Boolean(value))
          .slice(0, 8)
      : [];
    items.push({
      name,
      category: readString(record.category, 40),
      ingredients,
      grams: roundGrams(grams),
      confidence: confidence === null ? 0.5 : clamp(confidence, 0, 1),
      caloriesPer100g: Math.min(calories, MAX_KCAL_PER_100G),
      proteinPer100g: protein,
      carbsPer100g: carbs,
      fatPer100g: fat,
      notes: readString(record.notes, 160),
    });
  }
  return { items, dropped };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function percent(value: number): number {
  return Math.round(value * 100);
}

function fromUsda(base: AiFoodItem, match: UsdaMatch): AnalyzedItem {
  return {
    name: base.name,
    grams: base.grams,
    caloriesPer100g: match.caloriesPer100g,
    proteinPer100g: match.proteinPer100g,
    carbsPer100g: match.carbsPer100g,
    fatPer100g: match.fatPer100g,
    fiberPer100g: match.fiberPer100g,
    confidence: base.confidence,
    category: base.category,
    ingredients: base.ingredients,
    nutritionSource: 'usda',
    matchedFoodName: match.description,
    fdcId: match.fdcId,
    notes: base.notes,
  };
}

function fromAiEstimate(base: AiFoodItem): AnalyzedItem {
  return {
    name: base.name,
    grams: base.grams,
    caloriesPer100g: base.caloriesPer100g,
    proteinPer100g: base.proteinPer100g,
    carbsPer100g: base.carbsPer100g,
    fatPer100g: base.fatPer100g,
    fiberPer100g: null,
    confidence: base.confidence,
    category: base.category,
    ingredients: base.ingredients,
    nutritionSource: 'ai_estimate',
    matchedFoodName: null,
    fdcId: null,
    notes: base.notes,
  };
}

/**
 * Combines the model's items with their USDA lookups.
 *
 * `lookups[i]` belongs to `items[i]`. Duplicate names are merged (the same dish
 * listed twice should not be logged twice), and every uncertainty is surfaced
 * as a warning the review screen can show verbatim.
 */
export function buildAnalyzedItems(
  items: AiFoodItem[],
  lookups: UsdaLookup[],
  options: { usdaConfigured?: boolean } = {},
): BuildResult {
  const warnings: string[] = [];
  const merged = new Map<string, { item: AiFoodItem; lookup: UsdaLookup }>();

  items.forEach((item, index) => {
    const key = normalizeName(item.name);
    const lookup = lookups[index] ?? { status: 'no_match' as const };
    const existing = merged.get(key);
    if (existing) {
      existing.item.grams = roundGrams(existing.item.grams + item.grams);
      return;
    }
    merged.set(key, { item, lookup });
  });

  const analyzed: AnalyzedItem[] = [];
  let unavailableCount = 0;

  for (const { item, lookup } of merged.values()) {
    if (lookup.status === 'unavailable') unavailableCount += 1;
    if (lookup.status === 'matched') {
      analyzed.push(fromUsda(item, lookup.match));
    } else {
      analyzed.push(fromAiEstimate(item));
      warnings.push(
        `"${item.name}" is an AI estimate — no confident USDA FoodData Central match was found.`,
      );
    }
    if (item.confidence < 0.5) {
      warnings.push(
        `The model was unsure about "${item.name}" (${percent(item.confidence)}% confidence). Check the portion.`,
      );
    }
  }

  if (unavailableCount > 0) {
    warnings.unshift(
      options.usdaConfigured === false
        ? 'USDA FoodData Central is not configured on the server, so all nutrition values are AI estimates.'
        : 'USDA FoodData Central was unavailable, so some nutrition values are AI estimates.',
    );
  }
  return { items: analyzed, warnings };
}
