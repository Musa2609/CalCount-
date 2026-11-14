import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Minus, Plus, Trash as TrashIcon } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { DataQualityBadge, DataQualityNote } from '@/components/DataQualityBadge';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ErrorBlock, LoadingBlock, Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { MEAL_LABELS } from '@/constants/nutrition';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { useLogFood } from '@/hooks/useLogFood';
import { useSubmit } from '@/hooks/useSubmit';
import { formatFriendlyDate, todayKey } from '@/lib/dates';
import { getCachedFood } from '@/lib/foodCache';
import { nutrientsForQuantity, round } from '@/lib/nutrition';
import { errorMessage, formatCalories, formatGrams } from '@/lib/utils';
import { parseNumericInput, validateQuantity } from '@/lib/validation';
import { MEAL_TYPES, type Food, type MealType } from '@/types/models';

export default function FoodDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string; meal?: string; date?: string }>();
  const foodId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { backend, session, invalidate } = useApp();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const { logFood } = useLogFood();
  const { submit, busy } = useSubmit();

  const cachedFood = getCachedFood(foodId);
  const [food, setFood] = useState<Food | null>(cachedFood);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [grams, setGrams] = useState(() => (cachedFood ? String(cachedFood.servingGrams) : '100'));
  const loading = Boolean(foodId) && !food && !notFound && !loadError;
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const date = typeof params.date === 'string' && params.date ? params.date : todayKey();
  const initialMeal = MEAL_TYPES.find((meal) => meal === params.meal) ?? 'lunch';
  const [mealType, setMealType] = useState<MealType>(initialMeal);

  useEffect(() => {
    if (!foodId || cachedFood || !session) return;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await backend.getFood(session.userId, foodId);
        if (cancelled) return;
        if (!next) {
          setNotFound(true);
          return;
        }
        setFood(next);
        setGrams(String(next.servingGrams));
      } catch (cause) {
        if (!cancelled) setLoadError(errorMessage(cause, 'Could not load this food.'));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [backend, cachedFood, foodId, session]);

  const quantity = parseNumericInput(grams) ?? 0;
  const nutrients = food ? nutrientsForQuantity(food, quantity) : null;
  const per100 = food ? nutrientsForQuantity(food, 100) : null;
  const activeServing = food?.servings.find((serving) => serving.grams === quantity) ?? null;

  const handleAdd = () => {
    if (!food) return;
    const error = validateQuantity(parseNumericInput(grams));
    setQuantityError(error);
    if (error) return;
    void submit(async () => {
      try {
        const log = await logFood({
          food,
          quantityGrams: quantity,
          mealType,
          logDate: date,
          servingLabel: activeServing?.label ?? food.servingName,
          servingGrams: activeServing?.grams ?? food.servingGrams,
        });
        showToast(`Added to ${MEAL_LABELS[mealType]} · ${formatCalories(log.calories)} kcal`);
        router.back();
      } catch (cause) {
        showToast(errorMessage(cause, 'Could not log this food.'), 'error');
      }
    });
  };

  const handleDeleteFood = async () => {
    if (!food || !session) return;
    const confirmed = await confirm({
      title: 'Delete this custom food?',
      message:
        'The food disappears from your library. Entries already in your diary keep their values.',
      confirmLabel: 'Delete food',
      danger: true,
    });
    if (!confirmed) return;
    await submit(async () => {
      try {
        await backend.deleteCustomFood(session.userId, food.id);
        invalidate();
        showToast('Custom food deleted', 'info');
        router.back();
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  const step = (delta: number) => {
    setGrams(String(Math.max(1, Math.round(quantity + delta))));
    setQuantityError(null);
  };

  return (
    <Screen scroll keyboardAware contentStyle={styles.content} bottomInset={spacing.huge}>
      <AppHeader
        title={food?.name ?? 'Food details'}
        subtitle={food?.brand ? `${food.brand} · ${food.category}` : food?.category}
        showBack
      />

      {!foodId ? (
        <ErrorBlock message="This food could not be found." onRetry={() => router.back()} />
      ) : null}
      {loadError ? <ErrorBlock message={loadError} onRetry={() => router.back()} /> : null}
      {notFound ? (
        <ErrorBlock message="This food is no longer available." onRetry={() => router.back()} />
      ) : null}
      {loading ? <LoadingBlock label="Loading nutrition…" /> : null}

      {food && nutrients && per100 ? (
        <>
          <Card style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <DataQualityBadge quality={food.dataQuality} />
                <AppText variant="small" color="muted">
                  {food.description ?? 'Nutrition per 100 g, scaled to your quantity.'}
                </AppText>
              </View>
              <View style={styles.kcalBlock}>
                <AppText variant="number" color="primary">
                  {formatCalories(nutrients.calories)}
                </AppText>
                <AppText variant="caption" color="muted">
                  KCAL
                </AppText>
              </View>
            </View>

            <View style={styles.macroRow}>
              <MacroPill label="Protein" value={nutrients.protein} color={colors.protein} />
              <MacroPill label="Carbs" value={nutrients.carbs} color={colors.carbs} />
              <MacroPill label="Fat" value={nutrients.fat} color={colors.fat} />
            </View>

            <View style={styles.quantityRow}>
              <Button
                label=""
                variant="secondary"
                size="sm"
                icon={Minus}
                accessibilityLabel="Decrease quantity"
                onPress={() => step(-10)}
                style={styles.stepButton}
              />
              <TextField
                label="Quantity"
                value={grams}
                onChangeText={(value) => {
                  setGrams(value);
                  if (quantityError) setQuantityError(null);
                }}
                keyboardType="decimal-pad"
                suffix="g"
                error={quantityError}
                containerStyle={styles.gramsInput}
              />
              <Button
                label=""
                variant="secondary"
                size="sm"
                icon={Plus}
                accessibilityLabel="Increase quantity"
                onPress={() => step(10)}
                style={styles.stepButton}
              />
            </View>

            <View style={styles.servingRow}>
              {food.servings.map((serving) => (
                <Chip
                  key={serving.id}
                  label={`${serving.label} · ${formatGrams(serving.grams)}`}
                  active={activeServing?.id === serving.id}
                  onPress={() => {
                    setGrams(String(serving.grams));
                    setQuantityError(null);
                  }}
                />
              ))}
            </View>

            <View style={styles.mealBlock}>
              <AppText variant="smallMedium" color="secondary">
                Add to
              </AppText>
              <View style={styles.servingRow}>
                {MEAL_TYPES.map((meal) => (
                  <Chip
                    key={meal}
                    label={MEAL_LABELS[meal]}
                    active={mealType === meal}
                    onPress={() => setMealType(meal)}
                  />
                ))}
              </View>
              <AppText variant="caption" color="muted">
                {formatFriendlyDate(date)}
              </AppText>
            </View>

            <Button
              label={`Add to ${MEAL_LABELS[mealType]} · ${formatCalories(nutrients.calories)} kcal`}
              onPress={handleAdd}
              loading={busy}
              fullWidth
            />
          </Card>

          <Card style={styles.card}>
            <AppText variant="h3">Nutrition</AppText>
            <View style={styles.tableHeader}>
              <AppText variant="caption" color="muted" style={styles.tableLabel}>
                VALUE
              </AppText>
              <AppText variant="caption" color="muted" style={styles.tableCell}>
                PER 100 G
              </AppText>
              <AppText variant="caption" color="muted" style={styles.tableCell}>
                {`FOR ${Math.round(quantity)} G`}
              </AppText>
            </View>
            <NutritionRow label="Calories" unit="kcal" per100={per100.calories} value={nutrients.calories} />
            <NutritionRow label="Protein" unit="g" per100={per100.protein} value={nutrients.protein} />
            <NutritionRow label="Carbs" unit="g" per100={per100.carbs} value={nutrients.carbs} />
            <NutritionRow label="Fat" unit="g" per100={per100.fat} value={nutrients.fat} />
            <NutritionRow label="Fibre" unit="g" per100={per100.fiber} value={nutrients.fiber} />
            {food.sugarPer100g !== null ? (
              <NutritionRow
                label="Sugar"
                unit="g"
                per100={food.sugarPer100g}
                value={round((food.sugarPer100g * quantity) / 100)}
              />
            ) : null}
            {food.sodiumPer100g !== null ? (
              <NutritionRow
                label="Sodium"
                unit="mg"
                per100={food.sodiumPer100g}
                value={round((food.sodiumPer100g * quantity) / 100)}
              />
            ) : null}
            <AppText variant="caption" color="muted">
              nutrient = (value per 100 g × grams) ÷ 100
            </AppText>
          </Card>

          <Card style={styles.card}>
            <View style={styles.sourceRow}>
              <AppText variant="smallMedium">Data source</AppText>
              <DataQualityBadge quality={food.dataQuality} />
            </View>
            <AppText variant="small" color="secondary">
              {food.source}
            </AppText>
            <DataQualityNote quality={food.dataQuality} />
            {food.sourceUrl ? (
              <AppText variant="caption" color="muted" numberOfLines={1}>
                {food.sourceUrl}
              </AppText>
            ) : null}
          </Card>

          {food.isCustom ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setDeleteVisible(true)}
              style={({ pressed }) => [styles.deleteRow, pressed ? styles.pressed : null]}
            >
              <TrashIcon size={16} color={colors.danger} strokeWidth={2} />
              <AppText variant="smallMedium" color="danger">
                Delete this custom food
              </AppText>
            </Pressable>
          ) : null}
        </>
      ) : null}

      <Sheet
        visible={deleteVisible}
        onClose={() => setDeleteVisible(false)}
        title="Delete custom food?"
        subtitle="Existing diary entries keep their stored nutrition values."
      >
        <Button label="Delete food" variant="danger" onPress={handleDeleteFood} loading={busy} fullWidth />
        <Button label="Cancel" variant="secondary" onPress={() => setDeleteVisible(false)} fullWidth />
      </Sheet>
    </Screen>
  );
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macroPill}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <AppText variant="caption" color="muted">
        {label}
      </AppText>
      <AppText variant="bodyMedium">{`${round(value)} g`}</AppText>
    </View>
  );
}

function NutritionRow({
  label,
  per100,
  value,
  unit,
}: {
  label: string;
  per100: number;
  value: number;
  unit: string;
}) {
  return (
    <View style={styles.tableRow}>
      <AppText variant="small" style={styles.tableLabel}>
        {label}
      </AppText>
      <AppText variant="small" color="secondary" style={styles.tableCell}>
        {`${round(per100)} ${unit}`}
      </AppText>
      <AppText variant="smallMedium" style={styles.tableCell}>
        {`${round(value)} ${unit}`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  card: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.sm,
  },
  kcalBlock: {
    alignItems: 'center',
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroPill: {
    flex: 1,
    gap: 2,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  macroDot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  stepButton: {
    width: 48,
    paddingHorizontal: 0,
  },
  gramsInput: {
    flex: 1,
  },
  servingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  mealBlock: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableLabel: {
    flex: 1.2,
  },
  tableCell: {
    flex: 1,
    textAlign: 'right',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
});
