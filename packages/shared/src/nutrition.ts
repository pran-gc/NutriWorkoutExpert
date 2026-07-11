// Pure nutrition math — BMR / TDEE / daily targets. Runtime-agnostic; consumed
// by the app (Profile/onboarding) and the API (PATCH /me). (NWE-112; moved from
// lib/nutrition.ts. Test suite in nutrition.test.ts covers every branch.)
import type { ActivityLevel, GoalType, Profile, Sex } from './types.ts';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Daily calorie adjustment per goal: ~0.5 kg/week of body weight change.
const GOAL_ADJUSTMENTS: Record<GoalType, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (little exercise)',
  light: 'Light (1-3 days/week)',
  moderate: 'Moderate (3-5 days/week)',
  active: 'Active (6-7 days/week)',
  very_active: 'Very active (physical job)',
};

export const GOAL_LABELS: Record<GoalType, string> = {
  lose: 'Lose weight',
  maintain: 'Maintain weight',
  gain: 'Build muscle',
};

/** Mifflin-St Jeor basal metabolic rate. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function tdee(bmrValue: number, activity: ActivityLevel): number {
  return bmrValue * ACTIVITY_MULTIPLIERS[activity];
}

export interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** The minimum daily calorie floor we will ever recommend. */
export const CALORIE_FLOOR = 1200;

/**
 * Compute daily calorie and macro targets from profile + current weight.
 * Returns null when required profile data is missing.
 * Protein: 1.8 g/kg (2.0 when building muscle), fat: 25% of calories, carbs: remainder.
 */
export function computeTargets(
  profile: Pick<Profile, 'sex' | 'birth_year' | 'height_cm' | 'activity_level' | 'goal_type'>,
  currentWeightKg: number
): MacroTargets | null {
  if (!profile.sex || !profile.birth_year || !profile.height_cm || !currentWeightKg) {
    return null;
  }
  const age = new Date().getFullYear() - profile.birth_year;
  const calories = Math.max(
    CALORIE_FLOOR,
    Math.round(
      tdee(bmr(profile.sex, currentWeightKg, profile.height_cm, age), profile.activity_level) +
        GOAL_ADJUSTMENTS[profile.goal_type]
    )
  );
  const proteinG = Math.round(currentWeightKg * (profile.goal_type === 'gain' ? 2.0 : 1.8));
  const fatG = Math.round((calories * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  return { calories, proteinG, carbsG, fatG };
}

/** Local date as YYYY-MM-DD (device timezone, matching the user's day). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}
