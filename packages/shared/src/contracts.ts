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

// Coaching profile (NWE-118) — stated intent the user gives their coach. Shape
// owned here (jsonb pattern); everything optional and length-capped. This is
// deliberately *loose*: it's the user's own words, injected into prompts, not a
// strict contract with a machine.
export const coachingProfileSchema = z.object({
  motivation: z.string().max(280).nullable().optional(),
  target_event: z
    .object({ name: z.string().min(1).max(120), date: isoDateSchema.nullable().optional() })
    .nullable()
    .optional(),
  preferences: z.array(z.string().min(1).max(80)).max(10).optional(),
  dislikes: z.array(z.string().min(1).max(80)).max(10).optional(),
  injuries: z.array(z.string().min(1).max(120)).max(10).optional(),
  coach_tone: z.enum(['gentle', 'balanced', 'direct']).optional(),
  // Nutrition side (NWE-121). allergies are a HARD safety constraint.
  dietary_style: z
    .enum(['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'halal', 'kosher', 'other'])
    .optional(),
  allergies: z.array(z.string().min(1).max(80)).max(15).optional(),
  disliked_foods: z.array(z.string().min(1).max(80)).max(15).optional(),
  meals_per_day: z.number().int().min(1).max(6).optional(),
  cook_time_pref: z.enum(['quick', 'moderate', 'any']).optional(),
});
export type CoachingProfile = z.infer<typeof coachingProfileSchema>;

// Coach memory (NWE-119) — rolling distilled summary. Hard cap keeps prompt cost
// flat forever. Cleared by writing {}.
export const COACH_MEMORY_MAX_CHARS = 1200;
export const coachMemorySchema = z.object({
  text: z.string().max(COACH_MEMORY_MAX_CHARS).default(''),
  updated_at: z.string().optional(),
});
export type CoachMemory = z.infer<typeof coachMemorySchema>;

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
  coaching_profile: coachingProfileSchema.optional(),
  // null clears the memory (server maps it to {}).
  coach_memory: coachMemorySchema.nullable().optional(),
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

// Loose-but-safe: a real coach writes "8-12", "AMRAP", "30s". Accept string OR
// number for reps/sets and coerce sensibly, so reliable AI output is never rejected
// on a formatting technicality. rationale optional (nice-to-have, not required).
const repsOrSets = z.union([z.number(), z.string()]).nullable().optional();
export const generatedProgramExerciseSchema = z.object({
  name: z.string().min(1),
  exercise_id: z.string().uuid().nullable().optional(),
  sets: repsOrSets,
  reps: repsOrSets,
  rest_seconds: z.number().nullable().optional(),
  rationale: z.string().optional().default(''),
});
export const generatedProgramDaySchema = z.object({
  name: z.string().min(1),
  rationale: z.string().optional().default(''),
  exercises: z.array(generatedProgramExerciseSchema).min(1),
});
export const generatedProgramSchema = z.object({
  title: z.string().min(1),
  days: z.array(generatedProgramDaySchema).min(1),
  notes: z.array(z.string()).optional().default([]),
});
export type GeneratedProgram = z.infer<typeof generatedProgramSchema>;

export const saveGeneratedProgramSchema = z.object({
  program: generatedProgramSchema,
});
export type SaveGeneratedProgramInput = z.infer<typeof saveGeneratedProgramSchema>;

// Program refinement chat (NWE-120) — chat-to-edit over the program artifact.
// Two-channel structured output: a prose reply ALWAYS; a revised program ONLY
// when the user asked for a change. Loose on the program side by design.
export const coachChatMessageSchema = z.object({
  role: z.enum(['user', 'coach']),
  text: z.string().min(1).max(2000),
});
export type CoachChatMessage = z.infer<typeof coachChatMessageSchema>;

export const refineProgramRequestSchema = z.object({
  insight_id: z.string().uuid(),
  message: z.string().min(1).max(600),
});
export type RefineProgramRequest = z.infer<typeof refineProgramRequestSchema>;

export const refineProgramResponseSchema = z.object({
  reply: z.string().min(1),
  updated_program: generatedProgramSchema.nullable().optional(),
});
export type RefineProgramResponse = z.infer<typeof refineProgramResponseSchema>;

/** Turns per draft cap — bounded worst-case Gemini cost (NWE-120 AC#3). */
export const REFINE_MAX_TURNS_PER_DRAFT = 20;

// ── AI meal planner (NWE-121) ────────────────────────────────────────────────
// Loose-but-safe, mirroring the program schema philosophy: accept what a real
// nutritionist writes, coerce for storage/logging at the edges.
const macrosLoose = z.object({
  calories: z.number().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
});
export const mealRecipeSchema = z.object({
  ingredients: z.array(z.string().min(1)).default([]),
  steps: z.array(z.string().min(1)).default([]),
});
export const plannedMealSchema = z.object({
  name: z.string().min(1),
  meal_type: mealTypeSchema,
  macros: macrosLoose,
  recipe: mealRecipeSchema.optional().default({ ingredients: [], steps: [] }),
  note: z.string().optional().default(''),
});
export type PlannedMeal = z.infer<typeof plannedMealSchema>;

export const mealPlanSchema = z.object({
  title: z.string().min(1),
  meals: z.array(plannedMealSchema).min(1),
  day_totals: macrosLoose.optional(),
  notes: z.array(z.string()).optional().default([]),
});
export type MealPlan = z.infer<typeof mealPlanSchema>;

export const generateMealPlanSchema = z.object({ date: isoDateSchema });

export const refineMealPlanRequestSchema = z.object({
  insight_id: z.string().uuid(),
  message: z.string().min(1).max(600),
});
export const refineMealPlanResponseSchema = z.object({
  reply: z.string().min(1),
  updated_plan: mealPlanSchema.nullable().optional(),
});
export type RefineMealPlanResponse = z.infer<typeof refineMealPlanResponseSchema>;

export const logPlannedMealSchema = z.object({
  insight_id: z.string().uuid(),
  meal_index: z.number().int().min(0),
  logged_on: isoDateSchema,
});

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
