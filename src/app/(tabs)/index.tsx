import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, Plus, Target } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { CalorieRing } from '@/components/ui/CalorieRing';
import { Card } from '@/components/ui/Card';
import { MacroProgressRow } from '@/components/ui/ProgressBar';
import { Content, ErrorBlock, LoadingBlock, Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/StateViews';
import { MEAL_LABELS } from '@/constants/nutrition';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useDiary } from '@/hooks/useDiary';
import { useGoals } from '@/hooks/useGoals';
import { formatLongDate, todayKey } from '@/lib/dates';
import { EMPTY_NUTRIENTS } from '@/lib/nutrition';
import {
  firstName,
  formatCalories,
  initials,
  MEAL_COLORS,
  MEAL_SOFT_COLORS,
  pluralise,
} from '@/lib/utils';
import type { MealSection, MealType } from '@/types/models';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useApp();
  const today = todayKey();
  const { diary, loading, error, reload } = useDiary(today);
  const { targets } = useGoals(today);

  const totals = diary?.totals ?? EMPTY_NUTRIENTS;
  const calorieGoal = targets.calorieTarget || profile?.calorieTarget || 0;
  const remaining = calorieGoal - totals.calories;
  const hasLogs = (diary?.meals ?? []).some((meal) => meal.logs.length > 0);
  const showLoading = loading && !diary;

  return (
    <Screen
      refreshing={loading && Boolean(diary)}
      onRefresh={reload}
      contentStyle={styles.content}
    >
      <Content style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText variant="caption" color="muted">
              {formatLongDate(today).toUpperCase()}
            </AppText>
            <AppText variant="h1">
              {greeting()}, {firstName(profile?.name)}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => router.navigate('/(tabs)/settings')}
            style={({ pressed }) => [styles.avatar, pressed ? styles.pressed : null]}
          >
            <AppText variant="bodyMedium" color="primary">
              {initials(profile?.name)}
            </AppText>
          </Pressable>
        </View>

        {error ? <ErrorBlock message={error} onRetry={reload} /> : null}

        {showLoading ? (
          <LoadingBlock label="Loading today's diary…" />
        ) : (
          <>
            <Card style={styles.ringCard}>
              <View style={styles.ringHeader}>
                <View>
                  <AppText variant="caption" color="muted">
                    DAILY CALORIE GOAL
                  </AppText>
                  <AppText variant="h2">{formatCalories(calorieGoal)} kcal</AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit targets"
                  onPress={() => router.push('/targets')}
                  style={({ pressed }) => [styles.targetButton, pressed ? styles.pressed : null]}
                >
                  <Target size={14} color={colors.primary} strokeWidth={2.2} />
                  <AppText variant="caption" color="primary">
                    TARGETS
                  </AppText>
                </Pressable>
              </View>

              <View style={styles.ringWrap}>
                <CalorieRing consumed={totals.calories} target={calorieGoal}>
                  <View style={styles.ringCenter}>
                    <AppText
                      variant="display"
                      color={remaining < 0 ? 'danger' : 'default'}
                    >
                      {formatCalories(Math.abs(remaining))}
                    </AppText>
                    <AppText variant="caption" color="muted">
                      {remaining < 0 ? 'KCAL OVER' : 'KCAL REMAINING'}
                    </AppText>
                    <AppText variant="small" color="secondary">
                      {`${formatCalories(totals.calories)} eaten`}
                    </AppText>
                  </View>
                </CalorieRing>
              </View>

              <View style={styles.tiles}>
                <Tile label="Goal" value={formatCalories(calorieGoal)} unit="kcal" />
                <View style={styles.divider} />
                <Tile label="Consumed" value={formatCalories(totals.calories)} unit="kcal" />
                <View style={styles.divider} />
                <Tile
                  label={remaining < 0 ? 'Over' : 'Remaining'}
                  value={formatCalories(Math.abs(remaining))}
                  unit="kcal"
                  tone={remaining < 0 ? 'danger' : 'primary'}
                />
              </View>
            </Card>

            <Card style={styles.macroCard}>
              <SectionHeader title="Macros" actionLabel="Edit targets" onAction={() => router.push('/targets')} />
              <View style={styles.macroRows}>
                <MacroProgressRow
                  label="Protein"
                  value={totals.protein}
                  target={targets.proteinTargetG}
                  color={colors.protein}
                />
                <MacroProgressRow
                  label="Carbs"
                  value={totals.carbs}
                  target={targets.carbsTargetG}
                  color={colors.carbs}
                />
                <MacroProgressRow
                  label="Fat"
                  value={totals.fat}
                  target={targets.fatTargetG}
                  color={colors.fat}
                />
              </View>
            </Card>

            <Card style={styles.mealsCard}>
              <SectionHeader
                title="Today's meals"
                actionLabel="Open diary"
                onAction={() => router.navigate('/(tabs)/diary')}
              />
              <View>
                {(diary?.meals ?? []).map((section) => (
                  <MealSummaryRow
                    key={section.mealType}
                    section={section}
                    onAdd={() =>
                      router.push({
                        pathname: '/food/search',
                        params: { meal: section.mealType, date: today },
                      })
                    }
                    onOpen={() => router.navigate('/(tabs)/diary')}
                  />
                ))}
              </View>
              {!hasLogs ? (
                <AppText variant="small" color="muted">
                  Nothing logged yet today. Add your first food to start tracking.
                </AppText>
              ) : null}
            </Card>

            <Button
              label="Add food"
              size="lg"
              icon={Plus}
              fullWidth
              onPress={() => router.push({ pathname: '/food/search', params: { date: today } })}
            />

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/scan')}
              style={({ pressed }) => [styles.scanRow, pressed ? styles.pressed : null]}
            >
              <Camera size={16} color={colors.textSecondary} strokeWidth={2.2} />
              <AppText variant="small" color="secondary">
                Log from a photo
              </AppText>
              <AppText variant="caption" color="muted">
                BETA
              </AppText>
            </Pressable>

            <AppText variant="caption" color="muted" align="center">
              Values come from your logged foods. Tap any entry to see its source and adjust
              quantity.
            </AppText>
          </>
        )}
      </Content>
    </Screen>
  );
}

