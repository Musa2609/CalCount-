import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSupabaseClient } from '@/lib/supabase/client';
import { appEnv, isSupabaseConfigured } from '@/lib/env';
import type { AppSession, AuthResult } from '@/types/models';
import type { AuthApi } from '@/lib/backend/types';
import type { Session } from '@supabase/supabase-js';

export const LOCAL_SESSION_STORAGE_KEY = 'calcount:local:session:v1';

/** Must match the redirect allow-list in the Supabase dashboard. */
export const OAUTH_CALLBACK_URL = 'calcount://auth/callback';
export const PASSWORD_RESET_URL = 'calcount://reset-password';

/**
 * Supabase sends recovery/OAuth links back as a deep link. Implicit flow puts
 * the tokens in the URL fragment, PKCE puts a `code` in the query string, so
 * both are read here.
 */
function parseAuthParams(url: string): URLSearchParams {
  const [beforeHash, hash = ''] = url.split('#');
  const queryStart = beforeHash.indexOf('?');
  const query = queryStart >= 0 ? beforeHash.slice(queryStart + 1) : '';
  return new URLSearchParams([query, hash].filter(Boolean).join('&'));
}

export interface AuthRedirectResult {
  session: AppSession | null;
  /** 'recovery' for password resets, 'signup'/'magiclink' otherwise. */
  type: string | null;
}

/**
 * True for the links that carry credentials: the OAuth callback and the
 * password-reset link. Other deep links belong to the router and must not be
 * parsed as auth params.
 */
export function isAuthDeepLink(url: string): boolean {
  const [beforeHash] = url.split('#');
  const path = beforeHash
    .replace(/^calcount:\/\/+/, '')
    .split('?')[0]
    .replace(/\/+$/, '');
  return path === 'auth/callback' || path === 'reset-password';
}

/**
 * Turns an incoming `calcount://...` link into a real session. Without this the
 * password-reset screen would call updateUser with no session and always fail.
 */
export async function completeAuthRedirect(url: string): Promise<AuthRedirectResult> {
  if (!isSupabaseConfigured) return { session: null, type: null };
  const params = parseAuthParams(url);
  const type = params.get('type');

  const errorDescription = params.get('error_description') ?? params.get('error');
  if (errorDescription) {
    throw new Error(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
  }

  const client = getSupabaseClient();
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const code = params.get('code');

  if (accessToken && refreshToken) {
    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return { session: mapSession(data.session), type };
  }

  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return { session: mapSession(data.session), type };
  }

  return { session: null, type };
}

const redirectResults = new Map<string, Promise<AuthRedirectResult>>();
const MAX_CACHED_REDIRECTS = 10;

/**
 * A one-time code / token identifies one callback. Android can hand the same
 * link to the router *and* to a Linking listener, and `openAuthSessionAsync`
 * can return it as well, so callers are de-duplicated on this key.
 */
function redirectKey(url: string): string {
  const params = parseAuthParams(url);
  return params.get('code') ?? params.get('access_token') ?? url;
}

/**
 * Runs the exchange for a link at most once and shares the outcome with every
 * caller. Exchanging a PKCE code twice always fails, which is what made the
 * callback look broken.
 */
export function completeAuthRedirectOnce(url: string): Promise<AuthRedirectResult> {
  const key = redirectKey(url);
  const cached = redirectResults.get(key);
  if (cached) return cached;

  const pending = completeAuthRedirect(url).catch((error: unknown) => {
    // A failed link is not cached, so a retry can still report the real error.
    redirectResults.delete(key);
    throw error;
  });

  if (redirectResults.size >= MAX_CACHED_REDIRECTS) {
    const oldest = redirectResults.keys().next().value;
    if (oldest !== undefined) redirectResults.delete(oldest);
  }
  redirectResults.set(key, pending);
  return pending;
}

function mapSession(session: Session | null): AppSession | null {
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    mode: 'supabase',
  };
}

