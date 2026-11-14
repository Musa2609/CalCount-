import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { appEnv, isSupabaseConfigured } from '@/lib/env';

let client: SupabaseClient | null = null;

/**
 * The anon key is intentionally public; access is constrained by RLS.
 * The session is persisted in AsyncStorage so users stay signed in.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env',
    );
  }
  if (!client) {
    client = createClient(appEnv.supabaseUrl, appEnv.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'calcount-expo',
        },
      },
    });
  }
  return client;
}
