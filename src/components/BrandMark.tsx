import { StyleSheet, View } from 'react-native';
import { Flame } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';

export function BrandMark({ size = 54 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <View style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }]}>
        <Flame size={size * 0.46} color={colors.primaryDark} strokeWidth={2.2} />
      </View>
      <View>
        <AppText variant="h2" color="primary">
          CalCount
        </AppText>
        <AppText variant="caption" color="muted">
          NUTRITION, MADE SIMPLE
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  mark: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
});