const supabaseAuth: AuthApi = {
  async getSession() {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await getSupabaseClient().auth.getSession();
      if (error) return null;
      return mapSession(data.session);
    } catch {
      return null;
    }
  },

  onAuthStateChange(listener) {
    if (!isSupabaseConfigured) return () => undefined;
    const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      listener(mapSession(session));
    });
    return () => data.subscription.unsubscribe();
  },

  async signIn(email, password): Promise<AuthResult> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured on this build.');
    }
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
    return { session: mapSession(data.session) };
  },

  async signUp(name, email, password): Promise<AuthResult> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured on this build.');
    }
    const { data, error } = await getSupabaseClient().auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: name.trim() },
      },
    });
    if (error) throw error;
    if (!data.session) {
      return {
        session: null,
        needsEmailConfirmation: true,
        message:
          'Check your inbox to confirm your email, then sign in. If confirmation is disabled in Supabase, sign in directly.',
      };
    }
    return { session: mapSession(data.session) };
  },

  async signOut() {
    if (!isSupabaseConfigured) return;
    await getSupabaseClient().auth.signOut();
  },

  async requestPasswordReset(email: string): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured on this build.');
    }
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: PASSWORD_RESET_URL },
    );
    if (error) throw error;
  },

  async updatePassword(newPassword: string): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured on this build.');
    }
    const { error } = await getSupabaseClient().auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  async deleteAccount(): Promise<void> {
    if (!isSupabaseConfigured) return;
    const client = getSupabaseClient();
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('Not signed in');

    const response = await fetch(
      `${appEnv.supabaseUrl}/functions/v1/delete-account`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? 'Account deletion failed');
    }
    await client.auth.signOut();
  },

  async signInWithGoogle(): Promise<AuthResult> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured on this build.');
    }
    const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: OAUTH_CALLBACK_URL,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data?.url) {
      return { session: null, message: 'Google sign-in could not be started.' };
    }

    const WebBrowser = await import('expo-web-browser');
    const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_CALLBACK_URL);

    if (result.type === 'success' && result.url) {
      // Same helper as the /auth/callback route, so the code is never
      // exchanged twice when both paths see the redirect.
      const { session: nextSession } = await completeAuthRedirectOnce(result.url);
      if (nextSession) return { session: nextSession };
      return { session: null, message: 'Google sign-in did not return a session.' };
    }

    // On Android the redirect can also arrive as a plain deep link instead of
    // through the browser session. The /auth/callback route finishes it then.
    return {
      session: null,
      message:
        result.type === 'cancel'
          ? 'Google sign-in was cancelled.'
          : 'Google sign-in did not complete.',
    };
  },
};

async function readLocalSession(): Promise<AppSession | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string };
    if (!parsed.userId) return null;
    return { userId: parsed.userId, email: null, mode: 'local' };
  } catch {
    return null;
  }
}

const localAuth: AuthApi = {
  getSession: readLocalSession,

  onAuthStateChange() {
    return () => undefined;
  },

  async signIn(): Promise<AuthResult> {
    throw new Error('Email sign-in is not available in local mode.');
  },

  async signUp(): Promise<AuthResult> {
    throw new Error('Email sign-up is not available in local mode.');
  },

  async signOut() {
    await AsyncStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
  },

  async requestPasswordReset(): Promise<void> {
    throw new Error('Password reset is not available in local mode.');
  },

  async updatePassword(): Promise<void> {
    throw new Error('Password update is not available in local mode.');
  },

  async deleteAccount(): Promise<void> {
    await AsyncStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
  },

  async continueLocally(): Promise<AuthResult> {
    const existing = await readLocalSession();
    if (existing) return { session: existing };
    const session: AppSession = {
      userId: '00000000-0000-4000-8000-00000000caca',
      email: null,
      mode: 'local',
    };
    await AsyncStorage.setItem(
      LOCAL_SESSION_STORAGE_KEY,
      JSON.stringify({ userId: session.userId, createdAt: new Date().toISOString() }),
    );
    return { session };
  },
};

/**
 * Unified auth API used by the UI. Supabase credentials are preferred when
 * available; local mode remains an explicit, clearly-labelled option.
 */
export const authApi: AuthApi = {
  async getSession() {
    const supabaseSession = await supabaseAuth.getSession();
    if (supabaseSession) return supabaseSession;
    return readLocalSession();
  },

  onAuthStateChange(listener) {
    const unsubscribe = supabaseAuth.onAuthStateChange(listener);
    return unsubscribe;
  },

  signIn: (email, password) => supabaseAuth.signIn(email, password),
  signUp: (name, email, password) => supabaseAuth.signUp(name, email, password),
  signOut: async () => {
    await Promise.all([supabaseAuth.signOut(), localAuth.signOut()]);
  },
  continueLocally: () => localAuth.continueLocally!(),
  requestPasswordReset: (email: string) => supabaseAuth.requestPasswordReset(email),
  updatePassword: (newPassword: string) => supabaseAuth.updatePassword(newPassword),
  deleteAccount: async () => {
    await supabaseAuth.deleteAccount();
    await localAuth.deleteAccount?.();
  },
  signInWithGoogle: () => supabaseAuth.signInWithGoogle?.() ?? Promise.reject(new Error('Not available')),
};
