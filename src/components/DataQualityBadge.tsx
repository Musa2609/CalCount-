import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { DATA_QUALITY_LABELS, DATA_QUALITY_NOTES } from '@/constants/nutrition';
import { colors, radii, spacing } from '@/constants/theme';
import type { DataQuality } from '@/types/models';

const tones: Record<DataQuality, { background: string; foreground: string; dot: string }> = {
  sourced: { background: colors.primarySoft, foreground: colors.primaryDark, dot: colors.primary },
  estimated: { background: colors.warningSoft, foreground: colors.warning, dot: colors.carbs },
  user: { background: colors.infoSoft, foreground: colors.info, dot: colors.info },
  openfoodfacts: { background: colors.surfaceMuted, foreground: colors.textSecondary, dot: colors.textMuted },
};

export function DataQualityBadge({ quality }: { quality: DataQuality }) {
  const tone = tones[quality];
  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]}>
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <AppText variant="caption" style={{ color: tone.foreground }}>
        {DATA_QUALITY_LABELS[quality].toUpperCase()}
      </AppText>
    </View>
  );
}

export function DataQualityNote({ quality }: { quality: DataQuality }) {
  return (
    <AppText variant="small" color="muted">
      {DATA_QUALITY_NOTES[quality]}
    </AppText>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radii.pill,
  },
});
