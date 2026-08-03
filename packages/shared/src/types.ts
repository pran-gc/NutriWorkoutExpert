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

export const exerciseMuscleGroupSchema = z.enum([
  'chest',
  'back',
  'shoulders',
  'legs',
  'arms',
  'core',
  'full_body',
  'cardio',
]);
export type ExerciseMuscleGroup = z.infer<typeof exerciseMuscleGroupSchema>;

export const exerciseKindSchema = z.enum(['strength', 'cardio']);
export type ExerciseKind = z.infer<typeof exerciseKindSchema>;

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
  // Set once the user finishes or skips onboarding (NWE bugfix) — the redirect
  // guard keys off this so the wizard shows exactly once. Nullable for old rows.
  onboarding_completed_at: z.string().nullable().optional(),
  notification_prefs: z.record(z.unknown()).optional(),
  // jsonb columns — shapes owned by coachingProfileSchema / coachMemorySchema in
  // contracts.ts; kept loose here so row parsing never rejects older rows.
  coaching_profile: z.record(z.unknown()).optional(),
  coach_memory: z.record(z.unknown()).optional(),
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
  ingredients: z.array(z.record(z.unknown())).nullable().optional(),
  logged_on: isoDateSchema,
});
export type FoodLog = z.infer<typeof foodLogSchema>;

export const workoutSetSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  user_id: z.string().uuid(),
  exercise_id: z.string().uuid().nullable().optional(),
  exercise: z.string(),
  set_number: z.number().int(),
  reps: z.number().int().nullable(),
  weight_kg: z.number().nullable(),
  duration_min: z.number().nullable(),
  distance_km: z.number().nullable().optional(),
});
export type WorkoutSet = z.infer<typeof workoutSetSchema>;

export const workoutSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  duration_min: z.number().int().nullable(),
  routine_id: z.string().uuid().nullable().optional(),
  logged_on: isoDateSchema,
  workout_sets: z.array(workoutSetSchema).optional(),
});
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  name: z.string(),
  muscle_group: exerciseMuscleGroupSchema,
  kind: exerciseKindSchema,
});
export type Exercise = z.infer<typeof exerciseSchema>;

export const routineExerciseSchema = z.object({
  id: z.string().uuid(),
  routine_id: z.string().uuid(),
  user_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  position: z.number().int(),
  target_sets: z.number().int(),
  target_reps: z.number().int().nullable(),
  exercise: exerciseSchema.optional(),
});
export type RoutineExercise = z.infer<typeof routineExerciseSchema>;

export const routineSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  notes: z.string().nullable(),
  source: z.enum(['user', 'ai']),
  routine_exercises: z.array(routineExerciseSchema).optional(),
});
export type Routine = z.infer<typeof routineSchema>;

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

export const insightKindSchema = z.enum(['weekly', 'council', 'physique', 'training', 'checkin']);
export type InsightKind = z.infer<typeof insightKindSchema>;

export const insightSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  kind: insightKindSchema,
  week_start: isoDateSchema.nullable(),
  detector: z.string().nullable(),
  content: z.string(),
  payload: z.record(z.unknown()).nullable(),
  model: z.string(),
  prompt_version: z.string(),
  read_at: z.string().nullable(),
  applied_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Insight = z.infer<typeof insightSchema>;

export const notificationPrefsSchema = z.object({
  enabled: z.boolean().default(false),
  meal_reminders: z.boolean().default(false),
  weigh_in_reminders: z.boolean().default(false),
  weekly_review: z.boolean().default(true),
  meal_times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).default(['08:00', '13:00', '19:00']),
  weigh_in_time: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  quiet_hours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/).default('21:00'),
    end: z.string().regex(/^\d{2}:\d{2}$/).default('07:00'),
  }).default({ start: '21:00', end: '07:00' }),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const earnedBadgeSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  badge_id: z.string(),
  earned_at: z.string(),
  seen_at: z.string().nullable(),
});
export type EarnedBadge = z.infer<typeof earnedBadgeSchema>;
