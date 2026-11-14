import { Pressable, StyleSheet, View } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import {
  addDaysToKey,
  formatFriendlyDate,
  formatLongDate,
  todayKey,
} from '@/lib/dates';

export function DateNavigator({
  date,
  onChange,
  allowFuture = false,
}: {
  date: string;
  onChange: (next: string) => void;
  allowFuture?: boolean;
}) {
  const today = todayKey();
  const canGoForward = allowFuture || date < today;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous day"
        onPress={() => onChange(addDaysToKey(date, -1))}
        style={({ pressed }) => [styles.arrow, pressed ? styles.pressed : null]}
      >
        <ChevronLeft size={18} color={colors.text} strokeWidth={2.4} />
      </Pressable>

      <View style={styles.center}>
        <View style={styles.labelRow}>
          <CalendarDays size={14} color={colors.primary} strokeWidth={2.2} />
          <AppText variant="bodyMedium">{formatFriendlyDate(date)}</AppText>
        </View>
        <AppText variant="caption" color="muted">
          {formatLongDate(date)}
        </AppText>
      </View>

      {date !== today ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(today)}
          style={({ pressed }) => [styles.today, pressed ? styles.pressed : null]}
        >
          <AppText variant="caption" color="primary">
            TODAY
          </AppText>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next day"
        onPress={() => canGoForward && onChange(addDaysToKey(date, 1))}
        disabled={!canGoForward}
        style={({ pressed }) => [
          styles.arrow,
          !canGoForward ? styles.arrowDisabled : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <ChevronRight size={18} color={canGoForward ? colors.text : colors.textMuted} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  arrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  arrowDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.65,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  today: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
});
