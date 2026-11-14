import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import type { PropsWithChildren, ReactNode } from 'react';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { colors, layout, radii, spacing } from '@/constants/theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  keyboardAware?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra bottom padding, e.g. to clear a sticky action bar. */
  bottomInset?: number;
}

/**
 * Screen frame: safe area, background and (optionally) a scroll container.
 * Keeps every screen visually aligned without repeating boilerplate.
 */
export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
  contentStyle,
  keyboardAware = false,
  refreshing = false,
  onRefresh,
  bottomInset = spacing.xxxl,
}: ScreenProps) {
  const inner = (
    <>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            padded ? styles.padded : styles.flush,
            { paddingBottom: bottomInset },
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, padded ? styles.padded : styles.flush, contentStyle]}>{children}</View>
      )}
    </>
  );

  return (
    <SafeAreaView edges={edges} style={styles.safe}>
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={12}
        >
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function LoadingBlock({ label = 'Loading…', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <View style={[styles.state, compact ? styles.stateCompact : null]}>
      <ActivityIndicator color={colors.primary} />
      <AppText variant="small" color="muted">
        {label}
      </AppText>
    </View>
  );
}

export function ErrorBlock({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.state, styles.error, compact ? styles.stateCompact : null]}>
      <AppText variant="smallMedium" color="danger" align="center">
        {message}
      </AppText>
      {onRetry ? <Button label="Try again" size="sm" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** Centered content region that respects the shared max content width. */
export function Content({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.contentWidth, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  padded: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  flush: {
    paddingHorizontal: 0,
  },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.huge,
  },
  stateCompact: {
    paddingVertical: spacing.xl,
  },
  error: {
    gap: spacing.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.dangerSoft,
  },
  contentWidth: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    gap: spacing.lg,
  },
});
