// API request contracts — Zod schemas the API validates with and the app builds
// requests against. Defined once here so a contract change type-errors both sides.
// (NWE-114.)
import { z } from 'zod';

import {
  activityLevelSchema,
  goalTypeSchema,
  isoDateSchema,
  mealTypeSchema,
  sexSchema,
} from './types.ts';

// PATCH /me — all fields optional (partial update). Targets are recomputed
// server-side from body stats + latest weight unless targets_locked (NWE-404).
export const updateProfileSchema = z.object({
  display_name: z.string().nullable().optional(),
  sex: sexSchema.nullable().optional(),
  birth_year: z.number().int().min(1900).max(2100).nullable().optional(),
  height_cm: z.number().positive().nullable().optional(),
  activity_level: activityLevelSchema.optional(),
  goal_type: goalTypeSchema.optional(),
  target_weight_kg: z.number().positive().nullable().optional(),
  water_target_ml: z.number().int().positive().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// PUT /weights/:date
export const upsertWeightSchema = z.object({
  weight_kg: z.number().positive(),
});
export type UpsertWeightInput = z.infer<typeof upsertWeightSchema>;

// GET /weights?from&to
export const weightRangeQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

// Food logs
export const createFoodLogSchema = z.object({
  food_name: z.string().min(1),
  brand: z.string().nullable().optional(),
  meal_type: mealTypeSchema,
  quantity_g: z.number().positive(),
  calories: z.number().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  source: z.enum(['manual', 'openfoodfacts']).default('manual'),
  source_id: z.string().nullable().optional(),
  photo_path: z.string().nullable().optional(), // device-local filename only (NWE-204)
  logged_on: isoDateSchema,
});
export type CreateFoodLogInput = z.infer<typeof createFoodLogSchema>;

// PATCH /food-logs/:id (NWE-205). Searched/AI entries: send quantity_g (+ optional
// meal_type) → server rescales macros from stored values. Manual entries: send
// name/macros directly. All fields optional; the server decides based on source.
export const updateFoodLogSchema = z.object({
  food_name: z.string().min(1).optional(),
  meal_type: mealTypeSchema.optional(),
  quantity_g: z.number().positive().optional(),
  calories: z.number().min(0).optional(),
  protein_g: z.number().min(0).optional(),
  carbs_g: z.number().min(0).optional(),
  fat_g: z.number().min(0).optional(),
  photo_path: z.string().nullable().optional(), // set/clear the local photo (NWE-204)
});
export type UpdateFoodLogInput = z.infer<typeof updateFoodLogSchema>;

export const dayQuerySchema = z.object({ date: isoDateSchema });

// Water (NWE-203). Each add is one row; undo deletes the newest of the day.
export const addWaterSchema = z.object({
  ml: z.number().int().positive().max(2000),
  logged_on: isoDateSchema,
});
export type AddWaterInput = z.infer<typeof addWaterSchema>;

// Foods search
export const foodSearchQuerySchema = z.object({ q: z.string().min(1) });

// Favorites (NWE-201)
export const createFavoriteSchema = z.object({
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  calories_per_100g: z.number().min(0),
  protein_per_100g: z.number().min(0),
  carbs_per_100g: z.number().min(0),
  fat_per_100g: z.number().min(0),
  source: z.enum(['manual', 'openfoodfacts']).default('manual'),
  source_id: z.string().nullable().optional(),
  last_quantity_g: z.number().positive().default(100),
});
export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;

// Recipes (NWE-202) — CRUD with nested items.
export const recipeItemInputSchema = z.object({
  name: z.string().min(1),
  quantity_g: z.number().positive(),
  calories_per_100g: z.number().min(0),
  protein_per_100g: z.number().min(0),
  carbs_per_100g: z.number().min(0),
  fat_per_100g: z.number().min(0),
});
export const upsertRecipeSchema = z.object({
  name: z.string().min(1),
  servings: z.number().positive(),
  items: z.array(recipeItemInputSchema).min(1),
});
export type UpsertRecipeInput = z.infer<typeof upsertRecipeSchema>;

// Logging a recipe: which recipe + how many servings (multiplier).
export const logRecipeSchema = z.object({
  meal_type: mealTypeSchema,
  servings: z.number().positive(),
  logged_on: isoDateSchema,
});
export type LogRecipeInput = z.infer<typeof logRecipeSchema>;

// Workout sessions (+ nested sets)
export const workoutSetInputSchema = z.object({
  exercise: z.string().min(1),
  set_number: z.number().int().positive(),
  reps: z.number().int().min(0).nullable().optional(),
  weight_kg: z.number().min(0).nullable().optional(),
});
export const createWorkoutSessionSchema = z.object({
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  duration_min: z.number().int().min(0).nullable().optional(),
  logged_on: isoDateSchema,
  sets: z.array(workoutSetInputSchema).default([]),
});
export type CreateWorkoutSessionInput = z.infer<typeof createWorkoutSessionSchema>;

export const sessionRangeQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
