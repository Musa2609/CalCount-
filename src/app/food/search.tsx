import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, ChefHat, Leaf, ScanBarcode, Search, X } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { Notice } from '@/components/Notice';
import { FoodRow } from '@/components/FoodRow';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { ErrorBlock, LoadingBlock, Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { FOOD_CATEGORIES, MEAL_LABELS } from '@/constants/nutrition';
import { colors, radii, spacing } from '@/constants/theme';
import { useToast } from '@/context/ToastContext';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { useLogFood } from '@/hooks/useLogFood';
import { formatFriendlyDate, todayKey } from '@/lib/dates';
import { cacheFood } from '@/lib/foodCache';
import { nutrientsForQuantity } from '@/lib/nutrition';
import { appEnv } from '@/lib/env';
import {
  BARCODE_DISABLED_MESSAGE,
  barcodeFailureMessage,
  lookupOpenFoodFactsBarcode,
} from '@/lib/openfoodfacts';
import { errorMessage, formatCalories, formatGrams } from '@/lib/utils';
import { MEAL_TYPES, type Food, type MealType } from '@/types/models';

function defaultMealForNow(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snacks';
}

export default function FoodSearchScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const { logFood } = useLogFood();

  const parsedMeal = MEAL_TYPES.find((meal) => meal === params.meal) ?? defaultMealForNow();
  const date = typeof params.date === 'string' && params.date ? params.date : todayKey();

  const [mealType, setMealType] = useState<MealType>(parsedMeal);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [indianOnly, setIndianOnly] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [barcodeVisible, setBarcodeVisible] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  const addingRef = useRef(false);

  const {
    localFoods,
    remoteFoods,
    loading,
    searching,
    error,
    remoteLoading,
    remoteError,
    packagedSearchEnabled,
  } = useFoodSearch({ query, category, indianOnly });

  const quickAdd = async (food: Food) => {
    if (addingRef.current) return;
    addingRef.current = true;
    setPendingId(food.id);
    try {
      const log = await logFood({
        food,
        quantityGrams: food.servingGrams,
        mealType,
        logDate: date,
        servingLabel: food.servingName,
        servingGrams: food.servingGrams,
      });
      showToast(`Added ${food.name} · ${formatCalories(log.calories)} kcal`);
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      addingRef.current = false;
      setPendingId(null);
    }
  };

  const openDetails = (food: Food) => {
    cacheFood(food);
    router.push({
      pathname: '/food/[id]',
      params: { id: food.id, meal: mealType, date },
    });
  };

  const barcodeEnabled = appEnv.openFoodFactsEnabled;

  const requireBarcodeFeature = (open: () => void) => {
    if (!barcodeEnabled) {
      showToast(BARCODE_DISABLED_MESSAGE, 'error');
      return;
    }
    open();
  };

  const handleBarcodeLookup = async () => {
    const digits = barcode.replace(/\D/g, '');
    if (digits.length < 6) {
      setBarcodeError('Enter at least 6 digits from the barcode');
      return;
    }
    setBarcodeError(null);
    setBarcodeLoading(true);
    try {
      const outcome = await lookupOpenFoodFactsBarcode(digits);
      if (outcome.status !== 'found') {
        // "Not found", "offline" and "Open Food Facts is down" are distinct.
        setBarcodeError(barcodeFailureMessage(outcome));
        return;
      }
      cacheFood(outcome.food);
      setBarcodeVisible(false);
      setBarcode('');
      openDetails(outcome.food);
    } catch (cause) {
      setBarcodeError(errorMessage(cause, 'Barcode lookup is unavailable right now.'));
    } finally {
      setBarcodeLoading(false);
    }
  };

  const showEmptySearch = !loading && localFoods.length === 0 && !error;

  return (
    <Screen scroll contentStyle={styles.content} bottomInset={spacing.huge}>
      <AppHeader
        title="Add food"
        subtitle={`${MEAL_LABELS[mealType]} · ${formatFriendlyDate(date)}`}
        showBack
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log from a photo"
            onPress={() => router.push({ pathname: '/scan', params: { meal: mealType, date } })}
            style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}
          >
            <Camera size={19} color={colors.textSecondary} strokeWidth={2.2} />
          </Pressable>
        }
      />

      <View style={styles.mealRow}>
        {MEAL_TYPES.map((meal) => (
          <Chip
            key={meal}
            label={MEAL_LABELS[meal]}
            active={mealType === meal}
            onPress={() => setMealType(meal)}
            style={styles.mealChip}
          />
        ))}
      </View>

      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder="Search roti, dal, paneer, oats…"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        leading={<Search size={18} color={colors.textMuted} strokeWidth={2.2} />}
        trailing={
          query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              hitSlop={8}
            >
              <X size={16} color={colors.textMuted} strokeWidth={2.2} />
            </Pressable>
          ) : null
        }
      />

      <ChipRow>
        <Chip
          label="Indian foods"
          icon={Leaf}
          active={indianOnly}
          onPress={() => setIndianOnly((value) => !value)}
        />
        <Chip label="All categories" active={category === null} onPress={() => setCategory(null)} />
        {FOOD_CATEGORIES.map((item) => (
          <Chip
            key={item}
            label={item}
            active={category === item}
            onPress={() => setCategory(category === item ? null : item)}
          />
        ))}
      </ChipRow>

      {error ? <ErrorBlock message={error} onRetry={() => setQuery((value) => `${value} `)} /> : null}

      <Card padded={false} style={styles.resultsCard}>
        <View style={styles.resultsHeader}>
          <AppText variant="h3">{indianOnly ? 'Indian foods' : 'Food catalogue'}</AppText>
          {loading || searching ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <AppText variant="caption" color="muted">
              {`${localFoods.length} RESULTS`}
            </AppText>
          )}
        </View>

        {loading && localFoods.length === 0 ? (
          <LoadingBlock label="Searching foods…" compact />
        ) : showEmptySearch ? (
          <View style={styles.empty}>
            <AppText variant="smallMedium" align="center">
              No matches in the CalCount catalogue
            </AppText>
            <AppText variant="small" color="muted" align="center">
              Try a different name, clear the filters, or create a custom food with your own label
              values.
            </AppText>
            <Button
              label="Create a custom food"
              size="sm"
              variant="soft"
              icon={ChefHat}
              onPress={() =>
                router.push({ pathname: '/food/new', params: { meal: mealType, date } })
              }
            />
          </View>
        ) : (
          <View style={styles.list}>
            {localFoods.map((food) => {
              const perServing = nutrientsForQuantity(food, food.servingGrams);
              return (
                <FoodRow
                  key={food.id}
                  name={food.name}
                  brand={food.brand}
                  detail={`${food.servingName} · ${formatGrams(food.servingGrams)}`}
                  contextLabel={
                    food.isCustom ? 'Your food' : food.dataQuality === 'sourced' ? 'Sourced' : 'Estimated'
                  }
                  calories={perServing.calories}
                  protein={perServing.protein}
                  carbs={perServing.carbs}
                  fat={perServing.fat}
                  imageUrl={food.imageUrl}
                  onPress={() => openDetails(food)}
                  showAdd
                  onAdd={() => void quickAdd(food)}
                  adding={pendingId === food.id}
                />
              );
            })}
          </View>
        )}
      </Card>

      {packagedSearchEnabled && query.trim().length >= 2 ? (
        <Card padded={false} style={styles.resultsCard}>
          <View style={styles.resultsHeader}>
            <AppText variant="h3">Packaged foods</AppText>
            {remoteLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <AppText variant="caption" color="muted">
                OPEN FOOD FACTS
              </AppText>
            )}
          </View>
          {remoteFoods.length ? (
            <View style={styles.list}>
              {remoteFoods.map((food) => {
                const perServing = nutrientsForQuantity(food, food.servingGrams);
                return (
                  <FoodRow
                    key={food.id}
                    name={food.name}
                    brand={food.brand}
                    detail={`${food.servingName} · ${formatFoodServing(food)}`}
                    contextLabel="Check the label"
                    calories={perServing.calories}
                    protein={perServing.protein}
                    carbs={perServing.carbs}
                    fat={perServing.fat}
                    imageUrl={food.imageUrl}
                    onPress={() => openDetails(food)}
                    showAdd
                    onAdd={() => void quickAdd(food)}
                    adding={pendingId === food.id}
                  />
                );
              })}
            </View>
          ) : !remoteLoading ? (
            <View style={styles.empty}>
              <AppText variant="small" color="muted" align="center">
                {remoteError ?? 'No packaged products matched that search.'}
              </AppText>
            </View>
          ) : null}
          <View style={styles.attribution}>
            <AppText variant="caption" color="muted">
              Data from Open Food Facts contributors (ODbL). Packaged recipes change — always check
              the label before relying on a value.
            </AppText>
          </View>
        </Card>
      ) : null}

      {remoteError && remoteFoods.length > 0 ? (
        <Notice tone="warning" message={remoteError} />
      ) : null}

      <View style={styles.footerActions}>
        <Button
          label="Create a custom food"
          variant="secondary"
          icon={ChefHat}
          onPress={() => router.push({ pathname: '/food/new', params: { meal: mealType, date } })}
          fullWidth
        />
        <Button
          label="My recipes"
          variant="ghost"
          icon={ChefHat}
          onPress={() => router.push('/recipes' as any)}
          fullWidth
        />
        <View style={styles.barcodeRow}>
          <Button
            label="Look up a barcode"
            variant="ghost"
            icon={ScanBarcode}
            onPress={() => requireBarcodeFeature(() => setBarcodeVisible(true))}
            style={{ flex: 1 }}
          />
          <Button
            label="Scan with camera"
            variant="ghost"
            icon={Camera}
            onPress={() =>
              requireBarcodeFeature(() =>
                router.push({ pathname: '/barcode-scan', params: { meal: mealType, date } } as any),
              )
            }
            style={{ flex: 1 }}
          />
        </View>
      </View>

      <AppText variant="caption" color="muted" align="center">
        {`CalCount's catalogue shows whether each value is sourced or an estimate. Cooking method and portion size always affect the real number.`}
      </AppText>

      <Sheet
        visible={barcodeVisible}
        onClose={() => setBarcodeVisible(false)}
        title="Enter a barcode"
        subtitle="Looks up the packaged product on Open Food Facts."
      >
        <TextField
          label="Barcode number"
          value={barcode}
          onChangeText={(value) => {
            setBarcode(value);
            setBarcodeError(null);
          }}
          placeholder="e.g. 8901058000000"
          keyboardType="number-pad"
          maxLength={18}
          error={barcodeError}
          onSubmitEditing={handleBarcodeLookup}
        />
        <Button label="Look up product" onPress={handleBarcodeLookup} loading={barcodeLoading} fullWidth />
        <AppText variant="small" color="muted" align="center">
          {barcodeEnabled
            ? 'Use the camera button above, or type the number printed under the bars.'
            : BARCODE_DISABLED_MESSAGE}
        </AppText>
      </Sheet>
    </Screen>
  );
}

function formatFoodServing(food: Food): string {
  return food.servingGrams === 100 ? 'per 100 g' : formatGrams(food.servingGrams);
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.65,
  },
  mealRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  mealChip: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  resultsCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  list: {
    gap: 2,
  },
  empty: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  attribution: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  footerActions: {
    gap: spacing.sm,
  },
  barcodeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
