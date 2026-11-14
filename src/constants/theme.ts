import { Platform } from 'react-native';

/**
 * CalCount design tokens.
 * A single source of truth for colour, type, spacing, radii and shadows.
 */
export const colors = {
  background: '#F5F8F4',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF4EE',
  surfaceStrong: '#E4EFE6',
  primary: '#0B7A55',
  primaryDark: '#075E41',
  primarySoft: '#E4F4EC',
  primaryTint: '#F0FAF4',
  accent: '#C7F0A9',
  text: '#14251C',
  textSecondary: '#50645A',
  textMuted: '#7C8F85',
  border: '#E3EAE4',
  borderStrong: '#CFDBD2',
  danger: '#C2413B',
  dangerSoft: '#FBECEA',
  warning: '#A86400',
  warningSoft: '#FFF4DF',
  info: '#2563A6',
  infoSoft: '#EAF2FB',
  protein: '#2F6FED',
  proteinSoft: '#E9EFFD',
  carbs: '#D98A0B',
  carbsSoft: '#FDF3E2',
  fat: '#C25487',
  fatSoft: '#FBEDF4',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(12, 32, 22, 0.45)',
  chartGrid: '#E8EEE9',
} as const;

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 26,
  pill: 999,
} as const;

export const shadow = Platform.select({
  web: {
    boxShadow: '0 8px 24px rgba(20, 55, 38, 0.06)',
  },
  default: {
    shadowColor: '#163A28',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
  },
});

export const shadowStrong = Platform.select({
  web: {
    boxShadow: '0 16px 40px rgba(20, 55, 38, 0.12)',
  },
  default: {
    shadowColor: '#163A28',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
});

export const typeScale = {
  display: { fontSize: 34, lineHeight: 40, fontFamily: fonts.extrabold, letterSpacing: -0.7 },
  h1: { fontSize: 26, lineHeight: 32, fontFamily: fonts.bold, letterSpacing: -0.4 },
  h2: { fontSize: 21, lineHeight: 27, fontFamily: fonts.bold, letterSpacing: -0.2 },
  h3: { fontSize: 17, lineHeight: 23, fontFamily: fonts.bold },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  bodyMedium: { fontSize: 15, lineHeight: 22, fontFamily: fonts.semibold },
  small: { fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  smallMedium: { fontSize: 13, lineHeight: 19, fontFamily: fonts.semibold },
  caption: { fontSize: 11, lineHeight: 15, fontFamily: fonts.semibold, letterSpacing: 0.2 },
  tab: { fontSize: 11, lineHeight: 14, fontFamily: fonts.semibold },
  button: { fontSize: 15, lineHeight: 20, fontFamily: fonts.bold },
  number: { fontSize: 30, lineHeight: 34, fontFamily: fonts.extrabold, letterSpacing: -0.8 },
} as const;

export const layout = {
  screenPadding: 20,
  tabBarHeight: 66,
  maxContentWidth: 720,
} as const;
