import { buildGoalPlan } from '@/lib/nutrition';
import type {
  ActivityLevel,
  AppSession,
  FitnessGoal,
  Gender,
  Profile,
} from '@/types/models';

export interface OnboardingDraft {
  name: string;
  age: string;
  gender: Gender | null;
  heightCm: string;
  currentWeightKg: string;
  targetWeightKg: string;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
  unitSystem: Profile['unitSystem'];
  calorieTarget: string;
  proteinTargetG: string;
  carbsTargetG: string;
  fatTargetG: string;
}

export const DEFAULT_ONBOARDING_DRAFT: OnboardingDraft = {
  name: '',
  age: '',
  gender: null,
  heightCm: '',
  currentWeightKg: '',
  targetWeightKg: '',
  activityLevel: 'moderate',
  goal: 'maintain',
  unitSystem: 'metric',
  calorieTarget: '',
  proteinTargetG: '',
  carbsTargetG: '',
  fatTargetG: '',
};

export function createProfile(input: {
  session: AppSession;
  name: string;
  age: number | null;
  gender: Gender | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
  unitSystem: Profile['unitSystem'];
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  onboardingCompleted: boolean;
}): Profile {
  const now = new Date().toISOString();
  return {
    id: input.session.userId,
    name: input.name.trim(),
    email: input.session.email,
    age: input.age,
    gender: input.gender,
    heightCm: input.heightCm,
    currentWeightKg: input.currentWeightKg,
    targetWeightKg: input.targetWeightKg,
    activityLevel: input.activityLevel,
    goal: input.goal,
    unitSystem: input.unitSystem,
    calorieTarget: input.calorieTarget,
    proteinTargetG: input.proteinTargetG,
    carbsTargetG: input.carbsTargetG,
    fatTargetG: input.fatTargetG,
    onboardingCompleted: input.onboardingCompleted,
    createdAt: now,
    updatedAt: now,
  };
}

/** Estimated plan shown on the final onboarding step. Never presented as medical advice. */
export function planForDraft(draft: {
  age: number;
  gender: Gender | null;
  heightCm: number;
  currentWeightKg: number;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
}) {
  return buildGoalPlan({
    age: draft.age,
    gender: draft.gender,
    heightCm: draft.heightCm,
    weightKg: draft.currentWeightKg,
    activityLevel: draft.activityLevel,
    goal: draft.goal,
  });
}
