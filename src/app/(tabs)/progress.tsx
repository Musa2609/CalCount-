import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Plus, Scale, Trash as TrashIcon } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/StateViews';
import { ErrorBlock, LoadingBlock, Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useSubmit } from '@/hooks/useSubmit';
import {
  differenceInDaysKeys,
  formatShortDate,
  fromDateKey,
  todayKey,
  weekdayInitial,
} from '@/lib/dates';
import { weightTrendPoints } from '@/lib/analytics';
import { formatWeight, formatWeightValue, weightFromKg, weightToKg } from '@/lib/units';
import { errorMessage, formatCalories, formatGrams } from '@/lib/utils';
import { parseNumericInput, validateWeightKg } from '@/lib/validation';
import { format } from 'date-fns';

type RangeValue = '7' | '30' | '90';
type Metric = 'calories' | 'protein' | 'carbs' | 'fat';

const RANGE_OPTIONS: { value: RangeValue; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: 'calories', label: 'Calories' },
  { value: 'protein', label: 'Protein' },
  { value: 'carbs', label: 'Carbs' },
  { value: 'fat', label: 'Fat' },
];

const METRIC_COLORS: Record<Metric, string> = {
  calories: colors.primary,
  protein: colors.protein,
  carbs: colors.carbs,
  fat: colors.fat,
};

