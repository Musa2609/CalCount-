import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';

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
import { errorMessage } from '@/lib/utils';
import { validatePassword } from '@/lib/validation';

export default function ResetPasswordScreen() {
  const { updatePassword, authRedirect } = useApp();
  const router = useRouter();
  const { submit, busy } = useSubmit();

  // The recovery token in the link is exchanged by AppContext; until that
  // settles there is no session to update, so the form stays locked.
  const verifying = authRedirect.status === 'processing';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = () => {
    const nextPasswordError = validatePassword(password);
    const nextConfirmError = password !== confirmPassword ? 'Passwords do not match' : null;
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    setFormError(null);
    if (nextPasswordError || nextConfirmError) return;

    void submit(async () => {
      try {
        await updatePassword(password);
        setSuccess(true);
        setTimeout(() => router.replace('/sign-in'), 2000);
      } catch (error) {
        setFormError(errorMessage(error, 'Could not update your password. Please try again.'));
      }
    });
  };

  return (
    <Screen keyboardAware scroll bottomInset={spacing.huge}>
      <Content style={styles.content}>
        <BrandMark />

        <View style={styles.heading}>
          <AppText variant="h1">Choose a new password</AppText>
          <AppText variant="body" color="secondary">
            Enter a new password for your account.
          </AppText>
        </View>

        {verifying ? (
          <Notice
            tone="info"
            title="Verifying your reset link"
            message="Hold on while we finish checking this link."
          />
        ) : null}
        {formError ? <Notice tone="danger" title="Update failed" message={formError} /> : null}
        {success ? (
          <Notice tone="success" title="Password updated" message="You can now sign in with your new password." />
        ) : null}

        <Card style={styles.card}>
          <TextField
            label="New password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError(null);
            }}
            placeholder="At least 8 characters"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            error={passwordError}
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
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (confirmError) setConfirmError(null);
            }}
            placeholder="Repeat your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            error={confirmError}
            returnKeyType="go"
            onSubmitEditing={handleReset}
          />
          <Button
            label="Update password"
            onPress={handleReset}
            loading={busy}
            disabled={verifying}
            fullWidth
          />
        </Card>
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
});