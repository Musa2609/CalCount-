import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, ChefHat } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { formatCalories } from '@/lib/utils';

export default function RecipesScreen() {
  const { session, backend } = useApp();
  const router = useRouter();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await backend.listRecipes(session.userId);
        if (!cancelled) setRecipes(r);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, backend]);

  return (
    <Screen scroll contentStyle={styles.content} bottomInset={spacing.huge}>
      <AppHeader
        title="Recipes"
        subtitle="Build and log your own recipes."
        showBack
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New recipe"
            onPress={() => router.push('/recipes/new' as any)}
            style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}
          >
            <Plus size={19} color={colors.textSecondary} strokeWidth={2.2} />
          </Pressable>
        }
      />

      {recipes.length === 0 && !loading ? (
        <Card style={styles.emptyCard}>
          <ChefHat size={32} color={colors.textMuted} strokeWidth={1.5} />
          <AppText variant="bodyMedium" align="center">
            No recipes yet
          </AppText>
          <AppText variant="small" color="muted" align="center">
            Create a recipe to log a homemade meal in one tap.
          </AppText>
          <Button
            label="Create a recipe"
            onPress={() => router.push('/recipes/new' as any)}
            fullWidth
          />
        </Card>
      ) : (
        <View style={styles.list}>
          {recipes.map((recipe) => (
            <Pressable
              key={recipe.id}
              onPress={() => router.push(`/recipes/${recipe.id}` as any)}
              style={({ pressed }) => [styles.recipeCard, pressed ? styles.pressed : null]}
            >
              <View style={styles.recipeInfo}>
                <AppText variant="bodyMedium">{recipe.name}</AppText>
                <AppText variant="caption" color="muted">
                  {recipe.servings} serving{recipe.servings === 1 ? '' : 's'} · {recipe.ingredients?.length ?? 0} ingredients
                </AppText>
              </View>
              <AppText variant="h3" color="primary">
                {formatCalories(recipe.perServingCalories)} kcal
              </AppText>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
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
  emptyCard: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  list: {
    gap: spacing.sm,
  },
  recipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  recipeInfo: {
    flex: 1,
    gap: 2,
  },
});