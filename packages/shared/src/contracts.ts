// API request contracts — Zod schemas the API validates with and the app builds
// requests against. Defined once here so a contract change type-errors both sides.
// (NWE-114.)
import { z } from 'zod';

import {
  activityLevelSchema,
  exerciseKindSchema,
  exerciseMuscleGroupSchema,
  goalTypeSchema,
  notificationPrefsSchema,
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
  targets_locked: z.boolean().optional(),
  calorie_target: z.number().int().positive().nullable().optional(),
  protein_target_g: z.number().int().min(0).nullable().optional(),
  carbs_target_g: z.number().int().min(0).nullable().optional(),
  fat_target_g: z.number().int().min(0).nullable().optional(),
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
  source: z.enum(['manual', 'openfoodfacts', 'recipe', 'ai_photo']).default('manual'),
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
  exercise_id: z.string().uuid().nullable().optional(),
  set_number: z.number().int().positive(),
  reps: z.number().int().min(0).nullable().optional(),
  weight_kg: z.number().min(0).nullable().optional(),
  duration_min: z.number().min(0).nullable().optional(),
  distance_km: z.number().min(0).nullable().optional(),
});
export const createWorkoutSessionSchema = z.object({
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  duration_min: z.number().int().min(0).nullable().optional(),
  routine_id: z.string().uuid().nullable().optional(),
  logged_on: isoDateSchema,
  sets: z.array(workoutSetInputSchema).default([]),
});
export type CreateWorkoutSessionInput = z.infer<typeof createWorkoutSessionSchema>;

export const updateWorkoutSessionSchema = createWorkoutSessionSchema.partial().extend({
  sets: z.array(workoutSetInputSchema.extend({ id: z.string().uuid().optional() })).optional(),
});
export type UpdateWorkoutSessionInput = z.infer<typeof updateWorkoutSessionSchema>;

export const sessionRangeQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

// Exercises (NWE-301)
export const exerciseSearchQuerySchema = z.object({ q: z.string().optional() });
export const createExerciseSchema = z.object({
  name: z.string().min(1),
  muscle_group: exerciseMuscleGroupSchema,
  kind: exerciseKindSchema.default('strength'),
});
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const exerciseHistoryQuerySchema = z.object({
  range: z.enum(['30', '90', 'all']).default('90').optional(),
});

// Routines (NWE-302)
export const routineExerciseInputSchema = z.object({
  exercise_id: z.string().uuid(),
  position: z.number().int().min(0),
  target_sets: z.number().int().positive(),
  target_reps: z.number().int().positive().nullable().optional(),
});
export const upsertRoutineSchema = z.object({
  name: z.string().min(1),
  notes: z.string().nullable().optional(),
  exercises: z.array(routineExerciseInputSchema).default([]),
});
export type UpsertRoutineInput = z.infer<typeof upsertRoutineSchema>;

// Analytics
export const analyticsRangeQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
});

// Insights (Epic 5)
export const weeklySummaryQuerySchema = z.object({ week: isoDateSchema.optional() });
export const generateInsightSchema = z.object({ week: isoDateSchema.optional() });
export type GenerateInsightInput = z.infer<typeof generateInsightSchema>;

export const analyzePhysiqueSchema = z.object({
  week: isoDateSchema.optional(),
  consent: z.literal(true),
  notes: z.string().max(500).optional(),
  photos: z.array(z.string().min(1)).min(1).max(2), // base64 data URLs; never persisted
});
export type AnalyzePhysiqueInput = z.infer<typeof analyzePhysiqueSchema>;

export const deleteInsightParamSchema = z.object({ id: z.string().uuid() });

export const aiConsentSchema = z.object({
  physique: z.boolean().default(false),
  free_tier_acknowledged: z.boolean().default(false),
  updated_at: z.string().optional(),
});
export type AiConsent = z.infer<typeof aiConsentSchema>;
export const updateAiConsentSchema = aiConsentSchema.partial();
export type UpdateAiConsentInput = z.infer<typeof updateAiConsentSchema>;

const aiIngredientSchema = z.object({
  name: z.string().min(1),
  quantity_g: z.number().positive(),
  calories: z.number().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  estimated: z.boolean().default(true),
});
export const aiMealCandidateSchema = z.object({
  id: z.string().min(1),
  dish_name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  estimated_calories: z.number().min(0),
  ingredients: z.array(aiIngredientSchema).min(1),
});
export type AiMealCandidate = z.infer<typeof aiMealCandidateSchema>;

