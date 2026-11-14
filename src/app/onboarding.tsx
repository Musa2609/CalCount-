import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowDownRight, ArrowUpRight, Check, Dumbbell, Minus } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { Notice } from '@/components/Notice';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, SegmentedControl } from '@/components/ui/Chip';
import { Content, Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { ACTIVITY_OPTIONS, CALORIE_DISCLAIMER, GENDER_OPTIONS, GOAL_OPTIONS } from '@/constants/nutrition';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { useSubmit } from '@/hooks/useSubmit';
import { todayKey } from '@/lib/dates';
import { buildGoalPlan } from '@/lib/nutrition';
import { createProfile, DEFAULT_ONBOARDING_DRAFT, type OnboardingDraft } from '@/lib/profile';
import { cmToInches, inchesToCm, kgToLb, lbToKg } from '@/lib/units';
import { errorMessage } from '@/lib/utils';
import {
  parseNumericInput,
  validateAge,
  validateCalorieTarget,
  validateHeightCm,
  validateMacroTarget,
  validateName,
  validateWeightKg,
} from '@/lib/validation';
import type { ActivityLevel, FitnessGoal, UnitSystem } from '@/types/models';

const STEPS = ['About you', 'Body', 'Goal', 'Activity', 'Your plan'] as const;

const GOAL_ICONS = {
  lose: ArrowDownRight,
  maintain: Minus,
  gain: ArrowUpRight,
  muscle: Dumbbell,
} as const;

export default function OnboardingScreen() {
  const { session, backend, setProfile } = useApp();
  const router = useRouter();
  const { showToast } = useToast();
  const { submit, busy } = useSubmit();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>({
    ...DEFAULT_ONBOARDING_DRAFT,
    name: session?.email?.split('@')[0] ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const units = draft.unitSystem;
  const imperial = units === 'imperial';

  const update = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: null }));
    setFormError(null);
  };

  const heightCm = (() => {
    const value = parseNumericInput(draft.heightCm);
    if (value === null) return null;
    return imperial ? inchesToCm(value) : value;
  })();

  const weightKg = (() => {
    const value = parseNumericInput(draft.currentWeightKg);
    if (value === null) return null;
    return imperial ? lbToKg(value) : value;
  })();

  const targetWeightKg = (() => {
    const value = parseNumericInput(draft.targetWeightKg);
    if (value === null) return null;
    return imperial ? lbToKg(value) : value;
  })();

  const age = parseNumericInput(draft.age);

  const switchUnits = (next: UnitSystem) => {
    if (next === units) return;
    setDraft((prev) => {
      const heightValue = parseNumericInput(prev.heightCm);
      const weightValue = parseNumericInput(prev.currentWeightKg);
      const targetValue = parseNumericInput(prev.targetWeightKg);
      // Draft values are typed in the *current* unit system, so normalise to
      // metric before converting into the newly selected system.
      const wasImperial = prev.unitSystem === 'imperial';
      const heightCm =
        heightValue === null ? null : wasImperial ? inchesToCm(heightValue) : heightValue;
      const weightKg =
        weightValue === null ? null : wasImperial ? lbToKg(weightValue) : weightValue;
      const targetKg =
        targetValue === null ? null : wasImperial ? lbToKg(targetValue) : targetValue;
      const toDisplayHeight = (cm: number) =>
        next === 'imperial' ? Math.round(cmToInches(cm)) : Math.round(cm);
      const toDisplayWeight = (kg: number) =>
        Math.round((next === 'imperial' ? kgToLb(kg) : kg) * 10) / 10;
      return {
        ...prev,
        unitSystem: next,
        heightCm: heightCm === null ? '' : String(toDisplayHeight(heightCm)),
        currentWeightKg: weightKg === null ? '' : String(toDisplayWeight(weightKg)),
        targetWeightKg: targetKg === null ? '' : String(toDisplayWeight(targetKg)),
      };
    });
  };

  const validateStep = (index: number): boolean => {
    if (index === 0) {
      const nextErrors = {
        name: validateName(draft.name),
        age: validateAge(age),
      };
      setErrors(nextErrors);
      return !Object.values(nextErrors).some(Boolean);
    }
    if (index === 1) {
      const nextErrors = {
        heightCm: validateHeightCm(heightCm),
        currentWeightKg: validateWeightKg(weightKg),
      };
      setErrors(nextErrors);
      return !Object.values(nextErrors).some(Boolean);
    }
    if (index === 2) {
      const nextErrors = { targetWeightKg: validateWeightKg(targetWeightKg) };
      setErrors(nextErrors);
      return !Object.values(nextErrors).some(Boolean);
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    if (step === 3) {
      const plan = computePlan();
      if (plan) {
        setDraft((prev) => ({
          ...prev,
          calorieTarget: String(plan.calorieTarget),
          proteinTargetG: String(plan.macros.proteinTargetG),
          carbsTargetG: String(plan.macros.carbsTargetG),
          fatTargetG: String(plan.macros.fatTargetG),
        }));
      }
    }
    setStep((value) => Math.min(STEPS.length - 1, value + 1));
  };

  const goBack = () => {
    if (step === 0) {
      router.back();
      return;
    }
    setStep((value) => Math.max(0, value - 1));
  };

  const computePlan = () => {
    if (
      age === null ||
      heightCm === null ||
      weightKg === null ||
      validateAge(age) ||
      validateHeightCm(heightCm) ||
      validateWeightKg(weightKg)
    ) {
      return null;
    }
    return buildGoalPlan({
      age,
      gender: draft.gender,
      heightCm,
      weightKg,
      activityLevel: draft.activityLevel,
      goal: draft.goal,
    });
  };

  const plan = computePlan();
  const calorieTarget = parseNumericInput(draft.calorieTarget);
  const proteinTarget = parseNumericInput(draft.proteinTargetG);
  const carbsTarget = parseNumericInput(draft.carbsTargetG);
  const fatTarget = parseNumericInput(draft.fatTargetG);

  const finish = () => {
    if (!session) {
      setFormError('Your session expired. Please sign in again.');
      return;
    }
    const nextErrors = {
      calorieTarget: validateCalorieTarget(calorieTarget),
      proteinTargetG: validateMacroTarget(proteinTarget),
      carbsTargetG: validateMacroTarget(carbsTarget),
      fatTargetG: validateMacroTarget(fatTarget),
      age: validateAge(age),
      heightCm: validateHeightCm(heightCm),
      currentWeightKg: validateWeightKg(weightKg),
      targetWeightKg: validateWeightKg(targetWeightKg),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    if (
      age === null ||
      heightCm === null ||
      weightKg === null ||
      targetWeightKg === null ||
      calorieTarget === null ||
      proteinTarget === null ||
      carbsTarget === null ||
      fatTarget === null
    ) {
      return;
    }

    setFormError(null);
    void submit(async () => {
      try {
        const profile = createProfile({
          session,
          name: draft.name,
          age,
          gender: draft.gender,
          heightCm,
          currentWeightKg: weightKg,
          targetWeightKg,
          activityLevel: draft.activityLevel,
          goal: draft.goal,
          unitSystem: units,
          calorieTarget,
          proteinTargetG: proteinTarget,
          carbsTargetG: carbsTarget,
          fatTargetG: fatTarget,
          onboardingCompleted: true,
        });
        const saved = await backend.upsertProfile(profile);
        const today = todayKey();
        await Promise.all([
          backend.upsertGoal(session.userId, {
            effectiveDate: today,
            calorieTarget: saved.calorieTarget,
            proteinTargetG: saved.proteinTargetG,
            carbsTargetG: saved.carbsTargetG,
            fatTargetG: saved.fatTargetG,
          }),
          backend.upsertWeight(session.userId, { logDate: today, weightKg }),
        ]);
        setProfile(saved);
        showToast('Your plan is ready. Start logging!');
        router.replace('/(tabs)');
      } catch (error) {
        setFormError(errorMessage(error, 'Could not save your plan. Please try again.'));
      }
    });
  };

  return (
    <Screen scroll keyboardAware contentStyle={styles.screen} bottomInset={spacing.huge}>
      <Content style={styles.content}>
        <AppHeader
          title="Set up your plan"
          subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
          showBack
          onBack={goBack}
        />

        <View style={styles.progress}>
          {STEPS.map((label, index) => (
            <View
              key={label}
              style={[
                styles.progressSegment,
                { backgroundColor: index <= step ? colors.primary : colors.surfaceStrong },
              ]}
            />
          ))}
        </View>

        {step === 0 ? (
          <Card style={styles.card}>
            <AppText variant="h3">{`Let's start with you`}</AppText>
            <TextField
              label="Name"
              value={draft.name}
              onChangeText={(value) => update('name', value)}
              placeholder="What should we call you?"
              autoCapitalize="words"
              maxLength={60}
              error={errors.name ?? null}
            />
            <TextField
              label="Age"
              value={draft.age}
              onChangeText={(value) => update('age', value)}
              placeholder="e.g. 28"
              keyboardType="number-pad"
              suffix="years"
              error={errors.age ?? null}
            />
            <View style={styles.fieldGroup}>
              <AppText variant="smallMedium" color="secondary">
                Gender (optional)
              </AppText>
              <AppText variant="small" color="muted">
                Used only to refine the calorie estimate. You can skip it.
              </AppText>
              <View style={styles.chipWrap}>
                {GENDER_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    active={draft.gender === option.value}
                    onPress={() => update('gender', draft.gender === option.value ? null : option.value)}
                  />
                ))}
              </View>
            </View>
          </Card>
        ) : null}

        {step === 1 ? (
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <AppText variant="h3">Your body</AppText>
              <SegmentedControl
                options={[
                  { value: 'metric', label: 'kg / cm' },
                  { value: 'imperial', label: 'lb / in' },
                ]}
                value={units}
                onChange={switchUnits}
                style={styles.unitToggle}
              />
            </View>
            <TextField
              label={imperial ? 'Height (inches)' : 'Height (cm)'}
              value={draft.heightCm}
              onChangeText={(value) => update('heightCm', value)}
              placeholder={imperial ? 'e.g. 68' : 'e.g. 172'}
              keyboardType="decimal-pad"
              suffix={imperial ? 'in' : 'cm'}
              hint={
                imperial && heightCm
                  ? `That's ${Math.floor(cmToInches(heightCm) / 12)}' ${Math.round(cmToInches(heightCm) % 12)}" tall`
                  : undefined
              }
              error={errors.heightCm ?? null}
            />
            <TextField
              label="Current weight"
              value={draft.currentWeightKg}
              onChangeText={(value) => update('currentWeightKg', value)}
              placeholder={imperial ? 'e.g. 154' : 'e.g. 70'}
              keyboardType="decimal-pad"
              suffix={imperial ? 'lb' : 'kg'}
              error={errors.currentWeightKg ?? null}
            />
            <AppText variant="small" color="muted">
              We use this as your first weight entry so your progress chart starts today.
            </AppText>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card style={styles.card}>
            <AppText variant="h3">Where are you headed?</AppText>
            <TextField
              label="Target weight"
              value={draft.targetWeightKg}
              onChangeText={(value) => update('targetWeightKg', value)}
              placeholder={imperial ? 'e.g. 143' : 'e.g. 65'}
              keyboardType="decimal-pad"
              suffix={imperial ? 'lb' : 'kg'}
              error={errors.targetWeightKg ?? null}
            />
            <View style={styles.fieldGroup}>
              <AppText variant="smallMedium" color="secondary">
                Fitness goal
              </AppText>
              {GOAL_OPTIONS.map((option) => {
                const Icon = GOAL_ICONS[option.value as keyof typeof GOAL_ICONS];
                const active = draft.goal === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => update('goal', option.value as FitnessGoal)}
                    style={({ pressed }) => [
                      styles.optionRow,
                      active ? styles.optionActive : null,
                      pressed ? styles.optionPressed : null,
                    ]}
                  >
                    <View style={[styles.optionIcon, active ? styles.optionIconActive : null]}>
                      <Icon
                        size={17}
                        color={active ? colors.primaryDark : colors.textSecondary}
                        strokeWidth={2.2}
                      />
                    </View>
                    <View style={styles.optionText}>
                      <AppText variant="bodyMedium">{option.label}</AppText>
                      <AppText variant="small" color="muted">
                        {option.description}
                      </AppText>
                    </View>
                    {active ? <Check size={18} color={colors.primary} strokeWidth={2.6} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card style={styles.card}>
            <AppText variant="h3">How active are you?</AppText>
            <AppText variant="small" color="secondary">
              Include workouts and physical work on a typical week.
            </AppText>
            {ACTIVITY_OPTIONS.map((option) => {
              const active = draft.activityLevel === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => update('activityLevel', option.value as ActivityLevel)}
                  style={({ pressed }) => [
                    styles.optionRow,
                    active ? styles.optionActive : null,
                    pressed ? styles.optionPressed : null,
                  ]}
                >
                  <View style={styles.optionText}>
                    <AppText variant="bodyMedium">{option.label}</AppText>
                    <AppText variant="small" color="muted">
                      {option.description}
                    </AppText>
                  </View>
                  {active ? <Check size={18} color={colors.primary} strokeWidth={2.6} /> : null}
                </Pressable>
              );
            })}
          </Card>
        ) : null}

        {step === 4 ? (
          <>
            <Card style={styles.card}>
              <AppText variant="h3">Your estimated plan</AppText>
              {plan ? (
                <>
                  <View style={styles.planRow}>
                    <View style={styles.planStat}>
                      <AppText variant="caption" color="muted">
                        BMR
                      </AppText>
                      <AppText variant="h3">{plan.bmr}</AppText>
                      <AppText variant="caption" color="muted">
                        kcal at rest
                      </AppText>
                    </View>
                    <View style={styles.planStat}>
                      <AppText variant="caption" color="muted">
                        TDEE
                      </AppText>
                      <AppText variant="h3">{plan.tdee}</AppText>
                      <AppText variant="caption" color="muted">
                        kcal maintenance
                      </AppText>
                    </View>
                  </View>
                  <AppText variant="small" color="secondary">
                    {plan.weeklyChangeKg === 0
                      ? 'At this intake your weight should stay around your current level.'
                      : `At this intake you would ${plan.weeklyChangeKg < 0 ? 'lose' : 'gain'} about ${Math.abs(
                          plan.weeklyChangeKg,
                        )} kg per week.`}
                  </AppText>
                </>
              ) : (
                <AppText variant="small" color="danger">
                  Add your age, height and weight to see an estimate.
                </AppText>
              )}
            </Card>

            <Card style={styles.card}>
              <AppText variant="h3">Fine-tune your targets</AppText>
              <AppText variant="small" color="secondary">
                Start here and adjust as you learn how your body responds.
              </AppText>
              <TextField
                label="Daily calorie target"
                value={draft.calorieTarget}
                onChangeText={(value) => update('calorieTarget', value)}
                keyboardType="number-pad"
                suffix="kcal"
                error={errors.calorieTarget ?? null}
              />
              <View style={styles.macroInputs}>
                <TextField
                  label="Protein"
                  value={draft.proteinTargetG}
                  onChangeText={(value) => update('proteinTargetG', value)}
                  keyboardType="number-pad"
                  suffix="g"
                  compact
                  containerStyle={styles.macroInput}
                  error={errors.proteinTargetG ?? null}
                />
                <TextField
                  label="Carbs"
                  value={draft.carbsTargetG}
                  onChangeText={(value) => update('carbsTargetG', value)}
                  keyboardType="number-pad"
                  suffix="g"
                  compact
                  containerStyle={styles.macroInput}
                  error={errors.carbsTargetG ?? null}
                />
                <TextField
                  label="Fat"
                  value={draft.fatTargetG}
                  onChangeText={(value) => update('fatTargetG', value)}
                  keyboardType="number-pad"
                  suffix="g"
                  compact
                  containerStyle={styles.macroInput}
                  error={errors.fatTargetG ?? null}
                />
              </View>
              {proteinTarget !== null && carbsTarget !== null && fatTarget !== null && calorieTarget ? (
                <AppText variant="small" color="muted">
                  {`Macros provide ${Math.round(
                    proteinTarget * 4 + carbsTarget * 4 + fatTarget * 9,
                  )} kcal of your ${Math.round(calorieTarget)} kcal target.`}
                </AppText>
              ) : null}
            </Card>

            <Notice
              tone="warning"
              title="Estimates, not prescriptions"
              message={CALORIE_DISCLAIMER}
            />
            {formError ? <Notice tone="danger" title="Could not save" message={formError} /> : null}
          </>
        ) : null}

        <View style={styles.actions}>
          {step > 0 ? (
            <Button label="Back" variant="secondary" onPress={goBack} style={styles.backButton} />
          ) : null}
          <Button
            label={step === STEPS.length - 1 ? 'Start tracking' : 'Continue'}
            onPress={step === STEPS.length - 1 ? finish : goNext}
            loading={busy}
            style={styles.nextButton}
          />
        </View>
      </Content>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: spacing.lg,
  },
  content: {
    gap: spacing.md,
  },
  progress: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: radii.pill,
  },
  card: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  unitToggle: {
    minWidth: 170,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  optionPressed: {
    opacity: 0.85,
  },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  optionIconActive: {
    backgroundColor: colors.primarySoft,
  },
  optionText: {
    flex: 1,
    gap: 1,
  },
  planRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  planStat: {
    flex: 1,
    gap: 2,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primaryTint,
  },
  macroInputs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroInput: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  backButton: {
    flex: 0.4,
  },
  nextButton: {
    flex: 1,
  },
});
