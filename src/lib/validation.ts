const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required';
  if (!isValidEmail(email)) return 'Enter a valid email address';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Use at least 8 characters';
  return null;
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required';
  if (trimmed.length > 60) return 'Keep your name under 60 characters';
  return null;
}

export function parseNumericInput(value: string): number | null {
  const normalised = value.replace(',', '.').replace(/[^0-9.]/g, '');
  if (!normalised || normalised === '.') return null;
  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateRange(
  value: number | null,
  min: number,
  max: number,
  label: string,
): string | null {
  if (value === null || !Number.isFinite(value)) return `Enter ${label}`;
  if (value < min || value > max) return `${label} must be between ${min} and ${max}`;
  return null;
}

export function validateAge(age: number | null): string | null {
  return validateRange(age, 13, 100, 'Age');
}

export function validateHeightCm(cm: number | null): string | null {
  return validateRange(cm, 100, 250, 'Height');
}

export function validateWeightKg(kg: number | null): string | null {
  return validateRange(kg, 30, 300, 'Weight');
}

export function validateCalorieTarget(value: number | null): string | null {
  if (value === null) return 'Enter a calorie target';
  if (value < 1000 || value > 10000) return 'Calorie target must be between 1,000 and 10,000';
  return null;
}

export function validateMacroTarget(value: number | null): string | null {
  if (value === null) return 'Enter a target';
  if (value < 0 || value > 1000) return 'Macro target must be between 0 and 1,000 g';
  return null;
}

export function validateQuantity(grams: number | null): string | null {
  if (grams === null || !Number.isFinite(grams)) return 'Enter a quantity';
  if (grams <= 0) return 'Quantity must be greater than 0';
  if (grams > 5000) return 'Quantity is too large (max 5,000 g)';
  return null;
}

export function validateServingGrams(grams: number | null): string | null {
  if (grams === null || !Number.isFinite(grams)) return 'Enter serving weight';
  if (grams <= 0) return 'Serving weight must be greater than 0';
  if (grams > 5000) return 'Serving weight is too large';
  return null;
}

export function validateCustomFood(input: {
  name: string;
  servingGrams: number | null;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = 'Food name is required';
  const servingError = validateServingGrams(input.servingGrams);
  if (servingError) errors.servingGrams = servingError;
  if (input.caloriesPer100g === null || input.caloriesPer100g < 0 || input.caloriesPer100g > 1000) {
    errors.calories = 'Calories per 100g must be between 0 and 1,000';
  }
  for (const [key, value] of [
    ['protein', input.proteinPer100g],
    ['carbs', input.carbsPer100g],
    ['fat', input.fatPer100g],
  ] as const) {
    if (value === null || value < 0 || value > 100) {
      errors[key] = 'Enter a value between 0 and 100 g';
    }
  }
  return errors;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