export const analyzeFoodPhotoSchema = z.object({
  photo: z.string().min(1),
  logged_on: isoDateSchema,
});
export type AnalyzeFoodPhotoInput = z.infer<typeof analyzeFoodPhotoSchema>;

export const resolveFoodSchema = z.object({
  dish_name: z.string().min(1),
  ingredients: z.array(z.object({ name: z.string().min(1), quantity_g: z.number().positive() })).min(1),
});
export type ResolveFoodInput = z.infer<typeof resolveFoodSchema>;
export const resolvedIngredientSchema = aiIngredientSchema.extend({
  source: z.enum(['usda', 'openfoodfacts', 'ai_estimate']),
});
export type ResolvedIngredient = z.infer<typeof resolvedIngredientSchema>;

export const workoutProgramQuestionnaireSchema = z.object({
  goal: z.string().min(1),
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
  days_per_week: z.number().int().min(1).max(7),
  equipment: z.array(z.string().min(1)).min(1),
  constraints: z.string().max(800).optional(),
  adjustment: z.string().max(500).optional(),
});
export type WorkoutProgramQuestionnaire = z.infer<typeof workoutProgramQuestionnaireSchema>;

export const generatedProgramExerciseSchema = z.object({
  name: z.string().min(1),
  exercise_id: z.string().uuid().nullable().optional(),
  sets: z.number().int().positive(),
  reps: z.number().int().positive().nullable().optional(),
  rationale: z.string().min(1),
});
export const generatedProgramDaySchema = z.object({
  name: z.string().min(1),
  rationale: z.string().min(1),
  exercises: z.array(generatedProgramExerciseSchema).min(1),
});
export const generatedProgramSchema = z.object({
  title: z.string().min(1),
  days: z.array(generatedProgramDaySchema).min(1),
  notes: z.array(z.string()).default([]),
});
export type GeneratedProgram = z.infer<typeof generatedProgramSchema>;

export const saveGeneratedProgramSchema = z.object({
  program: generatedProgramSchema,
});
export type SaveGeneratedProgramInput = z.infer<typeof saveGeneratedProgramSchema>;

export const routineDiffSchema = z.object({
  title: z.string(),
  reason: z.string(),
  changes: z.array(z.object({
    type: z.enum(['add', 'remove', 'change']),
    exercise: z.string(),
    detail: z.string(),
  })),
});
export type RoutineDiff = z.infer<typeof routineDiffSchema>;

export const detectorQuerySchema = z.object({ date: isoDateSchema.optional() });

export const councilProposalSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('target_diff'),
    target: z.enum(['calorie_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g', 'water_target_ml']),
    label: z.string(),
    current: z.number().nullable(),
    proposed: z.number(),
    unit: z.string(),
  }),
  z.object({
    type: z.literal('diet_suggestion'),
    label: z.string(),
    detail: z.string(),
  }),
  z.object({
    type: z.literal('training_focus'),
    label: z.string(),
    detail: z.string(),
  }),
]);
export type CouncilProposal = z.infer<typeof councilProposalSchema>;
export const councilTargetDiffProposalSchema = z.object({
  type: z.literal('target_diff'),
  target: z.enum(['calorie_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g', 'water_target_ml']),
  label: z.string(),
  current: z.number().nullable(),
  proposed: z.number(),
  unit: z.string(),
});
export type CouncilTargetDiffProposal = z.infer<typeof councilTargetDiffProposalSchema>;

export const applyCouncilProposalParamSchema = z.object({ id: z.string().uuid() });
export const applyCouncilProposalSchema = z.object({
  proposal: councilTargetDiffProposalSchema,
});
export type ApplyCouncilProposalInput = z.infer<typeof applyCouncilProposalSchema>;

export const councilPlanSchema = z.object({
  headline: z.string().min(1),
  coaches: z.object({
    goal: z.object({ summary: z.string().min(1), proposals: z.array(councilProposalSchema).default([]) }),
    nutrition: z.object({ summary: z.string().min(1), proposals: z.array(councilProposalSchema).default([]) }),
    training: z.object({ summary: z.string().min(1), proposals: z.array(councilProposalSchema).default([]) }),
  }),
  checkins: z.array(z.object({ detector: z.string(), message: z.string() })).default([]),
});
export type CouncilPlan = z.infer<typeof councilPlanSchema>;

// Notifications (Epic 6)
export const updateNotificationPrefsSchema = notificationPrefsSchema.partial();
export type UpdateNotificationPrefsInput = z.infer<typeof updateNotificationPrefsSchema>;

export const registerPushTokenSchema = z.object({
  expo_token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
  device_name: z.string().nullable().optional(),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const dateQuerySchema = z.object({ date: isoDateSchema.optional() });
