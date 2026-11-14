import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck, Info, TriangleExclamationPoint } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, shadowStrong, spacing } from '@/constants/theme';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(-12));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -8, duration: 180, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), message, variant });
      opacity.setValue(0);
      translateY.setValue(-12);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(hide, 2800);
    },
    [hide, opacity, translateY],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const iconColor =
    toast?.variant === 'error'
      ? colors.danger
      : toast?.variant === 'info'
        ? colors.info
        : colors.primary;
  const Icon =
    toast?.variant === 'error'
      ? TriangleExclamationPoint
      : toast?.variant === 'info'
        ? Info
        : CircleCheck;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrapper,
            {
              top: insets.top + spacing.sm,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.toast, Platform.OS === 'web' ? styles.toastWeb : null]}>
            <Icon size={18} color={iconColor} strokeWidth={2.2} />
            <AppText
              variant="smallMedium"
              style={styles.message}
              numberOfLines={3}
            >
              {toast.message}
            </AppText>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 1000,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 560,
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadowStrong,
  },
  toastWeb: {
    boxShadow: '0 12px 32px rgba(20, 55, 38, 0.16)',
  },
  message: {
    flex: 1,
    color: colors.text,
  },
});
