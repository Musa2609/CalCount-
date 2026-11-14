import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { colors, radii, spacing } from '@/constants/theme';

export function EmptyState({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.iconWrap}>
        <Icon size={22} color={colors.primary} strokeWidth={2} />
      </View>
      <View style={styles.text}>
        <AppText variant="h3" align="center">
          {title}
        </AppText>
        <AppText variant="small" color="secondary" align="center">
          {message}
        </AppText>
      </View>
      {actionLabel && onAction ? (
        <Button label={actionLabel} size="sm" onPress={onAction} />
      ) : null}
    </View>
  );
}

export function StatTile({
  label,
  value,
  unit,
  tone = 'default',
  style,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'default' | 'primary' | 'warning';
  style?: object;
}) {
  const color = tone === 'primary' ? colors.primary : tone === 'warning' ? colors.warning : colors.text;
  return (
    <View style={[styles.tile, style]}>
      <AppText variant="caption" color="muted">
        {label.toUpperCase()}
      </AppText>
      <View style={styles.valueRow}>
        <AppText variant="h2" style={{ color }}>
          {value}
        </AppText>
        {unit ? (
          <AppText variant="small" color="muted" style={styles.unit}>
            {unit}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="h3">{title}</AppText>
      {actionLabel && onAction ? (
        <AppText variant="smallMedium" color="primary" onPress={onAction} suppressHighlighting>
          {actionLabel}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  text: {
    gap: spacing.xs,
    alignItems: 'center',
  },
  tile: {
    flex: 1,
    gap: spacing.xxs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
  },
  unit: {
    marginBottom: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
