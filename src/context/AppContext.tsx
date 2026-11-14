import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import * as Linking from 'expo-linking';

import { authApi, completeAuthRedirectOnce, isAuthDeepLink } from '@/lib/auth';
import { getBackend } from '@/lib/backend';
import type { DataBackend } from '@/lib/backend/types';
import { errorMessage } from '@/lib/utils';
import type {
  AppSession,
  AuthResult,
  Profile,
} from '@/types/models';

/**
 * Result of the incoming auth deep link, shared so the /auth/callback route
 * can tell "still exchanging" from "nothing to exchange" without doing (or
 * repeating) the exchange itself.
 */
export interface AuthRedirectState {
  status: 'idle' | 'processing' | 'done' | 'error';
  message: string | null;
  type: string | null;
  /** True once the cold-start link (if any) has been fully handled. */
  initialLinkChecked: boolean;
}

const idleAuthRedirect: AuthRedirectState = {
  status: 'idle',
  message: null,
  type: null,
  initialLinkChecked: false,
};

interface AppContextValue {
  status: 'loading' | 'ready';
  authRedirect: AuthRedirectState;
  session: AppSession | null;
  profile: Profile | null;
  backend: DataBackend;
  bootError: string | null;
  revision: number;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  continueLocally: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  signInWithGoogle: () => Promise<AuthResult>;
  refreshProfile: () => Promise<Profile | null>;
  setProfile: (profile: Profile) => void;
  invalidate: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [session, setSession] = useState<AppSession | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [backend, setBackend] = useState<DataBackend>(() => getBackend('local'));
  const [bootError, setBootError] = useState<string | null>(null);
  const [authRedirect, setAuthRedirect] = useState<AuthRedirectState>(idleAuthRedirect);
  const [revision, setRevision] = useState(0);
  const sessionRef = useRef<AppSession | null>(null);
  const mountedRef = useRef(true);

  const applySession = useCallback(async (nextSession: AppSession | null) => {
    sessionRef.current = nextSession;
    if (!nextSession) {
      setSession(null);
      setProfileState(null);
      return;
    }
    const nextBackend = getBackend(nextSession.mode);
    let nextProfile: Profile | null = null;
    try {
      nextProfile = await nextBackend.getProfile(nextSession.userId);
    } catch (error) {
      if (mountedRef.current) {
        setBootError(errorMessage(error, 'Could not load your profile.'));
      }
    }
    if (!mountedRef.current) return;
    setBackend(nextBackend);
    setSession(nextSession);
    setProfileState(nextProfile);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let unsubscribe: () => void = () => undefined;

    (async () => {
      try {
        const existing = await authApi.getSession();
        if (!mountedRef.current) return;
        await applySession(existing);
      } catch (error) {
        if (mountedRef.current) {
          setBootError(errorMessage(error, 'Could not restore your session.'));
        }
      } finally {
        if (mountedRef.current) setStatus('ready');
      }

      unsubscribe = authApi.onAuthStateChange((nextSession) => {
        const current = sessionRef.current;
        if (!nextSession) {
          applySession(null);
          return;
        }
        if (
          !current ||
          current.userId !== nextSession.userId ||
          current.mode !== nextSession.mode
        ) {
          applySession(nextSession);
        }
      });
    })();

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [applySession]);

  // Password-reset and OAuth links arrive as deep links. This is the single
  // place that turns the URL into a session; the /auth/callback route only
  // reads the outcome. `completeAuthRedirectOnce` guarantees one exchange per
  // link even when the router and this listener both see it.
  useEffect(() => {
    let active = true;

    const handleUrl = async (url: string) => {
      if (!active || !url || !isAuthDeepLink(url)) return;
      setAuthRedirect((current) => ({ ...current, status: 'processing', message: null }));
      try {
        const result = await completeAuthRedirectOnce(url);
        if (!active) return;
        if (result.session) {
          setBootError(null);
          await applySession(result.session);
          if (!active) return;
          setRevision((value) => value + 1);
        }
        setAuthRedirect({
          status: 'done',
          message: null,
          type: result.type,
          initialLinkChecked: true,
        });
      } catch (error) {
        if (!active) return;
        const message = errorMessage(
          error,
          'That link is invalid or has expired. Request a new one.',
        );
        setBootError(message);
        setAuthRedirect({
          status: 'error',
          message,
          type: null,
          initialLinkChecked: true,
        });
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    void Linking.getInitialURL()
      .then((url) => (url ? handleUrl(url) : undefined))
      .catch(() => undefined)
      .finally(() => {
        // Settled either way: nothing else will arrive from the cold start.
        if (active) {
          setAuthRedirect((current) =>
            current.initialLinkChecked ? current : { ...current, initialLinkChecked: true },
          );
        }
      });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [applySession]);

  const finishAuth = useCallback(
    async (result: AuthResult) => {
      if (result.session) {
        setBootError(null);
        await applySession(result.session);
        setRevision((value) => value + 1);
      }
      return result;
    },
    [applySession],
  );

  const signIn = useCallback(
    async (email: string, password: string) => finishAuth(await authApi.signIn(email, password)),
    [finishAuth],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) =>
      finishAuth(await authApi.signUp(name, email, password)),
    [finishAuth],
  );

  const continueLocally = useCallback(async () => {
    if (!authApi.continueLocally) throw new Error('Local mode is unavailable.');
    return finishAuth(await authApi.continueLocally());
  }, [finishAuth]);

  const signOut = useCallback(async () => {
    await authApi.signOut();
    sessionRef.current = null;
    setSession(null);
    setProfileState(null);
    setRevision((value) => value + 1);
  }, []);

  const requestPasswordReset = useCallback(
    async (email: string) => {
      await authApi.requestPasswordReset(email);
    },
    [],
  );

  const updatePassword = useCallback(
    async (newPassword: string) => {
      await authApi.updatePassword(newPassword);
    },
    [],
  );

  const deleteAccount = useCallback(async () => {
    await authApi.deleteAccount();
    sessionRef.current = null;
    setSession(null);
    setProfileState(null);
    setRevision((value) => value + 1);
  }, []);

  const signInWithGoogle = useCallback(
    async () => finishAuth(await authApi.signInWithGoogle!()),
    [finishAuth],
  );

  const refreshProfile = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return null;
    try {
      const nextProfile = await getBackend(current.mode).getProfile(current.userId);
      if (mountedRef.current) setProfileState(nextProfile);
      return nextProfile;
    } catch (error) {
      if (mountedRef.current) {
        setBootError(errorMessage(error, 'Could not refresh your profile.'));
      }
      return null;
    }
  }, []);

  const setProfile = useCallback((nextProfile: Profile) => {
    setProfileState(nextProfile);
    setRevision((value) => value + 1);
  }, []);

  const invalidate = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      authRedirect,
      session,
      profile,
      backend,
      bootError,
      revision,
      signIn,
      signUp,
      continueLocally,
      signOut,
      requestPasswordReset,
      updatePassword,
      deleteAccount,
      signInWithGoogle,
      refreshProfile,
      setProfile,
      invalidate,
    }),
    [
      status,
      authRedirect,
      session,
      profile,
      backend,
      bootError,
      revision,
      signIn,
      signUp,
      continueLocally,
      signOut,
      requestPasswordReset,
      updatePassword,
      deleteAccount,
      signInWithGoogle,
      refreshProfile,
      setProfile,
      invalidate,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}

export function useSession(): AppSession {
  const { session } = useApp();
  if (!session) throw new Error('A signed-in session is required for this screen');
  return session;
}