function Tile({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string;
  unit: string;
  tone?: 'default' | 'primary' | 'danger';
}) {
  const color =
    tone === 'primary' ? colors.primary : tone === 'danger' ? colors.danger : colors.text;
  return (
    <View style={styles.tile}>
      <AppText variant="caption" color="muted">
        {label.toUpperCase()}
      </AppText>
      <AppText variant="h3" style={{ color }}>
        {value}
      </AppText>
      <AppText variant="caption" color="muted">
        {unit}
      </AppText>
    </View>
  );
}

function MealSummaryRow({
  section,
  onAdd,
  onOpen,
}: {
  section: MealSection;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const mealType = section.mealType as MealType;
  const count = section.logs.length;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [styles.mealRow, pressed ? styles.mealRowPressed : null]}
    >
      <View style={[styles.mealDot, { backgroundColor: MEAL_SOFT_COLORS[mealType] }]}>
        <View style={[styles.mealDotInner, { backgroundColor: MEAL_COLORS[mealType] }]} />
      </View>
      <View style={styles.mealText}>
        <AppText variant="bodyMedium">{MEAL_LABELS[mealType]}</AppText>
        <AppText variant="caption" color="muted">
          {count === 0 ? 'No items' : pluralise(count, 'item')}
        </AppText>
      </View>
      <AppText variant="smallMedium" color={count ? 'default' : 'muted'}>
        {count ? `${formatCalories(section.totals.calories)} kcal` : '—'}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add food to ${MEAL_LABELS[mealType]}`}
        onPress={onAdd}
        hitSlop={8}
        style={({ pressed }) => [styles.mealAdd, pressed ? styles.pressed : null]}
      >
        <Plus size={16} color={colors.primary} strokeWidth={2.6} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceStrong,
  },
  pressed: {
    opacity: 0.7,
  },
  ringCard: {
    gap: spacing.md,
  },
  ringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  targetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryTint,
  },
  ringWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  ringCenter: {
    alignItems: 'center',
    gap: 2,
  },
  tiles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: colors.border,
  },
  macroCard: {
    gap: spacing.md,
  },
  macroRows: {
    gap: spacing.md,
  },
  mealsCard: {
    gap: spacing.sm,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  mealRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  mealDot: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealDotInner: {
    width: 9,
    height: 9,
    borderRadius: radii.pill,
  },
  mealText: {
    flex: 1,
    gap: 1,
  },
  mealAdd: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
});