export default function ProgressScreen() {
  const {
    profile,
    session,
    backend,
    refreshProfile,
    invalidate,
  } = useApp();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const { submit, busy } = useSubmit();

  const [range, setRange] = useState<RangeValue>('7');
  const [metric, setMetric] = useState<Metric>('calories');
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [weightSheet, setWeightSheet] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightError, setWeightError] = useState<string | null>(null);

  const days = Number(range);
  const units = profile?.unitSystem ?? 'metric';
  const { days: rangeDays, weights, stats, loading, error, reload } = useAnalytics(days);

  const barData = useMemo(
    () =>
      rangeDays.map((day) => ({
        label:
          rangeDays.length <= 7
            ? weekdayInitial(day.date)
            : format(fromDateKey(day.date), 'd'),
        value: metric === 'calories' ? day.calories : Math.round(day[metric] * 10) / 10,
      })),
    [rangeDays, metric],
  );

  const todayTarget = rangeDays[rangeDays.length - 1]?.target ?? profile?.calorieTarget ?? 0;
  const selectedDay = selectedBar !== null ? rangeDays[selectedBar] : null;

  // The change is measured between the first and latest weigh-in actually
  // recorded, which is rarely the full selected range.
  const weightSpanDays = useMemo(() => {
    const entries = stats.weight.entries;
    if (entries.length < 2) return 0;
    return differenceInDaysKeys(
      entries[entries.length - 1].logDate,
      entries[0].logDate,
    );
  }, [stats.weight.entries]);

  const weightSeries = useMemo(() => {
    const trend = weightTrendPoints(weights, rangeDays.map((day) => day.date));
    return rangeDays.map((day, index) => ({
      label: formatShortDate(day.date),
      value:
        trend[index] === null
          ? null
          : Math.round(weightFromKg(trend[index] as number, units) * 10) / 10,
    }));
  }, [rangeDays, weights, units]);

  const openWeightSheet = () => {
    setWeightInput(formatWeightValue(stats.weight.latest ?? profile?.currentWeightKg ?? null, units));
    setWeightError(null);
    setWeightSheet(true);
  };

  const handleSaveWeight = () => {
    if (!session) return;
    const value = parseNumericInput(weightInput);
    const kg = value === null ? null : weightToKg(value, units);
    const errorMessageText = validateWeightKg(kg);
    setWeightError(errorMessageText);
    if (kg === null || errorMessageText) return;
    void submit(async () => {
      try {
        await backend.upsertWeight(session.userId, { logDate: todayKey(), weightKg: kg });
        await refreshProfile();
        invalidate();
        setWeightSheet(false);
        showToast('Weight logged');
        reload();
      } catch (cause) {
        setWeightError(errorMessage(cause, 'Could not save your weight.'));
      }
    });
  };

  const handleDeleteWeight = async (id: string, label: string) => {
    if (!session) return;
    const confirmed = await confirm({
      title: 'Delete this weigh-in?',
      message: `${label} will be removed from your history.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await submit(async () => {
      try {
        await backend.deleteWeight(session.userId, id);
        await refreshProfile();
        invalidate();
        reload();
        showToast('Weigh-in deleted', 'info');
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  const metricLabel =
    metric === 'calories' ? 'kcal' : 'g';

  return (
    <Screen scroll refreshing={loading && rangeDays.length > 0} onRefresh={reload}>
      <View style={styles.content}>
        <AppHeader
          title="Progress"
          subtitle="Built from your logged meals and weigh-ins, not estimates."
        />

        <SegmentedControl
          options={RANGE_OPTIONS}
          value={range}
          onChange={(next) => {
            setRange(next);
            setSelectedBar(null);
          }}
        />

        {error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {loading && rangeDays.length === 0 ? <LoadingBlock /> : null}

        {rangeDays.length > 0 ? (
          <>
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <AppText variant="h3">Intake trend</AppText>
                  <AppText variant="small" color="muted">
                    {stats.loggedDays === 0
                      ? 'No meals logged in this range yet'
                      : `${stats.loggedDays} of ${days} days logged`}
                  </AppText>
                </View>
                <View style={styles.averageBlock}>
                  <AppText variant="h3" color="primary">
                    {stats.averageCalories ? formatCalories(stats.averageCalories) : '—'}
                  </AppText>
                  <AppText variant="caption" color="muted">
                    AVG KCAL
                  </AppText>
                </View>
              </View>

              <SegmentedControl
                options={METRIC_OPTIONS}
                value={metric}
                onChange={(next) => {
                  setMetric(next);
                  setSelectedBar(null);
                }}
              />

              <BarChart
                data={barData}
                color={METRIC_COLORS[metric]}
                goal={metric === 'calories' ? todayTarget : null}
                selectedIndex={selectedBar}
                onSelectIndex={(index) =>
                  setSelectedBar((current) => (current === index ? null : index))
                }
              />

              <View style={styles.chartFooter}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, { backgroundColor: METRIC_COLORS[metric] }]} />
                  <AppText variant="caption" color="muted">
                    {metric === 'calories' ? 'Daily calories' : `${metricLabel} per day`}
                  </AppText>
                </View>
                {metric === 'calories' ? (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDash, { borderColor: colors.warning }]} />
                    <AppText variant="caption" color="muted">
                      {`Goal ${formatCalories(todayTarget)}`}
                    </AppText>
                  </View>
                ) : null}
              </View>

              {selectedDay ? (
                <View style={styles.selectedRow}>
                  <AppText variant="smallMedium">{formatShortDate(selectedDay.date)}</AppText>
                  <AppText variant="smallMedium" color="primary">
                    {`${Math.round(
                      metric === 'calories' ? selectedDay.calories : selectedDay[metric],
                    )} ${metricLabel}`}
                  </AppText>
                  {metric === 'calories' ? (
                    <AppText variant="caption" color="muted">
                      {`${selectedDay.calories - selectedDay.target > 0 ? '+' : ''}${
                        selectedDay.calories - selectedDay.target
                      } vs goal`}
                    </AppText>
                  ) : null}
                </View>
              ) : (
                <AppText variant="caption" color="muted">
                  Tap a bar to inspect a day.
                </AppText>
              )}
            </Card>

            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <AppText variant="h3">Weight</AppText>
                  <AppText variant="small" color="muted">
                    {stats.weight.latest !== null
                      ? `Latest ${formatWeight(stats.weight.latest, units)}`
                      : 'No weigh-ins in this range'}
                  </AppText>
                </View>
                <Button label="Log" size="sm" variant="soft" icon={Plus} onPress={openWeightSheet} />
              </View>

              {stats.weight.latest !== null ? (
                <>
                  <View style={styles.weightSummary}>
                    <View>
                      <AppText variant="number">
                        {formatWeightValue(stats.weight.latest, units)}
                      </AppText>
                      <AppText variant="caption" color="muted">
                        {units === 'imperial' ? 'POUNDS' : 'KILOGRAMS'}
                      </AppText>
                    </View>
                    {stats.weight.changeKg !== null ? (
                      <View style={styles.changeBlock}>
                        <AppText
                          variant="smallMedium"
                          color={stats.weight.changeKg <= 0 ? 'primary' : 'warning'}
                        >
                          {`${stats.weight.changeKg > 0 ? '+' : ''}${formatWeightValue(
                            stats.weight.changeKg,
                            units,
                            1,
                          )} ${units === 'imperial' ? 'lb' : 'kg'}`}
                        </AppText>
                        <AppText variant="caption" color="muted">
                          {weightSpanDays > 0
                            ? `OVER ${weightSpanDays} ${weightSpanDays === 1 ? 'DAY' : 'DAYS'}`
                            : 'SINCE FIRST WEIGH-IN'}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <LineChart data={weightSeries} formatValue={(value) => `${value}`} />
                </>
              ) : (
                <EmptyState
                  icon={Scale}
                  title="Track your weight"
                  message="A weigh-in or two is enough to see a trend. Log the same time of day for consistency."
                  actionLabel="Log weight"
                  onAction={openWeightSheet}
                />
              )}

              {stats.weight.entries.length ? (
                <View style={styles.history}>
                  {[...stats.weight.entries]
                    .reverse()
                    .slice(0, 4)
                    .map((entry) => (
                      <View key={entry.id} style={styles.historyRow}>
                        <AppText variant="small" color="secondary">
                          {formatShortDate(entry.logDate)}
                        </AppText>
                        <AppText variant="smallMedium">
                          {formatWeight(entry.weightKg, units)}
                        </AppText>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Delete weigh-in"
                          onPress={() => void handleDeleteWeight(entry.id, formatShortDate(entry.logDate))}
                          hitSlop={8}
                          style={({ pressed }) => [pressed ? styles.pressed : null]}
                        >
                          <TrashIcon size={14} color={colors.textMuted} strokeWidth={2} />
                        </Pressable>
                      </View>
                    ))}
                </View>
              ) : null}
            </Card>

            <Card style={styles.card}>
              <AppText variant="h3">Macro averages</AppText>
              <AppText variant="small" color="muted">
                {`Averaged over days you logged food. Targets come from today's plan.`}
              </AppText>
              <MacroAverage
                label="Protein"
                value={stats.averageProtein}
                target={profile?.proteinTargetG ?? 0}
                color={colors.protein}
              />
              <MacroAverage
                label="Carbs"
                value={stats.averageCarbs}
                target={profile?.carbsTargetG ?? 0}
                color={colors.carbs}
              />
              <MacroAverage
                label="Fat"
                value={stats.averageFat}
                target={profile?.fatTargetG ?? 0}
                color={colors.fat}
              />
            </Card>

            <Card style={styles.card}>
              <AppText variant="h3">Consistency</AppText>
              <View style={styles.consistencyRow}>
                <View style={styles.consistencyStat}>
                  <AppText variant="number">{`${stats.adherence}%`}</AppText>
                  <AppText variant="caption" color="muted">
                    DAYS WITHIN 10% OF GOAL
                  </AppText>
                </View>
                <View style={styles.consistencyStat}>
                  <AppText variant="number">{`${stats.loggedDays}/${days}`}</AppText>
                  <AppText variant="caption" color="muted">
                    DAYS LOGGED
                  </AppText>
                </View>
              </View>
              <ProgressBar
                value={stats.adherence}
                target={100}
                color={stats.adherence >= 60 ? colors.primary : colors.carbs}
              />
              <AppText variant="caption" color="muted">
                Consistency beats perfection — a logged day you went over still counts.
              </AppText>
            </Card>
          </>
        ) : null}
      </View>

      <Sheet
        visible={weightSheet}
        onClose={() => setWeightSheet(false)}
        title="Log your weight"
        subtitle="Recorded for today. Re-logging today replaces today's entry."
      >
        <TextField
          label="Weight"
          value={weightInput}
          onChangeText={(value) => {
            setWeightInput(value);
            setWeightError(null);
          }}
          keyboardType="decimal-pad"
          suffix={units === 'imperial' ? 'lb' : 'kg'}
          error={weightError}
          autoFocus
          onSubmitEditing={handleSaveWeight}
        />
        <Button label="Save weigh-in" onPress={handleSaveWeight} loading={busy} fullWidth />
      </Sheet>
    </Screen>
  );
}

function MacroAverage({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroHeader}>
        <View style={styles.macroLabel}>
          <View style={[styles.macroDot, { backgroundColor: color }]} />
          <AppText variant="smallMedium" color="secondary">
            {label}
          </AppText>
        </View>
        <AppText variant="small" color="muted">
          {`${formatGrams(value)} avg · ${formatGrams(target)} target`}
        </AppText>
      </View>
      <ProgressBar value={value} target={target} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  card: {
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  averageBlock: {
    alignItems: 'flex-end',
  },
  chartFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  legendDash: {
    width: 14,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  weightSummary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  changeBlock: {
    alignItems: 'flex-end',
  },
  history: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 2,
  },
  pressed: {
    opacity: 0.6,
  },
  macroRow: {
    gap: spacing.xs,
  },
  macroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  macroLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  consistencyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  consistencyStat: {
    flex: 1,
    gap: 2,
  },
});
