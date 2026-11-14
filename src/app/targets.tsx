import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { Notice } from '@/components/Notice';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingBlock, Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { CALORIE_DISCLAIMER } from '@/constants/nutrition';
import { colors, spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { useGoals, type GoalTargets } from '@/hooks/useGoals';
import { useSubmit } from '@/hooks/useSubmit';
import { todayKey } from '@/lib/dates';
import { buildGoalPlan, caloriesFromMacros } from '@/lib/nutrition';
import { errorMessage } from '@/lib/utils';
import {
  parseNumericInput,
  validateCalorieTarget,
  validateMacroTarget,
} from '@/lib/validation';
import type { Profile } from '@/types/models';

export default function TargetsScreen() {
  const router = useRouter();
  const { profile, session, backend, setProfile } = useApp();
  const { showToast } = useToast();
  const { targets, loading, saveTargets } = useGoals(todayKey());

  const handleSave = async (next: GoalTargets) => {
    if (!session) throw new Error('You need to be signed in to change targets.');
    const updated = await backend.updateProfile(session.userId, next);
    await saveTargets(next);
    setProfile(updated);
    showToast('Targets updated');
    router.back();
  };

  const formKey = [
    targets.calorieTarget,
    targets.proteinTargetG,
    targets.carbsTargetG,
    targets.fatTargetG,
  ].join(':');

  return (
    <Screen scroll keyboardAware contentStyle={styles.content}>
      <AppHeader
        title="Daily targets"
        subtitle="Saved from today forward. Past days keep the goals they had."
        showBack
      />

      {loading ? (
        <LoadingBlock label="Loading your targets…" />
      ) : (
        <TargetsForm key={formKey} initial={targets} profile={profile} onSave={handleSave} />
      )}
    </Screen>
  );
}

function TargetsForm({
  initial,
  profile,
  onSave,
}: {
  initial: GoalTargets;
  profile: Profile | null;
  onSave: (next: GoalTargets) => Promise<void>;
}) {
  const { submit, busy } = useSubmit();

  const [calories, setCalories] = useState(String(initial.calorieTarget || ''));
  const [protein, setProtein] = useState(String(initial.proteinTargetG || ''));
  const [carbs, setCarbs] = useState(String(initial.carbsTargetG || ''));
  const [fat, setFat] = useState(String(initial.fatTargetG || ''));
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const calorieValue = parseNumericInput(calories);
  const proteinValue = parseNumericInput(protein);
  const carbsValue = parseNumericInput(carbs);
  const fatValue = parseNumericInput(fat);
  const macroCalories =
    proteinValue !== null && carbsValue !== null && fatValue !== null
      ? caloriesFromMacros(proteinValue, carbsValue, fatValue)
      : null;
  const impliedKcal = Math.round(
    (proteinValue ?? 0) * 4 + (carbsValue ?? 0) * 4 + (fatValue ?? 0) * 9,
  );

  const suggest = () => {
    if (!profile?.currentWeightKg || !profile.heightCm || !profile.age) {
      setFormError('Complete your height, age and weight in Profile before using suggestions.');
      return;
    }
    const plan = buildGoalPlan({
      age: profile.age,
      gender: profile.gender,
      heightCm: profile.heightCm,
      weightKg: profile.currentWeightKg,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
    });
    setCalories(String(plan.calorieTarget));
    setProtein(String(plan.macros.proteinTargetG));
    setCarbs(String(plan.macros.carbsTargetG));
    setFat(String(plan.macros.fatTargetG));
    setErrors({});
    setFormError(null);
  };

  const handleSave = () => {
    const nextErrors = {
      calories: validateCalorieTarget(calorieValue),
      protein: validateMacroTarget(proteinValue),
      carbs: validateMacroTarget(carbsValue),
      fat: validateMacroTarget(fatValue),
    };
    setErrors(nextErrors);
    setFormError(null);
    if (Object.values(nextErrors).some(Boolean)) return;
    if (
      calorieValue === null ||
      proteinValue === null ||
      carbsValue === null ||
      fatValue === null
    ) {
      return;
    }
    void submit(async () => {
      try {
        await onSave({
          calorieTarget: calorieValue,
          proteinTargetG: proteinValue,
          carbsTargetG: carbsValue,
          fatTargetG: fatValue,
        });
      } catch (cause) {
        setFormError(errorMessage(cause, 'Could not save your targets.'));
      }
    });
  };

  const mismatch =
    macroCalories !== null && calorieValue !== null && Math.abs(macroCalories - calorieValue) > 80;

  return (
    <>
      <Card style={styles.card}>
        <TextField
          label="Calorie target"
          value={calories}
          onChangeText={setCalories}
          keyboardType="number-pad"
          suffix="kcal"
          error={errors.calories ?? null}
        />
        <View style={styles.macroRow}>
          <TextField
            label="Protein"
            value={protein}
            onChangeText={setProtein}
            keyboardType="number-pad"
            suffix="g"
            containerStyle={styles.macroInput}
            error={errors.protein ?? null}
          />
          <TextField
            label="Carbs"
            value={carbs}
            onChangeText={setCarbs}
            keyboardType="number-pad"
            suffix="g"
            containerStyle={styles.macroInput}
            error={errors.carbs ?? null}
          />
          <TextField
            label="Fat"
            value={fat}
            onChangeText={setFat}
            keyboardType="number-pad"
            suffix="g"
            containerStyle={styles.macroInput}
            error={errors.fat ?? null}
          />
        </View>

        {macroCalories !== null ? (
          <View style={styles.summary}>
            <AppText variant="small" color="secondary">
              {`Macros add up to ${impliedKcal} kcal`}
            </AppText>
            {mismatch ? (
              <AppText variant="small" color="warning">
                {`That is ${Math.abs(impliedKcal - (calorieValue ?? 0))} kcal ${
                  impliedKcal > (calorieValue ?? 0) ? 'above' : 'below'
                } your calorie target. It still saves — the calorie target drives the dashboard.`}
              </AppText>
            ) : (
              <AppText variant="small" color="muted">
                Close to your calorie target.
              </AppText>
            )}
          </View>
        ) : null}

        <Button
          label="Use suggested split"
          variant="soft"
          icon={Sparkles}
          onPress={suggest}
          size="sm"
        />
        {formError ? <Notice tone="danger" message={formError} /> : null}
      </Card>

      <Notice tone="warning" title="Targets are estimates" message={CALORIE_DISCLAIMER} />

      <Button label="Save targets" onPress={handleSave} loading={busy} fullWidth />
    </>
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
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroInput: {
    flex: 1,
  },
  summary: {
    gap: 2,
    padding: spacing.md,
    borderRadius: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
});
