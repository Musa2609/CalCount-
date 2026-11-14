import type { BackendMode } from '@/types/models';
import { LocalBackend } from './local';
import { SupabaseBackend } from './supabase';
import type { DataBackend } from './types';

let localBackend: LocalBackend | null = null;
let supabaseBackend: SupabaseBackend | null = null;

export function getBackend(mode: BackendMode): DataBackend {
  if (mode === 'supabase') {
    if (!supabaseBackend) supabaseBackend = new SupabaseBackend();
    return supabaseBackend;
  }
  if (!localBackend) localBackend = new LocalBackend();
  return localBackend;
}

export type { DataBackend, FoodSearchOptions } from './types';
