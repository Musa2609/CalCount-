import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Eye, EyeOff, Mail } from 'lucide-react-native';

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
import { validateEmail, validateName, validatePassword } from '@/lib/validation';

export default function SignUpScreen() {
  const { signUp, signInWithGoogle } = useApp();
  const router = useRouter();
  const { submit, busy } = useSubmit();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSignUp = () => {
    const nextErrors = {
      name: validateName(name),
      email: validateEmail(email),
      password: validatePassword(password),
      confirm: password !== confirmPassword ? 'Passwords do not match' : null,
    };
    setErrors(nextErrors);
    setFormError(null);
    setNotice(null);
    if (Object.values(nextErrors).some(Boolean)) return;

    void submit(async () => {
      try {
        const result = await signUp(name, email, password);
        if (result.session) {
          router.replace('/onboarding');
          return;
        }
        setNotice(result.message ?? 'Confirm your email to finish signing up.');
      } catch (error) {
        setFormError(errorMessage(error, 'Could not create your account.'));
      }
    });
  };

  return (
    <Screen keyboardAware scroll bottomInset={spacing.huge}>
      <Content style={styles.content}>
        <BrandMark />

        <View style={styles.heading}>
          <AppText variant="h1">Create your account</AppText>
          <AppText variant="body" color="secondary">
            One minute now, effortless tracking later.
          </AppText>
        </View>

        {!isSupabaseConfigured ? (
          <Notice
            tone="info"
            title="Cloud accounts are not configured"
            message="Email sign-up needs Supabase keys in .env. Use “Continue on this device” on the sign-in screen to track locally."
          />
        ) : null}
        {formError ? <Notice tone="danger" title="Sign up failed" message={formError} /> : null}
        {notice ? <Notice tone="success" title="Check your inbox" message={notice} /> : null}

        <Card style={styles.card}>
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
            autoComplete="name"
            error={errors.name ?? null}
            maxLength={60}
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            error={errors.email ?? null}
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            error={errors.password ?? null}
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
          <TextField
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repeat your password"
            secureTextEntry
            autoCapitalize="none"
            error={errors.confirm ?? null}
            returnKeyType="go"
            onSubmitEditing={handleSignUp}
          />
          <Button label="Create account" onPress={handleSignUp} loading={busy} fullWidth />
        </Card>

        {isSupabaseConfigured ? (
          <Button
            label="Sign up with Google"
            variant="secondary"
            icon={Mail}
            onPress={() => {
              setFormError(null);
              void submit(async () => {
                try {
                  const result = await signInWithGoogle();
                  if (result.session) {
                    router.replace('/onboarding');
                    return;
                  }
                  setNotice(result.message ?? 'Google sign-up did not complete.');
                } catch (error) {
                  setFormError(errorMessage(error, 'Could not sign up with Google.'));
                }
              });
            }}
            disabled={busy}
            fullWidth
          />
        ) : null}

        <View style={styles.footer}>
          <AppText variant="small" color="secondary">
            Already tracking?{' '}
          </AppText>
          <Link href="/sign-in" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="smallMedium" color="primary">
                Sign in
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
