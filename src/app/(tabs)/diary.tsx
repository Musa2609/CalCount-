import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BookmarkPlus, Copy, Plus, Trash as TrashIcon } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { DateNavigator } from '@/components/DateNavigator';
import { MealCard } from '@/components/MealCard';
import { PromptModal } from '@/components/PromptModal';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Content, ErrorBlock, LoadingBlock, Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { MEAL_LABELS } from '@/constants/nutrition';
import { colors, radii, spacing } from '@/constants/theme';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { useDiary } from '@/hooks/useDiary';
import { useGoals } from '@/hooks/useGoals';
import { useSubmit } from '@/hooks/useSubmit';
import { todayKey } from '@/lib/dates';
import { formatCalories, formatGrams, MEAL_COLORS, MEAL_SOFT_COLORS, errorMessage } from '@/lib/utils';
import { MEAL_TYPES, type FoodLog, type MealType } from '@/types/models';

export default function DiaryScreen() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const { submit, busy } = useSubmit();

  const [date, setDate] = useState(todayKey());
  const { diary, loading, error, reload, deleteLog, copyMeal, copyMealFromYesterday, saveMeal } =
    useDiary(date);
  const { targets } = useGoals(date);

  const [actionsMeal, setActionsMeal] = useState<MealType | null>(null);
  const [saveMealFor, setSaveMealFor] = useState<MealType | null>(null);

  const sections = diary?.meals ?? [];
  const totals = diary?.totals;

  const handleDeleteLog = async (log: FoodLog) => {
    const confirmed = await confirm({
      title: 'Delete this entry?',
      message: `${log.foodName} (${formatGrams(log.quantityGrams)}) will be removed from ${
        MEAL_LABELS[log.mealType]
      }.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await submit(async () => {
      try {
        await deleteLog(log.id);
        showToast('Entry deleted', 'info');
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  const handleCopyTo = (target: MealType) => {
    if (!actionsMeal) return;
    void submit(async () => {
      try {
        await copyMeal(actionsMeal, target);
        showToast(`Copied ${MEAL_LABELS[actionsMeal]} to ${MEAL_LABELS[target]}`);
        setActionsMeal(null);
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  const handleCopyYesterday = () => {
    if (!actionsMeal) return;
    void submit(async () => {
      try {
        await copyMealFromYesterday(actionsMeal);
        showToast(`Added yesterday's ${MEAL_LABELS[actionsMeal].toLowerCase()}`);
        setActionsMeal(null);
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  const handleClearMeal = async () => {
    if (!actionsMeal) return;
    const section = sections.find((meal) => meal.mealType === actionsMeal);
    if (!section?.logs.length) return;
    const confirmed = await confirm({
      title: `Clear ${MEAL_LABELS[actionsMeal]}?`,
      message: `This removes ${section.logs.length} ${
        section.logs.length === 1 ? 'entry' : 'entries'
      }. It cannot be undone.`,
      confirmLabel: 'Clear meal',
      danger: true,
    });
    if (!confirmed) return;
    await submit(async () => {
      try {
        for (const log of section.logs) {
          await deleteLog(log.id);
        }
        showToast('Meal cleared', 'info');
        setActionsMeal(null);
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  const activeLogs = actionsMeal
    ? sections.find((meal) => meal.mealType === actionsMeal)?.logs.length ?? 0
    : 0;

  return (
    <Screen refreshing={loading && Boolean(diary)} onRefresh={reload}>
      <Content style={styles.content}>
        <AppHeader
          title="Food diary"
          subtitle="Edit quantities, repeat meals or save a template."
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Saved meals"
              onPress={() => router.push('/saved-meals')}
              style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}
            >
              <BookmarkPlus size={19} color={colors.textSecondary} strokeWidth={2.2} />
            </Pressable>
          }
        />

        <DateNavigator date={date} onChange={setDate} />

        {error ? <ErrorBlock message={error} onRetry={reload} /> : null}

        {loading && !diary ? (
          <LoadingBlock label="Loading your diary…" />
        ) : (
          <>
            <Card style={styles.summary}>
              <View style={styles.summaryRow}>
                <SummaryStat label="Goal" value={formatCalories(targets.calorieTarget)} />
                <SummaryStat
                  label="Consumed"
                  value={formatCalories(totals?.calories ?? 0)}
                  tone="primary"
                />
                <SummaryStat
                  label="Left"
                  value={formatCalories(
                    Math.max(0, targets.calorieTarget - (totals?.calories ?? 0)),
                  )}
                />
              </View>
              <AppText variant="caption" color="muted" align="center">
                {`Protein ${Math.round(totals?.protein ?? 0)}g · Carbs ${Math.round(
                  totals?.carbs ?? 0,
                )}g · Fat ${Math.round(totals?.fat ?? 0)}g`}
              </AppText>
            </Card>

            {sections.map((section) => (
              <MealCard
                key={section.mealType}
                section={section}
                onAdd={() =>
                  router.push({
                    pathname: '/food/search',
                    params: { meal: section.mealType, date },
                  })
                }
                onOpenActions={() => setActionsMeal(section.mealType)}
                onPressLog={(log) =>
                  router.push({ pathname: '/log/[id]', params: { id: log.id } })
                }
                onDeleteLog={handleDeleteLog}
              />
            ))}

            <Button
              label="Add food"
              icon={Plus}
              variant="soft"
              fullWidth
              onPress={() => router.push({ pathname: '/food/search', params: { date } })}
            />
          </>
        )}
      </Content>

      <Sheet
        visible={Boolean(actionsMeal)}
        onClose={() => setActionsMeal(null)}
        title={actionsMeal ? MEAL_LABELS[actionsMeal] : 'Meal'}
        subtitle="Meal actions"
      >
        {actionsMeal ? (
          <View style={styles.sheetBody}>
            <View style={[styles.sheetBadge, { backgroundColor: MEAL_SOFT_COLORS[actionsMeal] }]}>
              <View style={[styles.sheetBadgeDot, { backgroundColor: MEAL_COLORS[actionsMeal] }]} />
              <AppText variant="smallMedium" color="secondary">
                {activeLogs === 0
                  ? 'Nothing logged in this meal yet'
                  : `${activeLogs} ${activeLogs === 1 ? 'entry' : 'entries'}`}
              </AppText>
            </View>

            <Button
              label="Save as a meal template"
              variant="secondary"
              icon={BookmarkPlus}
              onPress={() => {
                const meal = actionsMeal;
                setActionsMeal(null);
                setSaveMealFor(meal);
              }}
            />

            <View style={styles.copyBlock}>
              <AppText variant="caption" color="muted">
                COPY TO
              </AppText>
              <View style={styles.chipWrap}>
                {MEAL_TYPES.filter((meal) => meal !== actionsMeal).map((meal) => (
                  <Chip
                    key={meal}
                    label={MEAL_LABELS[meal]}
                    onPress={() => handleCopyTo(meal)}
                    icon={Copy}
                  />
                ))}
              </View>
            </View>

            <Button
              label={`Copy yesterday's ${MEAL_LABELS[actionsMeal].toLowerCase()}`}
              variant="ghost"
              onPress={handleCopyYesterday}
              loading={busy}
            />

            {activeLogs > 0 ? (
              <Button
                label="Delete all entries"
                variant="ghost"
                icon={TrashIcon}
                onPress={handleClearMeal}
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <PromptModal
        visible={Boolean(saveMealFor)}
        title="Save this meal"
        message={
          saveMealFor
            ? `${MEAL_LABELS[saveMealFor]} will be saved as a reusable template.`
            : undefined
        }
        label="Template name"
        placeholder={saveMealFor ? `My ${MEAL_LABELS[saveMealFor].toLowerCase()}` : 'Meal name'}
        confirmLabel="Save meal"
        onClose={() => setSaveMealFor(null)}
        onSubmit={async (name) => {
          if (!saveMealFor) return;
          await saveMeal(name, saveMealFor);
          showToast('Meal saved');
        }}
      />
    </Screen>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary';
}) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color="muted">
        {label.toUpperCase()}
      </AppText>
      <AppText variant="h3" color={tone === 'primary' ? 'primary' : 'default'}>
        {value}
      </AppText>
      <AppText variant="caption" color="muted">
        kcal
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
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
  summary: {
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  sheetBody: {
    gap: spacing.md,
  },
  sheetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  sheetBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  copyBlock: {
    gap: spacing.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
