import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { progressRatio } from '@/lib/nutrition';

export function ProgressBar({
  value,
  target,
  color = colors.primary,
  height = 8,
  trackColor = colors.surfaceMuted,
}: {
  value: number;
  target: number;
  color?: string;
  height?: number;
  trackColor?: string;
}) {
  const ratio = progressRatio(value, target);
  const over = target > 0 && value > target;
  return (
    <View style={[styles.track, { height, borderRadius: height, backgroundColor: trackColor }]}>
      <View
        style={{
          width: `${Math.max(ratio * 100, value > 0 ? 3 : 0)}%`,
          height: '100%',
          borderRadius: height,
          backgroundColor: over ? colors.warning : color,
        }}
      />
    </View>
  );
}

/** Label + value/target + bar. Used for protein, carbs and fat rows. */
export function MacroProgressRow({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  const rounded = target > 0 ? Math.min(999, Math.round((value / target) * 100)) : 0;
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroHeader}>
        <View style={styles.macroLabel}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <AppText variant="smallMedium" color="secondary">
            {label}
          </AppText>
        </View>
        <AppText variant="smallMedium">
          {Math.round(value)}
          <AppText variant="small" color="muted">
            {` / ${Math.round(target)} g · ${rounded}%`}
          </AppText>
        </AppText>
      </View>
      <ProgressBar value={value} target={target} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  macroRow: {
    gap: spacing.xs,
  },
  macroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  macroLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
});
