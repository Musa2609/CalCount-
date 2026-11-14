import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  BookmarkPlus,
  Camera,
  ChefHat,
  ChevronRight,
  LogOut,
  Ruler,
  Scale,
  Search,
  Target,
  User,
  type LucideIcon,
} from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { Notice } from '@/components/Notice';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, SegmentedControl } from '@/components/ui/Chip';
import { Content, Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import {
  ACTIVITY_OPTIONS,
  CALORIE_DISCLAIMER,
  GOAL_OPTIONS,
} from '@/constants/nutrition';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/context/AppContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { useSubmit } from '@/hooks/useSubmit';
import { todayKey } from '@/lib/dates';
import { buildGoalPlan } from '@/lib/nutrition';
import { hasLocalData, migrateLocalToCloud } from '@/lib/migration';
import {
  formatHeight,
  formatWeight,
  formatWeightValue,
  heightFromImperial,
  heightToImperial,
  weightToKg,
} from '@/lib/units';
import {
  errorMessage,
  firstName,
  initials,
} from '@/lib/utils';
import {
  parseNumericInput,
  validateAge,
  validateHeightCm,
  validateName,
  validateWeightKg,
} from '@/lib/validation';
import type { ActivityLevel, FitnessGoal, UnitSystem } from '@/types/models';

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, session, backend, setProfile, refreshProfile, invalidate, signOut, deleteAccount } = useApp();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const { submit, busy } = useSubmit();

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);

  const [nameInput, setNameInput] = useState('');
  const [ageInput, setAgeInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [targetWeightInput, setTargetWeightInput] = useState('');
  const [detailsErrors, setDetailsErrors] = useState<Record<string, string | null>>({});

  const [nextGoal, setNextGoal] = useState<FitnessGoal>('maintain');
  const [nextActivity, setNextActivity] = useState<ActivityLevel>('moderate');
  const [goalError, setGoalError] = useState<string | null>(null);

  const [weightInput, setWeightInput] = useState('');
  const [weightError, setWeightError] = useState<string | null>(null);

  const units: UnitSystem = profile?.unitSystem ?? 'metric';
  const imperial = units === 'imperial';

  if (!profile || !session) return null;

  const openDetails = () => {
    setNameInput(profile.name);
    setAgeInput(profile.age ? String(profile.age) : '');
    if (!profile.heightCm) {
      setHeightInput('');
    } else if (imperial) {
      const { feet, inches } = heightToImperial(profile.heightCm);
      setHeightInput(String(feet * 12 + inches));
    } else {
      setHeightInput(String(Math.round(profile.heightCm)));
    }
    setTargetWeightInput(formatWeightValue(profile.targetWeightKg, units));
    setDetailsErrors({});
    setDetailsOpen(true);
  };

  const openGoal = () => {
    setNextGoal(profile.goal);
    setNextActivity(profile.activityLevel);
    setGoalError(null);
    setGoalOpen(true);
  };

  const openWeight = () => {
    setWeightInput(formatWeightValue(profile.currentWeightKg, units));
    setWeightError(null);
    setWeightOpen(true);
  };

  const changeUnits = (next: UnitSystem) => {
    void submit(async () => {
      try {
        const updated = await backend.updateProfile(session.userId, { unitSystem: next });
        setProfile(updated);
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
      }
    });
  };

  const saveDetails = () => {
    const age = parseNumericInput(ageInput);
    const heightCm =
      heightInput.trim() === ''
        ? null
        : imperial
          ? heightFromImperial(
              Math.floor((parseNumericInput(heightInput) ?? 0) / 12),
              Math.round((parseNumericInput(heightInput) ?? 0) % 12),
            )
          : parseNumericInput(heightInput);
    const targetWeight = parseNumericInput(targetWeightInput);
    const targetWeightKg = targetWeight === null ? null : weightToKg(targetWeight, units);

    const errors = {
      name: validateName(nameInput),
      age: validateAge(age),
      heightCm: validateHeightCm(heightCm),
      targetWeightKg: validateWeightKg(targetWeightKg),
    };
    setDetailsErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    if (age === null || heightCm === null || targetWeightKg === null) return;

    void submit(async () => {
      try {
        const updated = await backend.updateProfile(session.userId, {
          name: nameInput.trim(),
          age,
          heightCm,
          targetWeightKg,
        });
        setProfile(updated);
        setDetailsOpen(false);
        showToast('Profile updated');
      } catch (cause) {
        setDetailsErrors({ name: errorMessage(cause) });
      }
    });
  };

  const saveGoal = () => {
    const heightCm = profile.heightCm;
    const weightKg = profile.currentWeightKg;
    const age = profile.age;
    if (!heightCm || !weightKg || !age) {
      setGoalError('Add your age, height and weight before changing your goal.');
      return;
    }
    setGoalError(null);
    void submit(async () => {
      try {
        const plan = buildGoalPlan({
          age,
          gender: profile.gender,
          heightCm,
          weightKg,
          activityLevel: nextActivity,
          goal: nextGoal,
        });
        const updated = await backend.updateProfile(session.userId, {
          goal: nextGoal,
          activityLevel: nextActivity,
          calorieTarget: plan.calorieTarget,
          proteinTargetG: plan.macros.proteinTargetG,
          carbsTargetG: plan.macros.carbsTargetG,
          fatTargetG: plan.macros.fatTargetG,
        });
        await backend.upsertGoal(session.userId, {
          effectiveDate: todayKey(),
          calorieTarget: updated.calorieTarget,
          proteinTargetG: updated.proteinTargetG,
          carbsTargetG: updated.carbsTargetG,
          fatTargetG: updated.fatTargetG,
        });
        setProfile(updated);
        invalidate();
        setGoalOpen(false);
        showToast('Goal updated with new targets');
      } catch (cause) {
        setGoalError(errorMessage(cause, 'Could not update your goal.'));
      }
    });
  };

  const saveWeight = () => {
    const value = parseNumericInput(weightInput);
    const kg = value === null ? null : weightToKg(value, units);
    const error = validateWeightKg(kg);
    setWeightError(error);
    if (kg === null || error) return;
    void submit(async () => {
      try {
        await backend.upsertWeight(session.userId, { logDate: todayKey(), weightKg: kg });
        await refreshProfile();
        invalidate();
        setWeightOpen(false);
        showToast('Weight logged');
      } catch (cause) {
        setWeightError(errorMessage(cause));
      }
    });
  };

  const handleSignOut = async () => {
    const confirmed = await confirm({
      title: 'Sign out?',
      message:
        session.mode === 'local'
          ? 'Your on-device diary stays on this device. You can continue locally again later.'
          : 'Your diary is saved to your account. Sign back in any time.',
      confirmLabel: 'Sign out',
      danger: true,
    });
    if (!confirmed) return;
    await signOut();
  };

  const goalLabel = GOAL_OPTIONS.find((option) => option.value === profile.goal)?.label ?? '—';
  const activityLabel =
    ACTIVITY_OPTIONS.find((option) => option.value === profile.activityLevel)?.label ?? '—';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen scroll>
      <Content style={styles.content}>
        <AppHeader title="Profile" subtitle={`Signed in as ${firstName(profile.name)}`} />

        <Card style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <AppText variant="h2" color="primary">
                {initials(profile.name)}
              </AppText>
            </View>
            <View style={styles.profileText}>
              <AppText variant="h2" numberOfLines={1}>
                {profile.name}
              </AppText>
              <AppText variant="small" color="muted" numberOfLines={1}>
                {profile.email ?? 'On-device account'}
              </AppText>
              <Chip
                label={session.mode === 'supabase' ? 'Cloud sync on' : 'Saved on this device'}
                active={session.mode === 'supabase'}
                style={styles.modeChip}
              />
            </View>
          </View>
          <Button
            label="Edit personal details"
            size="sm"
            variant="secondary"
            icon={User}
            onPress={openDetails}
          />
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <AppText variant="h3">Your plan</AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/targets')}
              hitSlop={8}
            >
              <AppText variant="smallMedium" color="primary">
                Edit targets
              </AppText>
            </Pressable>
          </View>

          <SettingRow label="Goal" value={goalLabel} icon={Target} />
          <SettingRow label="Activity level" value={activityLabel} icon={Ruler} />
          <SettingRow
            label="Daily calories"
            value={`${profile.calorieTarget} kcal`}
            icon={Target}
          />
          <SettingRow
            label="Macros"
            value={`${profile.proteinTargetG}P · ${profile.carbsTargetG}C · ${profile.fatTargetG}F`}
          />
          <Button label="Change goal or activity" size="sm" variant="soft" onPress={openGoal} />
        </Card>

        <Card style={styles.card}>
          <AppText variant="h3">Body</AppText>
          <SettingRow label="Height" value={formatHeight(profile.heightCm, units)} icon={Ruler} />
          <SettingRow
            label="Current weight"
            value={formatWeight(profile.currentWeightKg, units)}
            icon={Scale}
          />
          <SettingRow
            label="Target weight"
            value={formatWeight(profile.targetWeightKg, units)}
            icon={Target}
          />
          <Button
            label="Log today's weight"
            size="sm"
            variant="soft"
            icon={Scale}
            onPress={openWeight}
          />
        </Card>

        <Card style={styles.card}>
          <AppText variant="h3">Units</AppText>
          <SegmentedControl
            options={[
              { value: 'metric', label: 'Metric (kg / cm)' },
              { value: 'imperial', label: 'Imperial (lb / ft)' },
            ]}
            value={units}
            onChange={changeUnits}
          />
          <AppText variant="caption" color="muted">
            Stored values are always metric; only the display and inputs change.
          </AppText>
        </Card>

        <Card style={styles.card}>
          <AppText variant="h3">Shortcuts</AppText>
          <SettingRow
            label="Saved meals"
            value="Templates"
            icon={BookmarkPlus}
            onPress={() => router.push('/saved-meals')}
            chevron
          />
          <SettingRow
            label="Photo logging"
            value="Beta"
            icon={Camera}
            onPress={() => router.push('/scan')}
            chevron
          />
          <SettingRow
            label="Food search"
            value="Browse catalogue"
            icon={Search}
            onPress={() => router.push({ pathname: '/food/search', params: {} })}
            chevron
          />
          <SettingRow
            label="Recipes"
            value="My recipes"
            icon={ChefHat}
            onPress={() => router.push('/recipes' as any)}
            chevron
          />
        </Card>

        <Card style={styles.card}>
          <AppText variant="h3">Account</AppText>
          <SettingRow label="Email" value={profile.email ?? 'Not set (on-device)'} />
          <SettingRow
            label="Storage"
            value={session.mode === 'supabase' ? 'Supabase (cloud)' : 'This device only'}
          />
          <Button
            label="Sign out"
            variant="secondary"
            icon={LogOut}
            onPress={handleSignOut}
            fullWidth
          />
          {session.mode === 'supabase' ? (
            <Button
              label="Migrate on-device data"
              variant="ghost"
              onPress={async () => {
                const hasData = await hasLocalData();
                if (!hasData) {
                  showToast('No on-device data to migrate', 'info');
                  return;
                }
                const confirmed = await confirm({
                  title: 'Migrate local data?',
                  message:
                    'This will copy your on-device profile, custom foods, weights and goals to your cloud account.',
                  confirmLabel: 'Migrate',
                });
                if (!confirmed) return;
                await submit(async () => {
                  try {
                    const summary = await migrateLocalToCloud(session);
                    showToast(
                      `Migrated: profile ${summary.profiles ? '✓' : '—'}, ${summary.customFoods} foods, ${summary.weights} weights, ${summary.goals} goals`,
                    );
                  } catch (cause) {
                    showToast(errorMessage(cause), 'error');
                  }
                });
              }}
              fullWidth
            />
          ) : null}
          {session.mode === 'supabase' ? (
            <Button
              label="Delete account"
              variant="ghost"
              onPress={async () => {
                const confirmed = await confirm({
                  title: 'Delete your account?',
                  message:
                    'This will sign you out. Your cloud data may need to be removed separately by contacting support.',
                  confirmLabel: 'Delete',
                  danger: true,
                });
                if (!confirmed) return;
                await submit(async () => {
                  try {
                    await deleteAccount();
                    showToast('Account deleted', 'info');
                  } catch (cause) {
                    showToast(errorMessage(cause), 'error');
                  }
                });
              }}
              fullWidth
            />
          ) : null}
        </Card>

        <Card style={styles.card}>
          <AppText variant="h3">About CalCount</AppText>
          <Notice tone="warning" title="Not medical advice" message={CALORIE_DISCLAIMER} />
          <AppText variant="caption" color="muted">
            {`Version ${version} · Food values from CalCount's sourced/estimated catalogue, user entries and Open Food Facts contributors.`}
          </AppText>
        </Card>
      </Content>

      <Sheet
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Personal details"
        subtitle="Used to estimate your calorie needs."
        scroll
      >
        <TextField
          label="Name"
          value={nameInput}
          onChangeText={setNameInput}
          maxLength={60}
          error={detailsErrors.name ?? null}
        />
        <TextField
          label="Age"
          value={ageInput}
          onChangeText={setAgeInput}
          keyboardType="number-pad"
          suffix="years"
          error={detailsErrors.age ?? null}
        />
        <TextField
          label={imperial ? 'Height (inches)' : 'Height (cm)'}
          value={heightInput}
          onChangeText={setHeightInput}
          keyboardType="decimal-pad"
          suffix={imperial ? 'in' : 'cm'}
          error={detailsErrors.heightCm ?? null}
        />
        <TextField
          label="Target weight"
          value={targetWeightInput}
          onChangeText={setTargetWeightInput}
          keyboardType="decimal-pad"
          suffix={imperial ? 'lb' : 'kg'}
          error={detailsErrors.targetWeightKg ?? null}
        />
        <Button label="Save details" onPress={saveDetails} loading={busy} fullWidth />
      </Sheet>

      <Sheet
        visible={goalOpen}
        onClose={() => setGoalOpen(false)}
        title="Goal and activity"
        subtitle="Saving recalculates your calorie and macro targets."
        scroll
      >
        <View style={styles.sheetGroup}>
          <AppText variant="smallMedium" color="secondary">
            Fitness goal
          </AppText>
          <View style={styles.chipWrap}>
            {GOAL_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={nextGoal === option.value}
                onPress={() => setNextGoal(option.value)}
              />
            ))}
          </View>
        </View>
        <View style={styles.sheetGroup}>
          <AppText variant="smallMedium" color="secondary">
            Activity level
          </AppText>
          <View style={styles.chipWrap}>
            {ACTIVITY_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={nextActivity === option.value}
                onPress={() => setNextActivity(option.value)}
              />
            ))}
          </View>
        </View>
        {goalError ? <Notice tone="danger" message={goalError} /> : null}
        <Button label="Save goal" onPress={saveGoal} loading={busy} fullWidth />
      </Sheet>

      <Sheet
        visible={weightOpen}
        onClose={() => setWeightOpen(false)}
        title="Log today's weight"
        subtitle="A single daily entry; logging again replaces today's value."
      >
        <TextField
          label="Weight"
          value={weightInput}
          onChangeText={(value) => {
            setWeightInput(value);
            setWeightError(null);
          }}
          keyboardType="decimal-pad"
          suffix={imperial ? 'lb' : 'kg'}
          error={weightError}
          autoFocus
          onSubmitEditing={saveWeight}
        />
        <Button label="Save weight" onPress={saveWeight} loading={busy} fullWidth />
      </Sheet>
    </Screen>
  );
}

function SettingRow({
  label,
  value,
  icon: Icon,
  onPress,
  chevron = false,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const content = (
    <>
      {Icon ? <Icon size={16} color={colors.textMuted} strokeWidth={2} /> : null}
      <View style={styles.settingText}>
        <AppText variant="small" color="muted">
          {label}
        </AppText>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {value}
        </AppText>
      </View>
      {chevron ? (
        <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.settingRow}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  profileCard: {
    gap: spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceStrong,
  },
  profileText: {
    flex: 1,
    gap: 2,
    alignItems: 'flex-start',
  },
  modeChip: {
    marginTop: spacing.xxs,
  },
  card: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  settingText: {
    flex: 1,
    gap: 1,
  },
  pressed: {
    opacity: 0.65,
  },
  sheetGroup: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
