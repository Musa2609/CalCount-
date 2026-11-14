import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { Mail } from 'lucide-react-native';

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

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useApp();
  const { submit, busy } = useSubmit();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleReset = () => {
    const nextEmailError = validateEmail(email);
    setEmailError(nextEmailError);
    setFormError(null);
    if (nextEmailError) return;

    void submit(async () => {
      try {
        await requestPasswordReset(email);
        setSent(true);
      } catch (error) {
        setFormError(errorMessage(error, 'Could not send the reset email. Please try again.'));
      }
    });
  };

  return (
    <Screen keyboardAware scroll bottomInset={spacing.huge}>
      <Content style={styles.content}>
        <BrandMark />

        <View style={styles.heading}>
          <AppText variant="h1">Reset your password</AppText>
          <AppText variant="body" color="secondary">
            Enter your email and we will send you a link to reset your password.
          </AppText>
        </View>

        {!isSupabaseConfigured ? (
          <Notice
            tone="info"
            title="Cloud accounts are not configured"
            message="Password reset needs Supabase keys. Use on-device mode instead."
          />
        ) : null}

        {formError ? <Notice tone="danger" title="Reset failed" message={formError} /> : null}
        {sent ? (
          <Notice
            tone="success"
            title="Email sent"
            message="Check your inbox for a link to reset your password. The link will open in this app."
          />
        ) : null}

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
            onSubmitEditing={handleReset}
            returnKeyType="go"
          />
          <Button
            label={sent ? 'Resend email' : 'Send reset link'}
            onPress={handleReset}
            loading={busy}
            fullWidth
          />
        </Card>

        <View style={styles.footer}>
          <Link href="/sign-in" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="smallMedium" color="primary">
                Back to sign in
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