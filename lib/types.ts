export type Sex = 'male' | 'female';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export type GoalType = 'lose' | 'maintain' | 'gain';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Profile {
  id: string;
  display_name: string | null;
  sex: Sex | null;
  birth_year: number | null;
  height_cm: number | null;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  target_weight_kg: number | null;
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
}

export interface WeightLog {
  id: string;
  user_id: string;
  weight_kg: number;
  logged_on: string; // YYYY-MM-DD
}

export interface FoodLog {
  id: string;
  user_id: string;
  food_name: string;
  brand: string | null;
  meal_type: MealType;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: 'manual' | 'openfoodfacts';
  source_id: string | null;
  logged_on: string;
}

export interface WorkoutSet {
  id: string;
  session_id: string;
  user_id: string;
  exercise: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_min: number | null;
}

export interface WorkoutSession {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  duration_min: number | null;
  logged_on: string;
  workout_sets?: WorkoutSet[];
}

/** A food search result normalized from Open Food Facts (per 100 g). */
export interface FoodSearchResult {
  id: string;
  name: string;
  brand: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}
