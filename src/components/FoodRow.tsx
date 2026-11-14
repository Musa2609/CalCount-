import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Plus } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { formatCalories } from '@/lib/utils';

export interface FoodRowProps {
  name: string;
  brand?: string | null;
  detail?: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  imageUrl?: string | null;
  onPress?: () => void;
  onAdd?: () => void;
  adding?: boolean;
  showAdd?: boolean;
  contextLabel?: string;
}

export function FoodRow({
  name,
  brand,
  detail,
  calories,
  protein,
  carbs,
  fat,
  imageUrl,
  onPress,
  onAdd,
  adding = false,
  showAdd = false,
  contextLabel,
}: FoodRowProps) {
  const macros = [
    protein !== undefined ? `${Math.round(protein)}P` : null,
    carbs !== undefined ? `${Math.round(carbs)}C` : null,
    fat !== undefined ? `${Math.round(fat)}F` : null,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${detail ? `, ${detail}` : ''}, ${formatCalories(calories)} calories`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <AppText variant="bodyMedium" color="primary">
            {name.charAt(0).toUpperCase()}
          </AppText>
        </View>
      )}

      <View style={styles.main}>
        <View style={styles.titleRow}>
          <AppText variant="bodyMedium" numberOfLines={2} style={styles.name}>
            {name}
          </AppText>
          {brand ? (
            <AppText variant="caption" color="muted" numberOfLines={1}>
              {brand}
            </AppText>
          ) : null}
        </View>
        <AppText variant="small" color="muted" numberOfLines={1}>
          {[detail, contextLabel].filter(Boolean).join(' · ') || '—'}
        </AppText>
        {macros.length ? (
          <AppText variant="caption" color="muted">
            {macros.join('  ·  ')}
          </AppText>
        ) : null}
      </View>

      <View style={styles.trailing}>
        <AppText variant="bodyMedium">{formatCalories(calories)}</AppText>
        <AppText variant="caption" color="muted">
          kcal
        </AppText>
      </View>

      {showAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${name}`}
          onPress={onAdd}
          disabled={adding}
          hitSlop={8}
          style={({ pressed }) => [styles.addButton, pressed ? styles.addPressed : null]}
        >
          {adding ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Plus size={18} color={colors.white} strokeWidth={2.6} />
          )}
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  thumb: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  main: {
    flex: 1,
    gap: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  name: {
    flexShrink: 1,
  },
  trailing: {
    alignItems: 'flex-end',
    minWidth: 40,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  addPressed: {
    backgroundColor: colors.primaryDark,
  },
});
