import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing, typeScale } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const palette: Record<
  ButtonVariant,
  { background: string; border: string; text: string; pressed: string }
> = {
  primary: {
    background: colors.primary,
    border: colors.primary,
    text: colors.white,
    pressed: colors.primaryDark,
  },
  secondary: {
    background: colors.surface,
    border: colors.borderStrong,
    text: colors.text,
    pressed: colors.surfaceMuted,
  },
  soft: {
    background: colors.primarySoft,
    border: colors.primarySoft,
    text: colors.primaryDark,
    pressed: colors.surfaceStrong,
  },
  ghost: {
    background: 'transparent',
    border: 'transparent',
    text: colors.primary,
    pressed: colors.primaryTint,
  },
  danger: {
    background: colors.danger,
    border: colors.danger,
    text: colors.white,
    pressed: '#9E322D',
  },
};

const sizes: Record<ButtonSize, { height: number; paddingHorizontal: number; gap: number; icon: number }> = {
  sm: { height: 38, paddingHorizontal: spacing.md, gap: spacing.xs, icon: 15 },
  md: { height: 48, paddingHorizontal: spacing.lg, gap: spacing.sm, icon: 18 },
  lg: { height: 54, paddingHorizontal: spacing.xl, gap: spacing.sm, icon: 20 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const tone = palette[variant];
  const metrics = sizes[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: metrics.height,
          paddingHorizontal: metrics.paddingHorizontal,
          gap: metrics.gap,
          backgroundColor: pressed && !isDisabled ? tone.pressed : tone.background,
          borderColor: tone.border,
          opacity: isDisabled && !loading ? 0.55 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
        },
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.text} />
      ) : Icon && iconPosition === 'left' ? (
        <Icon size={metrics.icon} color={tone.text} strokeWidth={2.3} />
      ) : null}
      <AppText
        numberOfLines={1}
        style={[
          typeScale.button,
          styles.label,
          { color: tone.text, fontSize: size === 'sm' ? 13 : typeScale.button.fontSize },
        ]}
      >
        {label}
      </AppText>
      {!loading && Icon && iconPosition === 'right' ? (
        <Icon size={metrics.icon} color={tone.text} strokeWidth={2.3} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    textAlign: 'center',
  },
});
