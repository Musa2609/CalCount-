import { StyleSheet, View } from 'react-native';
import { CircleCheck, CircleExclamationPoint, Info } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

const tones: Record<NoticeTone, { background: string; foreground: string; icon: typeof Info }> = {
  info: { background: colors.infoSoft, foreground: colors.info, icon: Info },
  warning: { background: colors.warningSoft, foreground: colors.warning, icon: CircleExclamationPoint },
  danger: { background: colors.dangerSoft, foreground: colors.danger, icon: CircleExclamationPoint },
  success: { background: colors.primarySoft, foreground: colors.primaryDark, icon: CircleCheck },
};

export function Notice({
  tone = 'info',
  title,
  message,
  children,
}: {
  tone?: NoticeTone;
  title?: string;
  message?: string;
  children?: React.ReactNode;
}) {
  const palette = tones[tone];
  const Icon = palette.icon;
  return (
    <View style={[styles.wrapper, { backgroundColor: palette.background }]}>
      <Icon size={16} color={palette.foreground} strokeWidth={2.2} style={styles.icon} />
      <View style={styles.body}>
        {title ? (
          <AppText variant="smallMedium" style={{ color: palette.foreground }}>
            {title}
          </AppText>
        ) : null}
        {message ? (
          <AppText variant="small" color="secondary">
            {message}
          </AppText>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  icon: {
    marginTop: 2,
  },
  body: {
    flex: 1,
    gap: 2,
  },
});
