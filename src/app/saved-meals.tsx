import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BookmarkPlus, Trash as TrashIcon } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/StateViews';
import { ErrorBlock, Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { MEAL_LABELS } from '@/constants/nutrition';
import { colors, radii, spacing } from '@/constants/theme';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { useSavedMeals } from '@/hooks/useSavedMeals';
import { useSubmit } from '@/hooks/useSubmit';
import { todayKey } from '@/lib/dates';
import { errorMessage, formatCalories, pluralise } from '@/lib/utils';
import { MEAL_TYPES, type MealType, type SavedMeal } from '@/types/models';

export default function SavedMealsScreen() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const { submit, busy } = useSubmit();
  const { savedMeals, loading, error, reload, applySavedMeal, deleteSavedMeal } = useSavedMeals();

  const [selected, setSelected] = useState<SavedMeal | null>(null);
  const [targetMeal, setTargetMeal] = useState<MealType>('breakfast');

  const openSheet = (meal: SavedMeal) => {
    setSelected(meal);
    setTargetMeal(meal.mealType);
  };

  const handleAdd = () => {
    if (!selected) return;
    void submit(async () => {
      try {
        await applySavedMeal(selected, targetMeal, todayKey());
        showToast(`Added to ${MEAL_LABELS[targetMeal]}`);
        setSelected(null);
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  const handleDelete = async (meal: SavedMeal) => {
    const confirmed = await confirm({
      title: 'Delete this template?',
      message: `${meal.name} will no longer appear in your saved meals. Diary entries stay untouched.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await submit(async () => {
      try {
        await deleteSavedMeal(meal.id);
        showToast('Template deleted', 'info');
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  return (
    <Screen scroll refreshing={loading && savedMeals.length > 0} onRefresh={reload}>
      <View style={styles.content}>
        <AppHeader
          title="Saved meals"
          subtitle="Reusable combinations you log in one tap."
          showBack
        />

        {error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {loading && savedMeals.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : null}

        {!loading && savedMeals.length === 0 ? (
          <Card>
            <EmptyState
              icon={BookmarkPlus}
              title="No templates yet"
              message="Open your diary, tap the menu on any meal and choose “Save as a meal template”."
              actionLabel="Open diary"
              onAction={() => router.navigate('/(tabs)/diary')}
            />
          </Card>
        ) : null}

        {savedMeals.map((meal) => (
          <Card key={meal.id} style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <AppText variant="h3">{meal.name}</AppText>
                <AppText variant="small" color="muted">
                  {`${MEAL_LABELS[meal.mealType]} · ${pluralise(meal.items.length, 'item')}`}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${meal.name}`}
                onPress={() => void handleDelete(meal)}
                hitSlop={8}
                style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
              >
                <TrashIcon size={16} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            </View>

            <View style={styles.macros}>
              <AppText variant="smallMedium">{`${formatCalories(meal.totals.calories)} kcal`}</AppText>
              <AppText variant="caption" color="muted">
                {`P ${Math.round(meal.totals.protein)}g · C ${Math.round(meal.totals.carbs)}g · F ${Math.round(
                  meal.totals.fat,
                )}g`}
              </AppText>
            </View>

            <View style={styles.items}>
              {meal.items.slice(0, 4).map((item) => (
                <AppText key={item.id} variant="caption" color="secondary" numberOfLines={1}>
                  {`• ${item.foodName} · ${Math.round(item.quantityGrams)} g`}
                </AppText>
              ))}
              {meal.items.length > 4 ? (
                <AppText variant="caption" color="muted">
                  {`+${meal.items.length - 4} more`}
                </AppText>
              ) : null}
            </View>

            <Button label="Add to diary" size="sm" variant="soft" onPress={() => openSheet(meal)} />
          </Card>
        ))}

        <AppText variant="caption" color="muted" align="center">
          Templates store a snapshot of each food, so later edits to a food never change past
          entries.
        </AppText>
      </View>

      <Sheet
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name}
        subtitle="Choose which meal to log this into today."
      >
        <View style={styles.sheetBody}>
          <View style={styles.chipRow}>
            {MEAL_TYPES.map((meal) => (
              <Chip
                key={meal}
                label={MEAL_LABELS[meal]}
                active={targetMeal === meal}
                onPress={() => setTargetMeal(meal)}
              />
            ))}
          </View>
          <AppText variant="small" color="muted">
            {selected
              ? `${formatCalories(selected.totals.calories)} kcal · ${pluralise(
                  selected.items.length,
                  'item',
                )}`
              : ''}
          </AppText>
          <Button label="Add to diary" onPress={handleAdd} loading={busy} fullWidth />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  loader: {
    marginTop: spacing.xl,
  },
  card: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
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
  macros: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  items: {
    gap: 2,
    paddingTop: spacing.xs,
  },
  sheetBody: {
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
