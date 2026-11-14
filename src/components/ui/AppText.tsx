import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, typeScale } from '@/constants/theme';

type Variant = keyof typeof typeScale;

export type TextTone =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'primary'
  | 'danger'
  | 'warning'
  | 'white'
  | 'protein'
  | 'carbs'
  | 'fat';

const toneColor: Record<TextTone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  primary: colors.primary,
  danger: colors.danger,
  warning: colors.warning,
  white: colors.white,
  protein: colors.protein,
  carbs: colors.carbs,
  fat: colors.fat,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: TextTone;
  align?: TextStyle['textAlign'];
}

/** Typography primitive. Every string in the app flows through this component. */
export function AppText({
  variant = 'body',
  color = 'default',
  align,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[typeScale[variant], { color: toneColor[color] }, align ? { textAlign: align } : null, style]}
    />
  );
}
