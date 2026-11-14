import { colors } from '@/constants/theme';
import type { MealType } from '@/types/models';

export function makeId(prefix = ''): string {
  const cryptoObject = globalThis.crypto as
    | { randomUUID?: () => string }
    | undefined;
  const raw =
    cryptoObject?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  return prefix ? `${prefix}_${raw}` : raw;
}

export function makeIdempotencyKey(): string {
  return makeId('log');
}

export function formatCalories(value: number): string {
  return Math.round(value).toLocaleString('en-IN');
}

export function formatGrams(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}g` : `${rounded.toFixed(1)}g`;
}

export function formatMacro(value: number): string {
  return `${Math.round(value * 10) / 10}`;
}

export function initials(name: string | null | undefined): string {
  if (!name?.trim()) return 'C';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function firstName(name: string | null | undefined): string {
  if (!name?.trim()) return 'there';
  return name.trim().split(/\s+/)[0];
}

export function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export const MEAL_COLORS: Record<MealType, string> = {
  breakfast: '#E8A23B',
  lunch: '#0B7A55',
  dinner: '#5B67D8',
  snacks: '#C25487',
};

export const MEAL_SOFT_COLORS: Record<MealType, string> = {
  breakfast: '#FDF3E2',
  lunch: '#E4F4EC',
  dinner: '#EDEEFB',
  snacks: '#FBEDF4',
};

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      if (message.toLowerCase().includes('invalid login credentials')) {
        return 'That email and password combination does not match an account.';
      }
      if (message.toLowerCase().includes('user already registered')) {
        return 'An account with this email already exists. Try signing in.';
      }
      if (message.toLowerCase().includes('email not confirmed')) {
        return 'Please confirm your email address, then sign in.';
      }
      if (message.toLowerCase().includes('network request failed')) {
        return 'You appear to be offline. Check your connection and try again.';
      }
      return message;
    }
  }
  return fallback;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function summariseError(error: unknown): string {
  return errorMessage(error);
}

export const NUTRIENT_COLORS = {
  calories: colors.primary,
  protein: colors.protein,
  carbs: colors.carbs,
  fat: colors.fat,
} as const;

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
