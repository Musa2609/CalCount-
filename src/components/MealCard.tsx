import { Pressable, StyleSheet, View } from 'react-native';
import { Ellipsis, Plus, Trash as TrashIcon } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MEAL_LABELS } from '@/constants/nutrition';
import { colors, radii, spacing } from '@/constants/theme';
import { formatCalories, formatGrams, MEAL_COLORS, MEAL_SOFT_COLORS } from '@/lib/utils';
import type { FoodLog, MealSection } from '@/types/models';

export function MealCard({
  section,
  onAdd,
  onOpenActions,
  onPressLog,
  onDeleteLog,
}: {
  section: MealSection;
  onAdd: () => void;
  onOpenActions: () => void;
  onPressLog: (log: FoodLog) => void;
  onDeleteLog: (log: FoodLog) => void;
}) {
  const tone = MEAL_COLORS[section.mealType];
  const soft = MEAL_SOFT_COLORS[section.mealType];
  const { totals, logs } = section;

  return (
    <Card padded={false} style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: soft }]}>
          <View style={[styles.dotInner, { backgroundColor: tone }]} />
        </View>
        <View style={styles.headerText}>
          <AppText variant="h3">{MEAL_LABELS[section.mealType]}</AppText>
          <AppText variant="small" color="muted">
            {logs.length === 0
              ? 'Nothing logged yet'
              : `${logs.length} ${logs.length === 1 ? 'item' : 'items'} · ${formatCalories(
                  totals.calories,
                )} kcal`}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${MEAL_LABELS[section.mealType]} options`}
          onPress={onOpenActions}
          hitSlop={8}
          style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
        >
          <Ellipsis size={18} color={colors.textSecondary} strokeWidth={2.4} />
        </Pressable>
      </View>

      {logs.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAdd}
          style={({ pressed }) => [styles.emptyRow, { backgroundColor: soft }, pressed ? styles.pressed : null]}
        >
          <Plus size={16} color={tone} strokeWidth={2.4} />
          <AppText variant="smallMedium" color="secondary">
            Add {MEAL_LABELS[section.mealType].toLowerCase()}
          </AppText>
        </Pressable>
      ) : (
        <View style={styles.list}>
          {logs.map((log) => (
            <Pressable
              key={log.id}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${log.foodName}`}
              onPress={() => onPressLog(log)}
              style={({ pressed }) => [styles.logRow, pressed ? styles.logPressed : null]}
            >
              <View style={styles.logMain}>
                <AppText variant="bodyMedium" numberOfLines={1}>
                  {log.foodName}
                </AppText>
                <AppText variant="caption" color="muted" numberOfLines={1}>
                  {[
                    log.servingLabel,
                    formatGrams(log.quantityGrams),
                    `${Math.round(log.protein)}P · ${Math.round(log.carbs)}C · ${Math.round(log.fat)}F`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>
              </View>
              <AppText variant="smallMedium">{formatCalories(log.calories)}</AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${log.foodName}`}
                onPress={() => onDeleteLog(log)}
                hitSlop={8}
                style={({ pressed }) => [styles.deleteButton, pressed ? styles.pressed : null]}
              >
                <TrashIcon size={15} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      {logs.length > 0 ? (
        <View style={styles.footer}>
          <AppText variant="caption" color="muted">
            {`P ${Math.round(totals.protein)}g · C ${Math.round(totals.carbs)}g · F ${Math.round(
              totals.fat,
            )}g`}
          </AppText>
          <Button label="Add food" size="sm" variant="soft" icon={Plus} onPress={onAdd} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  iconButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: {
    opacity: 0.65,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  list: {
    gap: 2,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
  logPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  logMain: {
    flex: 1,
    gap: 1,
  },
  deleteButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
});
