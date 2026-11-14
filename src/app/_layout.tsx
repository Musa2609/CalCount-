import { useEffect, type PropsWithChildren } from 'react';
import { useFonts } from 'expo-font';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider, useApp } from '@/context/AppContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { ToastProvider } from '@/context/ToastContext';
import { colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Single navigation gate for the whole app:
 * signed out -> sign in, signed in without a plan -> onboarding, else tabs.
 * Screens can assume a session; this redirect is the safety net for deep links.
 */
function AuthGate({ children }: PropsWithChildren) {
  const segments = useSegments();
  const router = useRouter();
  const { status, session, profile } = useApp();

  useEffect(() => {
    if (status !== 'ready') return;
    const root = segments[0];
    const inAuth = root === '(auth)';
    const inOnboarding = root === 'onboarding';
    // @ts-ignore
    const isEntry = root === undefined || root === 'index';
    // @ts-ignore
    const isResetPassword = root === 'reset-password';
    // The OAuth redirect must render even while signed out: the session only
    // exists after the callback has been exchanged.
    // @ts-ignore
    const isAuthCallback = root === 'auth' && segments[1] === 'callback';
    if (isResetPassword || isAuthCallback) return;

    if (!session) {
      if (!inAuth) router.replace('/sign-in');
      return;
    }
    if (!profile?.onboardingCompleted) {
      if (!inOnboarding) router.replace('/onboarding');
      return;
    }
    if (inAuth || inOnboarding || isEntry) router.replace('/(tabs)');
  }, [status, session, profile, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <AppProvider>
          <ToastProvider>
            <ConfirmProvider>
              <StatusBar style="dark" />
              <AuthGate>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                    animation: 'slide_from_right',
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                  <Stack.Screen name="auth/callback" options={{ animation: 'fade' }} />
                  <Stack.Screen
                    name="onboarding"
                    options={{ animation: 'fade', gestureEnabled: false }}
                  />
                  <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                  <Stack.Screen name="food/search" />
                  <Stack.Screen name="food/[id]" />
                  <Stack.Screen name="food/new" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="log/[id]" />
                  <Stack.Screen name="saved-meals" />
                  <Stack.Screen name="targets" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="scan" />
                </Stack>
              </AuthGate>
            </ConfirmProvider>
          </ToastProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
