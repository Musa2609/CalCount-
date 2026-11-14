import type {
  ActivityLevel,
  FitnessGoal,
  Gender,
  MealType,
} from '@/types/models';

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

export const MEAL_TIME_HINTS: Record<MealType, string> = {
  breakfast: 'Start strong',
  lunch: 'Midday fuel',
  dinner: 'Evening plate',
  snacks: 'Small bites',
};

export const ACTIVITY_OPTIONS: {
  value: ActivityLevel;
  label: string;
  description: string;
  factor: number;
}[] = [
  {
    value: 'sedentary',
    label: 'Sedentary',
    description: 'Desk job, little or no exercise',
    factor: 1.2,
  },
  {
    value: 'light',
    label: 'Lightly active',
    description: 'Light exercise 1–3 days a week',
    factor: 1.375,
  },
  {
    value: 'moderate',
    label: 'Moderately active',
    description: 'Moderate exercise 3–5 days a week',
    factor: 1.55,
  },
  {
    value: 'active',
    label: 'Very active',
    description: 'Hard exercise 6–7 days a week',
    factor: 1.725,
  },
  {
    value: 'very_active',
    label: 'Extra active',
    description: 'Physical job or twice-daily training',
    factor: 1.9,
  },
];

export const GOAL_OPTIONS: {
  value: FitnessGoal;
  label: string;
  description: string;
  icon: 'trending-down' | 'minus' | 'trending-up' | 'dumbbell';
}[] = [
  {
    value: 'lose',
    label: 'Lose weight',
    description: 'A measured calorie deficit with high protein',
    icon: 'trending-down',
  },
  {
    value: 'maintain',
    label: 'Maintain',
    description: 'Keep your current weight steady',
    icon: 'minus',
  },
  {
    value: 'gain',
    label: 'Gain weight',
    description: 'A gentle surplus to build mass',
    icon: 'trending-up',
  },
  {
    value: 'muscle',
    label: 'Build muscle',
    description: 'A small surplus with extra protein',
    icon: 'dumbbell',
  },
];

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export const FOOD_CATEGORIES = [
  'Indian staples',
  'Indian dishes',
  'Dals & legumes',
  'Vegetables',
  'Fruits',
  'Dairy & eggs',
  'Meat & seafood',
  'Grains & cereals',
  'Snacks',
  'Beverages',
  'Nuts & seeds',
  'Oils & condiments',
  'International',
  'Packaged',
] as const;

export const INDIAN_CATEGORY = 'Indian staples';
export const PACKAGED_CATEGORY = 'Packaged';

export const DATA_QUALITY_LABELS = {
  sourced: 'Sourced values',
  estimated: 'Estimated values',
  user: 'Your values',
  openfoodfacts: 'Open Food Facts',
} as const;

export const DATA_QUALITY_NOTES = {
  sourced:
    'Values are taken from public food composition references (USDA FoodData Central / IFCT 2017). Natural variation still applies.',
  estimated:
    'Values are typical estimates for a home-style preparation. Recipes, oil and portion sizes change the result.',
  user: 'Values entered by you. Double-check the label or recipe you used.',
  openfoodfacts:
    'Values supplied by Open Food Facts contributors. Packaged products can change — check the label.',
} as const;

export const CALORIE_DISCLAIMER =
  'Calorie and macro targets are estimates based on standard equations. They are a starting point, not medical advice. Adjust based on how your body responds and speak to a qualified professional for personalised guidance.';
