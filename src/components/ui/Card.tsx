import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { PropsWithChildren } from 'react';

import { colors, radii, shadow, spacing } from '@/constants/theme';

export interface CardProps {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  padded?: boolean;
  tone?: 'surface' | 'muted' | 'primary';
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  padded = true,
  tone = 'surface',
}: PropsWithChildren<CardProps>) {
  const background =
    tone === 'muted' ? colors.surfaceMuted : tone === 'primary' ? colors.primaryTint : colors.surface;
  const base = [styles.card, padded ? styles.padded : null, { backgroundColor: background }, style];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [...base, pressed ? styles.pressed : null]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow,
  },
  padded: {
    padding: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
});
