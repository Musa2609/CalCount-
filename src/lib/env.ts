/**
 * Environment configuration.
 * Only EXPO_PUBLIC_* variables are embedded in the client bundle.
 * Never put service-role keys or other secrets here.
 */
export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  visionApiUrl: string;
  visionApiKey: string;
  openFoodFactsEnabled: boolean;
}

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/**
 * The vision backend is the project's own Edge Function. Deriving the URL from
 * the Supabase project means a deploy is all it takes to switch photo
 * recognition on; EXPO_PUBLIC_VISION_API_URL can still point somewhere else.
 */
const functionsBaseUrl = supabaseUrl.replace(/\/+$/, '');

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    !value ||
    lower.includes('your-project') ||
    lower.includes('your-anon') ||
    lower.includes('example.supabase.co') ||
    lower.includes('changeme')
  );
}

export const isSupabaseConfigured =
  !isPlaceholder(supabaseUrl) &&
  !isPlaceholder(supabaseAnonKey) &&
  supabaseUrl.startsWith('https://');

const defaultVisionApiUrl = isSupabaseConfigured
  ? `${functionsBaseUrl}/functions/v1/analyze-food-photo`
  : '';

export const appEnv: AppEnv = {
  supabaseUrl,
  supabaseAnonKey,
  visionApiUrl:
    (process.env.EXPO_PUBLIC_VISION_API_URL ?? '').trim() || defaultVisionApiUrl,
  visionApiKey: (process.env.EXPO_PUBLIC_VISION_API_KEY ?? '').trim(),
  openFoodFactsEnabled: (process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS ?? 'true') !== 'false',
};

export const isVisionConfigured =
  !isPlaceholder(appEnv.visionApiUrl) && appEnv.visionApiUrl.startsWith('https://');
