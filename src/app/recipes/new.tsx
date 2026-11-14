import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Search, Trash2, X } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { useToast } from '@/context/ToastContext';
import { useSubmit } from '@/hooks/useSubmit';
import { nutrientsForQuantity } from '@/lib/nutrition';
import { errorMessage, formatCalories } from '@/lib/utils';
import { parseNumericInput } from '@/lib/validation';
import type { Food } from '@/types/models';

interface IngredientRow {
  food: Food;
  quantityGrams: string;
}

export default function NewRecipeScreen() {
  const { session, backend } = useApp();
  const router = useRouter();
  const { showToast } = useToast();
  const { submit, busy } = useSubmit();

  const [name, setName] = useState('');
  const [servings, setServings] = useState('1');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);

  // Inline food search for adding ingredients
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [category] = useState<string | null>(null);
  const [indianOnly] = useState(false);

  const { localFoods, loading: searchLoading } = useFoodSearch({
    query: searchQuery,
    category,
    indianOnly,
  });

  const totalCalories = ingredients.reduce((total, row) => {
    const qty = parseNumericInput(row.quantityGrams) ?? 0;
    return total + nutrientsForQuantity(row.food, qty).calories;
  }, 0);

  const totalProtein = ingredients.reduce((total, row) => {
    const qty = parseNumericInput(row.quantityGrams) ?? 0;
    return total + nutrientsForQuantity(row.food, qty).protein;
  }, 0);

  const totalCarbs = ingredients.reduce((total, row) => {
    const qty = parseNumericInput(row.quantityGrams) ?? 0;
    return total + nutrientsForQuantity(row.food, qty).carbs;
  }, 0);

  const totalFat = ingredients.reduce((total, row) => {
    const qty = parseNumericInput(row.quantityGrams) ?? 0;
    return total + nutrientsForQuantity(row.food, qty).fat;
  }, 0);

  const servingsNum = Math.max(1, parseNumericInput(servings) ?? 1);

  const addIngredient = (food: Food) => {
    setIngredients((prev) => [
      ...prev,
      { food, quantityGrams: String(food.servingGrams) },
    ]);
    setSearchVisible(false);
    setSearchQuery('');
    showToast(`Added ${food.name}`);
  };

  const removeIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!name.trim()) {
      setNameError('Enter a recipe name');
      return;
    }
    if (!ingredients.length) {
      showToast('Add at least one ingredient', 'error');
      return;
    }
    if (!session) return;

    void submit(async () => {
      try {
        const recipe = await backend.createRecipe(session.userId, {
          name: name.trim(),
          servings: servingsNum,
          notes: notes.trim() || null,
          ingredients: ingredients.map((row) => {
            const qty = Math.max(1, parseNumericInput(row.quantityGrams) ?? row.food.servingGrams);
            return {
              foodId: row.food.id.startsWith('off-') ? null : row.food.id,
              customFoodId: row.food.isCustom ? row.food.id : null,
              foodName: row.food.name,
              brand: row.food.brand,
              quantityGrams: qty,
              servingLabel: row.food.servingName,
              servingGrams: row.food.servingGrams,
              caloriesPer100g: row.food.caloriesPer100g,
              proteinPer100g: row.food.proteinPer100g,
              carbsPer100g: row.food.carbsPer100g,
              fatPer100g: row.food.fatPer100g,
              fiberPer100g: row.food.fiberPer100g ?? 0,
              sugarPer100g: row.food.sugarPer100g ?? 0,
              sodiumPer100g: row.food.sodiumPer100g ?? 0,
              source: row.food.source,
              dataQuality: row.food.dataQuality,
            };
          }),
        });
        showToast(`Recipe "${recipe.name}" saved`);
        router.back();
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  return (
    <Screen scroll contentStyle={styles.content} bottomInset={spacing.huge}>
      <AppHeader title="New recipe" subtitle="Build a recipe from foods in your catalogue." showBack />

      <Card style={styles.card}>
        <TextField
          label="Recipe name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (nameError) setNameError(null);
          }}
          placeholder="e.g. My protein shake"
          error={nameError}
        />
        <TextField
          label="Number of servings"
          value={servings}
          onChangeText={setServings}
          keyboardType="number-pad"
          placeholder="1"
        />
        <TextField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Preparation notes"
        />
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <AppText variant="h3">Ingredients</AppText>
          <AppText variant="caption" color="muted">
            {ingredients.length} item{ingredients.length === 1 ? '' : 's'}
          </AppText>
        </View>

        {ingredients.map((row, index) => (
          <View key={`${row.food.id}-${index}`} style={styles.ingredientRow}>
            <View style={styles.ingredientInfo}>
              <AppText variant="bodyMedium">{row.food.name}</AppText>
              <AppText variant="caption" color="muted">
                {formatCalories(nutrientsForQuantity(row.food, parseNumericInput(row.quantityGrams) ?? 0).calories)} kcal
              </AppText>
            </View>
            <TextField
              value={row.quantityGrams}
              onChangeText={(value) =>
                setIngredients((prev) =>
                  prev.map((r, i) => (i === index ? { ...r, quantityGrams: value } : r)),
                )
              }
              keyboardType="decimal-pad"
              suffix="g"
              compact
              containerStyle={styles.qtyField}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${row.food.name}`}
              onPress={() => removeIngredient(index)}
              hitSlop={8}
              style={styles.removeButton}
            >
              <Trash2 size={16} color={colors.textMuted} strokeWidth={2} />
            </Pressable>
          </View>
        ))}

        {!searchVisible ? (
          <Button
            label="Add ingredient"
            variant="secondary"
            icon={Plus}
            onPress={() => setSearchVisible(true)}
            fullWidth
          />
        ) : (
          <View style={styles.searchSection}>
            <View style={styles.searchHeader}>
              <AppText variant="smallMedium" color="secondary">
                Search for an ingredient
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close search"
                onPress={() => {
                  setSearchVisible(false);
                  setSearchQuery('');
                }}
                hitSlop={8}
              >
                <X size={18} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            </View>
            <TextField
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search roti, dal, paneer, oats…"
              autoCorrect={false}
              autoCapitalize="none"
              leading={<Search size={18} color={colors.textMuted} strokeWidth={2.2} />}
            />
            <View style={styles.searchResults}>
              {searchLoading ? (
                <AppText variant="small" color="muted" align="center">
                  Searching…
                </AppText>
              ) : localFoods.length === 0 ? (
                <AppText variant="small" color="muted" align="center">
                  {searchQuery.trim().length < 2
                    ? 'Type at least 2 characters to search'
                    : 'No foods found. Try a different name.'}
                </AppText>
              ) : (
                localFoods.slice(0, 20).map((food) => (
                  <Pressable
                    key={food.id}
                    onPress={() => addIngredient(food)}
                    style={({ pressed }) => [styles.searchResult, pressed ? styles.pressed : null]}
                  >
                    <View style={styles.searchResultInfo}>
                      <AppText variant="bodyMedium">{food.name}</AppText>
                      <AppText variant="caption" color="muted">
                        {food.brand ? `${food.brand} · ` : ''}
                        {Math.round(food.caloriesPer100g)} kcal/100g
                      </AppText>
                    </View>
                    <Plus size={18} color={colors.primary} strokeWidth={2} />
                  </Pressable>
                ))
              )}
            </View>
          </View>
        )}
      </Card>

      {ingredients.length > 0 ? (
        <Card style={styles.card}>
          <View style={styles.totalsRow}>
            <AppText variant="h3">Total</AppText>
            <AppText variant="h3" color="primary">
              {formatCalories(totalCalories)} kcal
            </AppText>
          </View>
          <AppText variant="caption" color="muted">
            Protein {Math.round(totalProtein)}g · Carbs {Math.round(totalCarbs)}g · Fat {Math.round(totalFat)}g
          </AppText>
          <View style={styles.totalsRow}>
            <AppText variant="bodyMedium">Per serving ({servingsNum})</AppText>
            <AppText variant="bodyMedium" color="primary">
              {formatCalories(Math.round(totalCalories / servingsNum))} kcal
            </AppText>
          </View>
        </Card>
      ) : null}

      <Button label="Save recipe" onPress={handleSave} loading={busy} fullWidth />
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ingredientInfo: {
    flex: 1,
    gap: 2,
  },
  qtyField: {
    width: 90,
  },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSection: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchResults: {
    gap: spacing.xs,
    maxHeight: 300,
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
  },
  searchResultInfo: {
    flex: 1,
    gap: 2,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.65,
  },
});