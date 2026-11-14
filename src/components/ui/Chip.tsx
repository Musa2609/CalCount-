import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';

export interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  tone?: 'default' | 'onDark';
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, active = false, onPress, icon: Icon, tone = 'default', style }: ChipProps) {
  const activeText = tone === 'onDark' ? colors.primaryDark : colors.white;
  const idleText = tone === 'onDark' ? 'rgba(255,255,255,0.82)' : colors.textSecondary;
  const textColor = active ? activeText : idleText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        tone === 'onDark' ? styles.chipOnDark : null,
        active ? styles.chipActive : null,
        pressed ? styles.chipPressed : null,
        style,
      ]}
    >
      {Icon ? <Icon size={14} color={textColor} strokeWidth={2.2} /> : null}
      <AppText variant="smallMedium" style={{ color: textColor }} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              active ? styles.segmentActive : null,
              pressed && !active ? styles.segmentPressed : null,
            ]}
          >
            <AppText
              variant="smallMedium"
              color={active ? 'primary' : 'secondary'}
              numberOfLines={1}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOnDark: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.8,
  },
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.xxs,
    padding: 3,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segmentPressed: {
    opacity: 0.7,
  },
});
