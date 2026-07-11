// Domain types + Zod schemas — single source of truth for BOTH the app (Metro)
// and the API (Deno). Contracts defined once here: change the schema and both
// sides type-error. (NWE-112; moved from lib/types.ts.)
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const sexSchema = z.enum(['male', 'female']);
export type Sex = z.infer<typeof sexSchema>;

export const activityLevelSchema = z.enum([
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
]);
export type ActivityLevel = z.infer<typeof activityLevelSchema>;

export const goalTypeSchema = z.enum(['lose', 'maintain', 'gain']);
export type GoalType = z.infer<typeof goalTypeSchema>;

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealType = z.infer<typeof mealTypeSchema>;

export const foodSourceSchema = z.enum(['manual', 'openfoodfacts', 'recipe', 'ai_photo']);
export type FoodSource = z.infer<typeof foodSourceSchema>;

// A device-local calendar day, YYYY-MM-DD (never a timestamp — see data-model.md #4).
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export const profileSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  sex: sexSchema.nullable(),
  birth_year: z.number().int().nullable(),
  height_cm: z.number().nullable(),
  activity_level: activityLevelSchema,
  goal_type: goalTypeSchema,
  target_weight_kg: z.number().nullable(),
  calorie_target: z.number().int().nullable(),
  protein_target_g: z.number().int().nullable(),
  carbs_target_g: z.number().int().nullable(),
  fat_target_g: z.number().int().nullable(),
  targets_locked: z.boolean(),
  water_target_ml: z.number().int(),
});
export type Profile = z.infer<typeof profileSchema>;

export const weightLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  weight_kg: z.number(),
  logged_on: isoDateSchema,
});
export type WeightLog = z.infer<typeof weightLogSchema>;

export const foodLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  food_name: z.string(),
  brand: z.string().nullable(),
  meal_type: mealTypeSchema,
  quantity_g: z.number(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  source: foodSourceSchema,
  source_id: z.string().nullable(),
  photo_path: z.string().nullable().optional(), // device-local filename (NWE-204)
  logged_on: isoDateSchema,
});
export type FoodLog = z.infer<typeof foodLogSchema>;

export const workoutSetSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  user_id: z.string().uuid(),
  exercise: z.string(),
  set_number: z.number().int(),
  reps: z.number().int().nullable(),
  weight_kg: z.number().nullable(),
  duration_min: z.number().nullable(),
});
export type WorkoutSet = z.infer<typeof workoutSetSchema>;

export const workoutSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  duration_min: z.number().int().nullable(),
  logged_on: isoDateSchema,
  workout_sets: z.array(workoutSetSchema).optional(),
});
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;

export const recipeItemSchema = z.object({
  id: z.string().uuid(),
  recipe_id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  quantity_g: z.number(),
  calories_per_100g: z.number(),
  protein_per_100g: z.number(),
  carbs_per_100g: z.number(),
  fat_per_100g: z.number(),
  position: z.number().int(),
});
export type RecipeItem = z.infer<typeof recipeItemSchema>;

export const recipeSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  servings: z.number(),
  recipe_items: z.array(recipeItemSchema).optional(),
});
export type Recipe = z.infer<typeof recipeSchema>;

export const favoriteFoodSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  brand: z.string().nullable(),
  calories_per_100g: z.number(),
  protein_per_100g: z.number(),
  carbs_per_100g: z.number(),
  fat_per_100g: z.number(),
  source: z.enum(['manual', 'openfoodfacts']),
  source_id: z.string().nullable(),
  last_quantity_g: z.number(),
});
export type FavoriteFood = z.infer<typeof favoriteFoodSchema>;

/** A distinct recently-logged food, most recent first (NWE-201). */
export const recentFoodSchema = z.object({
  food_name: z.string(),
  brand: z.string().nullable(),
  meal_type: mealTypeSchema,
  quantity_g: z.number(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  source: foodSourceSchema,
  source_id: z.string().nullable(),
});
export type RecentFood = z.infer<typeof recentFoodSchema>;

/** A food search result normalized from Open Food Facts (per 100 g). */
export const foodSearchResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  caloriesPer100g: z.number(),
  proteinPer100g: z.number(),
  carbsPer100g: z.number(),
  fatPer100g: z.number(),
});
export type FoodSearchResult = z.infer<typeof foodSearchResultSchema>;
