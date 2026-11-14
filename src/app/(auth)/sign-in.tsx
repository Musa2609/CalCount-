import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Eye, EyeOff, Mail, Smartphone } from 'lucide-react-native';

import { BrandMark } from '@/components/BrandMark';
import { Notice } from '@/components/Notice';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Content, Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useSubmit } from '@/hooks/useSubmit';
import { isSupabaseConfigured } from '@/lib/env';
import { errorMessage } from '@/lib/utils';
import { validateEmail } from '@/lib/validation';

export default function SignInScreen() {
  const { signIn, continueLocally, signInWithGoogle } = useApp();
  const router = useRouter();
  const { submit, busy } = useSubmit();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSignIn = () => {
    const nextEmailError = validateEmail(email);
    const nextPasswordError = password ? null : 'Enter your password';
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    setNotice(null);
    if (nextEmailError || nextPasswordError) return;

    void submit(async () => {
      try {
        const result = await signIn(email, password);
        if (result.session) {
          router.replace('/(tabs)');
          return;
        }
        setNotice(result.message ?? 'Sign in to continue.');
      } catch (error) {
        setFormError(errorMessage(error, 'Could not sign in. Please try again.'));
      }
    });
  };

  const handleLocal = () => {
    setFormError(null);
    void submit(async () => {
      try {
        await continueLocally();
        router.replace('/(tabs)');
      } catch (error) {
        setFormError(errorMessage(error));
      }
    });
  };

  return (
    <Screen keyboardAware scroll bottomInset={spacing.huge}>
      <Content style={styles.content}>
        <BrandMark />

        <View style={styles.heading}>
          <AppText variant="h1">Welcome back</AppText>
          <AppText variant="body" color="secondary">
            Log meals in seconds and keep your macros on track.
          </AppText>
        </View>

        {!isSupabaseConfigured ? (
          <Notice
            tone="info"
            title="Cloud accounts are not configured"
            message="Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env to enable email accounts. Until then you can track on this device — your data is stored locally."
          />
        ) : null}

        {formError ? <Notice tone="danger" title="Sign in failed" message={formError} /> : null}
        {notice ? <Notice tone="info" title="One more step" message={notice} /> : null}

        <Card style={styles.card}>
          <TextField
            label="Email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError(null);
            }}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            textContentType="emailAddress"
            error={emailError}
            leading={<Mail size={17} color={colors.textMuted} strokeWidth={2} />}
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError(null);
            }}
            placeholder="Your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            error={passwordError}
            onSubmitEditing={handleSignIn}
            returnKeyType="go"
            trailing={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
              >
                {showPassword ? (
                  <EyeOff size={17} color={colors.textMuted} strokeWidth={2} />
                ) : (
                  <Eye size={17} color={colors.textMuted} strokeWidth={2} />
                )}
              </Pressable>
            }
          />
          <Button label="Sign in" onPress={handleSignIn} loading={busy} fullWidth />

          <Link href={"/forgot-password" as any} asChild>
            <Pressable accessibilityRole="link" hitSlop={8} style={styles.forgotLink}>
              <AppText variant="smallMedium" color="primary">
                Forgot password?
              </AppText>
            </Pressable>
          </Link>
        </Card>

        <View style={styles.divider}>
          <View style={styles.line} />
          <AppText variant="caption" color="muted">
            OR
          </AppText>
          <View style={styles.line} />
        </View>

        <Button
          label="Continue on this device"
          variant="secondary"
          icon={Smartphone}
          onPress={handleLocal}
          disabled={busy}
          fullWidth
        />

        {isSupabaseConfigured ? (
          <Button
            label="Sign in with Google"
            variant="secondary"
            icon={Mail}
            onPress={() => {
              setFormError(null);
              void submit(async () => {
                try {
                  const result = await signInWithGoogle();
                  if (result.session) {
                    router.replace('/(tabs)');
                    return;
                  }
                  setNotice(result.message ?? 'Google sign-in did not complete.');
                } catch (error) {
                  setFormError(errorMessage(error, 'Could not sign in with Google.'));
                }
              });
            }}
            disabled={busy}
            fullWidth
          />
        ) : null}
        <AppText variant="small" color="muted" align="center">
          On-device mode keeps your diary in this app only. Nothing is uploaded.
        </AppText>

        <View style={styles.footer}>
          <AppText variant="small" color="secondary">
            New to CalCount?{' '}
          </AppText>
          <Link href="/sign-up" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="smallMedium" color="primary">
                Create an account
              </AppText>
            </Pressable>
          </Link>
        </View>
      </Content>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingTop: spacing.xxl,
  },
  heading: {
    gap: spacing.xs,
  },
  card: {
    gap: spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.xxs,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  forgotLink: {
    alignSelf: 'flex-end',
  },
});
