import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing, typeScale } from '@/constants/theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string;
  suffix?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function TextField({
  label,
  error,
  hint,
  suffix,
  leading,
  trailing,
  containerStyle,
  compact = false,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.borderStrong;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <AppText variant="smallMedium" color="secondary" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          compact ? styles.fieldCompact : null,
          { borderColor },
          focused ? styles.fieldFocused : null,
        ]}
      >
        {leading}
        <TextInput
          {...inputProps}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          placeholderTextColor={colors.textMuted}
          style={[typeScale.body, styles.input]}
        />
        {suffix ? (
          <AppText variant="smallMedium" color="muted">
            {suffix}
          </AppText>
        ) : null}
        {trailing}
      </View>
      {error ? (
        <AppText variant="small" color="danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" color="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** Tappable field surface used for rows that open a picker or another screen. */
export function FieldShell({
  label,
  value,
  onPress,
  placeholder,
  icon,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  placeholder?: string;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.shell, pressed ? styles.shellPressed : null]}
    >
      <View style={styles.shellText}>
        <AppText variant="caption" color="muted">
          {label.toUpperCase()}
        </AppText>
        <AppText variant="bodyMedium" color={value ? 'default' : 'muted'}>
          {value || placeholder || '—'}
        </AppText>
      </View>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    marginLeft: spacing.xxs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  fieldCompact: {
    minHeight: 42,
  },
  fieldFocused: {
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.text,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  shellPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  shellText: {
    gap: 2,
    flex: 1,
  },
});
