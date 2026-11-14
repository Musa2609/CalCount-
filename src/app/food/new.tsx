import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Notice } from '@/components/Notice';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { useSubmit } from '@/hooks/useSubmit';
import { todayKey } from '@/lib/dates';
import { errorMessage } from '@/lib/utils';
import { parseNumericInput, validateCustomFood } from '@/lib/validation';

export default function NewCustomFoodScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const router = useRouter();
  const { backend, session, invalidate } = useApp();
  const { showToast } = useToast();
  const { submit, busy } = useSubmit();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [servingName, setServingName] = useState('1 serving');
  const [servingGrams, setServingGrams] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [sugar, setSugar] = useState('');
  const [sodium, setSodium] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSave = () => {
    if (!session) {
      setFormError('Your session expired. Please sign in again.');
      return;
    }
    const parsedServing = parseNumericInput(servingGrams);
    const parsedCalories = parseNumericInput(calories);
    const parsedProtein = parseNumericInput(protein);
    const parsedCarbs = parseNumericInput(carbs);
    const parsedFat = parseNumericInput(fat);

    const nextErrors = validateCustomFood({
      name,
      servingGrams: parsedServing,
      caloriesPer100g: parsedCalories,
      proteinPer100g: parsedProtein,
      carbsPer100g: parsedCarbs,
      fatPer100g: parsedFat,
    });
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length) return;
    if (
      parsedServing === null ||
      parsedCalories === null ||
      parsedProtein === null ||
      parsedCarbs === null ||
      parsedFat === null
    ) {
      return;
    }

    void submit(async () => {
      try {
        const food = await backend.createCustomFood(session.userId, {
          name,
          brand: brand.trim() || null,
          category: 'My foods',
          servingName: servingName.trim() || '1 serving',
          servingGrams: parsedServing,
          caloriesPer100g: parsedCalories,
          proteinPer100g: parsedProtein,
          carbsPer100g: parsedCarbs,
          fatPer100g: parsedFat,
          fiberPer100g: parseNumericInput(fiber),
          sugarPer100g: parseNumericInput(sugar),
          sodiumPer100g: parseNumericInput(sodium),
        });
        invalidate();
        showToast('Custom food created');
        router.replace({
          pathname: '/food/[id]',
          params: { id: food.id, meal: params.meal ?? 'lunch', date: params.date ?? todayKey() },
        });
      } catch (cause) {
        setFormError(errorMessage(cause, 'Could not save this food.'));
      }
    });
  };

  return (
    <Screen scroll keyboardAware contentStyle={styles.content} bottomInset={spacing.huge}>
      <AppHeader
        title="Custom food"
        subtitle="Use values from a nutrition label or your own recipe."
        showBack
      />

      <Notice
        tone="info"
        title="Per 100 g, not per serving"
        message="Labels often list values per 100 g. If yours lists per serving, divide by the serving weight and multiply by 100 — CalCount will scale it for you."
      />

      <Card style={styles.card}>
        <TextField
          label="Food name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Home-made paneer bhurji"
          maxLength={80}
          error={errors.name ?? null}
        />
        <TextField
          label="Brand (optional)"
          value={brand}
          onChangeText={setBrand}
          placeholder="e.g. Amul"
          maxLength={60}
        />
        <View style={styles.row}>
          <TextField
            label="Serving name"
            value={servingName}
            onChangeText={setServingName}
            placeholder="1 katori"
            containerStyle={styles.rowWide}
            maxLength={40}
          />
          <TextField
            label="Serving weight"
            value={servingGrams}
            onChangeText={setServingGrams}
            placeholder="150"
            keyboardType="decimal-pad"
            suffix="g"
            containerStyle={styles.rowNarrow}
            error={errors.servingGrams ?? null}
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <AppText variant="h3">Nutrition per 100 g</AppText>
        <TextField
          label="Calories"
          value={calories}
          onChangeText={setCalories}
          placeholder="e.g. 250"
          keyboardType="decimal-pad"
          suffix="kcal"
          error={errors.calories ?? null}
        />
        <View style={styles.row}>
          <TextField
            label="Protein"
            value={protein}
            onChangeText={setProtein}
            placeholder="0"
            keyboardType="decimal-pad"
            suffix="g"
            containerStyle={styles.rowThird}
            error={errors.protein ?? null}
          />
          <TextField
            label="Carbs"
            value={carbs}
            onChangeText={setCarbs}
            placeholder="0"
            keyboardType="decimal-pad"
            suffix="g"
            containerStyle={styles.rowThird}
            error={errors.carbs ?? null}
          />
          <TextField
            label="Fat"
            value={fat}
            onChangeText={setFat}
            placeholder="0"
            keyboardType="decimal-pad"
            suffix="g"
            containerStyle={styles.rowThird}
            error={errors.fat ?? null}
          />
        </View>
        <View style={styles.row}>
          <TextField
            label="Fibre (optional)"
            value={fiber}
            onChangeText={setFiber}
            keyboardType="decimal-pad"
            suffix="g"
            containerStyle={styles.rowThird}
          />
          <TextField
            label="Sugar (optional)"
            value={sugar}
            onChangeText={setSugar}
            keyboardType="decimal-pad"
            suffix="g"
            containerStyle={styles.rowThird}
          />
          <TextField
            label="Sodium (optional)"
            value={sodium}
            onChangeText={setSodium}
            keyboardType="decimal-pad"
            suffix="mg"
            containerStyle={styles.rowThird}
          />
        </View>
      </Card>

      {formError ? <Notice tone="danger" title="Could not save" message={formError} /> : null}

      <Button label="Save and log" onPress={handleSave} loading={busy} fullWidth />
      <AppText variant="caption" color="muted" align="center">
        Custom foods are private to your account and labelled as your own values.
      </AppText>
    </Screen>
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
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowWide: {
    flex: 1.2,
  },
  rowNarrow: {
    flex: 1,
  },
  rowThird: {
    flex: 1,
  },
});
