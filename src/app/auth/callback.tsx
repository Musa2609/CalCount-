import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { BrandMark } from '@/components/BrandMark';
import { Notice } from '@/components/Notice';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Content, ErrorBlock, LoadingBlock, Screen } from '@/components/ui/Screen';
import { spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';

/**
 * Landing route for `calcount://auth/callback` — the URL Supabase redirects to
 * after Google sign-in. Android delivers it as `calcount:///auth/callback`
 * (empty host, so the path is `/auth/callback`), which is exactly this file.
 *
 * The exchange itself lives in AppContext, the single owner of incoming auth
 * links: doing it here too would exchange the one-time PKCE code twice and
 * fail. This screen only reports progress and navigates once a session exists.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { session, authRedirect } = useApp();

  // Cold start: `initialLinkChecked` flips only after the link has been fully
  // handled, so "nothing arrived" is a settled fact rather than a guess.
  const processing = authRedirect.status === 'processing' || !authRedirect.initialLinkChecked;
  const failed = authRedirect.status === 'error';
  const missing = !processing && !failed && !session;

  useEffect(() => {
    // AppContext persists the session before publishing it, so navigating here
    // is safe: AuthGate then sends incomplete profiles to onboarding.
    if (!session) return;
    router.replace('/(tabs)');
  }, [session, router]);

  return (
    <Screen bottomInset={spacing.huge}>
      <Content style={styles.content}>
        <BrandMark />

        {processing ? (
          <View style={styles.state}>
            <LoadingBlock label="Finishing sign-in…" />
            <AppText variant="small" color="muted" align="center">
              Verifying the link from Google. This takes a moment.
            </AppText>
          </View>
        ) : null}

        {failed ? (
          <>
            <Notice
              tone="danger"
              title="Sign-in did not complete"
              message={
                authRedirect.message ??
                'The link is invalid or has expired. Please sign in again.'
              }
            />
            <AppText variant="small" color="muted" align="center">
              Sign-in links can only be used once, and they expire quickly.
            </AppText>
            <Button
              label="Back to sign in"
              onPress={() => router.replace('/sign-in')}
              fullWidth
            />
          </>
        ) : null}

        {missing ? (
          <>
            <ErrorBlock
              message="This link does not contain sign-in details. It may have expired or already been used."
            />
            <Button
              label="Back to sign in"
              onPress={() => router.replace('/sign-in')}
              fullWidth
            />
          </>
        ) : null}
      </Content>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.xxxl,
  },
  state: {
    alignItems: 'center',
    gap: spacing.sm,
  },
});
