import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Minus, Plus, Trash as TrashIcon } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
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
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { useSubmit } from '@/hooks/useSubmit';
import { formatFriendlyDate } from '@/lib/dates';
import { nutrientsForQuantity } from '@/lib/nutrition';
import { errorMessage, formatCalories, formatGrams } from '@/lib/utils';
import { parseNumericInput, validateQuantity } from '@/lib/validation';
import { MEAL_TYPES, type FoodLog, type MealType } from '@/types/models';

export default function EditLogScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const logId = typeof params.id === 'string' ? params.id : '';
  const { backend, session } = useApp();

  const resource = useAsyncResource(
    () => (session ? backend.getFoodLog(session.userId, logId) : Promise.resolve(null)),
    [backend, session?.userId, logId],
    Boolean(session && logId),
  );
  const log = resource.data;

  return (
    <Screen scroll keyboardAware contentStyle={styles.content}>
      <AppHeader title="Edit entry" subtitle={log?.foodName} showBack />

      {resource.error ? <ErrorBlock message={resource.error} onRetry={resource.reload} /> : null}
      {resource.loading && !log ? <LoadingBlock /> : null}

      {log ? <EditLogForm key={log.id} log={log} /> : null}
    </Screen>
  );
}

function EditLogForm({ log }: { log: FoodLog }) {
  const router = useRouter();
  const { backend, invalidate } = useApp();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const { submit, busy } = useSubmit();

  const [grams, setGrams] = useState(String(log.quantityGrams));
  const [mealType, setMealType] = useState<MealType>(log.mealType);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const quantity = parseNumericInput(grams);
  const preview = nutrientsForQuantity(
    {
      caloriesPer100g: log.caloriesPer100g,
      proteinPer100g: log.proteinPer100g,
      carbsPer100g: log.carbsPer100g,
      fatPer100g: log.fatPer100g,
      fiberPer100g: log.fiberPer100g,
    },
    quantity ?? 0,
  );

  const stepQuantity = (delta: number) => {
    const current = quantity ?? 0;
    const next = Math.max(1, Math.round(current + delta));
    setGrams(String(next));
    setQuantityError(null);
  };

  const handleSave = () => {
    const error = validateQuantity(quantity);
    setQuantityError(error);
    if (error || quantity === null) return;
    void submit(async () => {
      try {
        await backend.updateFoodLog(log.userId, log.id, {
          quantityGrams: quantity,
          mealType,
        });
        invalidate();
        showToast('Entry updated');
        router.back();
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete this entry?',
      message: `${log.foodName} will be removed from your diary.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await submit(async () => {
      try {
        await backend.deleteFoodLog(log.userId, log.id);
        invalidate();
        showToast('Entry deleted', 'info');
        router.back();
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <AppText variant="h3">{log.foodName}</AppText>
            <AppText variant="small" color="muted">
              {[log.brand, formatFriendlyDate(log.logDate)].filter(Boolean).join(' · ')}
            </AppText>
          </View>
          <View style={styles.kcalBadge}>
            <AppText variant="h3" color="primary">
              {formatCalories(preview.calories)}
            </AppText>
            <AppText variant="caption" color="muted">
              KCAL
            </AppText>
          </View>
        </View>

        <View style={styles.quantityRow}>
          <Button
            label=""
            variant="secondary"
            size="sm"
            icon={Minus}
            accessibilityLabel="Decrease quantity"
            onPress={() => stepQuantity(-10)}
            style={styles.stepButton}
          />
          <TextField
            value={grams}
            onChangeText={(value) => {
              setGrams(value);
              if (quantityError) setQuantityError(null);
            }}
            keyboardType="decimal-pad"
            suffix="g"
            error={quantityError}
            containerStyle={styles.gramsInput}
            label="Quantity"
          />
          <Button
            label=""
            variant="secondary"
            size="sm"
            icon={Plus}
            accessibilityLabel="Increase quantity"
            onPress={() => stepQuantity(10)}
            style={styles.stepButton}
          />
        </View>

        <View style={styles.chipRow}>
          {log.servingGrams ? (
            <Chip
              label={`1 ${log.servingLabel ?? 'serving'} (${formatGrams(log.servingGrams)})`}
              onPress={() => setGrams(String(log.servingGrams))}
            />
          ) : null}
          <Chip label="100 g" onPress={() => setGrams('100')} />
          {[50, 150, 200].map((value) => (
            <Chip key={value} label={`${value} g`} onPress={() => setGrams(String(value))} />
          ))}
        </View>

        <View style={styles.macroRow}>
          <Macro label="Protein" value={preview.protein} color={colors.protein} />
          <Macro label="Carbs" value={preview.carbs} color={colors.carbs} />
          <Macro label="Fat" value={preview.fat} color={colors.fat} />
        </View>

        <AppText variant="caption" color="muted">
          {`${formatCalories(log.caloriesPer100g)} kcal per 100 g`}
        </AppText>
      </Card>

      <Card style={styles.card}>
        <AppText variant="smallMedium" color="secondary">
          Move to another meal
        </AppText>
        <View style={styles.chipRow}>
          {MEAL_TYPES.map((meal) => (
            <Chip
              key={meal}
              label={MEAL_LABELS[meal]}
              active={mealType === meal}
              onPress={() => setMealType(meal)}
            />
          ))}
        </View>
      </Card>

      <Button label="Save changes" onPress={handleSave} loading={busy} fullWidth />
      <Button
        label="Delete entry"
        variant="ghost"
        icon={TrashIcon}
        onPress={() => setSheetVisible(true)}
        fullWidth
      />

      <Sheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title="Delete entry?"
        subtitle="This only removes the diary entry, not the food itself."
      >
        <Button label="Yes, delete" variant="danger" onPress={handleDelete} loading={busy} fullWidth />
        <Button label="Keep it" variant="secondary" onPress={() => setSheetVisible(false)} fullWidth />
      </Sheet>
    </>
  );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macro}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <AppText variant="caption" color="muted">
        {label}
      </AppText>
      <AppText variant="bodyMedium">{`${Math.round(value * 10) / 10} g`}</AppText>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  kcalBadge: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primaryTint,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  macro: {
    flex: 1,
    gap: 1,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    marginBottom: 2,
  },
});
