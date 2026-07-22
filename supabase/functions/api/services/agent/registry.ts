import { z, type ZodType } from 'zod';

import {
  ASSISTANT_MAX_RANGE_DAYS,
  ASSISTANT_MAX_ROWS,
  daysArgsSchema,
  emptyToolArgsSchema,
  exerciseHistoryArgsSchema,
  exerciseSessionHistory,
  foodAnalytics,
  getFoodLogsArgsSchema,
  getRecipeArgsSchema,
  getWorkoutsArgsSchema,
  resolveMacrosArgsSchema,
  richFoodLogsProposalSchema,
  mealPlanProposalSchema,
  programRevisionProposalSchema,
  recipeProposalSchema,
  searchFoodsArgsSchema,
  trainingAnalytics,
  targetChangeProposalSchema,
  workoutLogProposalSchema,
} from '../../../_shared/index.ts';
import { HttpError } from '../../middleware/error.ts';
import { resolveIngredients } from '../gemini.ts';
import { searchFoods } from '../openfoodfacts.ts';
import type { Env } from '../../types.ts';

export type JsonSchema = Record<string, unknown>;

export interface ToolContext {
  db: Env['Variables']['db'];
  userId: string;
}

export interface ToolDef {
  type: 'function';
  name: string;
  description: string;
  parameters: JsonSchema;
  kind: 'read' | 'proposal';
  args: ZodType<unknown>;
  limits: { maxRows: number; maxRangeDays: number };
  run(ctx: ToolContext, args: unknown): Promise<unknown>;
}

export type ReadToolDef = ToolDef & { kind: 'read' };
export type ProposalToolDef = ToolDef & { kind: 'proposal' };
export type ToolRegistry = Record<string, ToolDef>;
export type ReadToolRegistry = Record<string, ReadToolDef>;

function defineTool<A>(definition: Omit<ReadToolDef, 'args' | 'run'> & {
  args: ZodType<A>;
  run(ctx: ToolContext, args: A): Promise<unknown>;
}): ReadToolDef {
  return definition as ReadToolDef;
}

function defineProposal(definition: Omit<ProposalToolDef, 'args' | 'run'> & {
  args: ZodType<unknown>;
}): ProposalToolDef {
  return { ...definition, run: async (_ctx, args) => args } as ProposalToolDef;
}

const limits = { maxRows: ASSISTANT_MAX_ROWS, maxRangeDays: ASSISTANT_MAX_RANGE_DAYS };
const emptyParameters = { type: 'object', properties: {}, additionalProperties: false };
const daysParameters = {
  type: 'object', additionalProperties: false,
  properties: { days: { type: 'integer', minimum: 1, maximum: ASSISTANT_MAX_RANGE_DAYS, default: 90 } },
};
const dateRangeParameters = {
  type: 'object', additionalProperties: false,
  properties: {
    from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' },
    limit: { type: 'integer', minimum: 1, maximum: ASSISTANT_MAX_ROWS, default: 100 },
  },
  required: ['from', 'to'],
};

const shortText = { type: 'string', minLength: 1, maxLength: 120 };
const proposalProperties = {
  title: { type: 'string', minLength: 1, maxLength: 120 },
  summary: { type: 'string', maxLength: 280 },
  supersedes_insight_id: { type: 'string', format: 'uuid' },
};
const macrosParameters = {
  type: 'object', additionalProperties: false, required: ['calories', 'protein_g', 'carbs_g', 'fat_g'],
  properties: {
    calories: { type: 'number', minimum: 0 }, protein_g: { type: 'number', minimum: 0 },
    carbs_g: { type: 'number', minimum: 0 }, fat_g: { type: 'number', minimum: 0 },
  },
};
const micronutrientsParameters = {
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(['fiber_g', 'sugar_g', 'saturated_fat_g', 'sodium_mg', 'potassium_mg', 'calcium_mg', 'iron_mg', 'vitamin_c_mg']
    .map((name) => [name, { type: 'number', minimum: 0 }])),
};
const ingredientParameters = {
  type: 'object', additionalProperties: false,
  required: ['name', 'quantity_g', 'calories_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g', 'source'],
  properties: {
    name: shortText, quantity_g: { type: 'number', minimum: 0, maximum: 10_000 },
    calories_per_100g: { type: 'number', minimum: 0, maximum: 10_000 },
    protein_per_100g: { type: 'number', minimum: 0, maximum: 1_000 },
    carbs_per_100g: { type: 'number', minimum: 0, maximum: 1_000 },
    fat_per_100g: { type: 'number', minimum: 0, maximum: 1_000 },
    source: { type: 'string', enum: ['usda', 'openfoodfacts', 'estimated'] },
    source_id: { type: 'string' }, fdc_id: { type: 'integer', minimum: 1 },
    micronutrients_per_100g: micronutrientsParameters,
  },
};
const targetProperties = {
  calorie_target: { type: 'integer', minimum: 1 }, protein_target_g: { type: 'integer', minimum: 0 },
  carbs_target_g: { type: 'integer', minimum: 0 }, fat_target_g: { type: 'integer', minimum: 0 },
  water_target_ml: { type: 'integer', minimum: 1 },
};

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date.toISOString().slice(0, 10);
}

function publicWorkout(row: Record<string, unknown>) {
  const sets = Array.isArray(row.workout_sets) ? row.workout_sets : [];
  return {
    title: row.title,
    notes: row.notes,
    duration_min: row.duration_min,
    logged_on: row.logged_on,
    sets: sets.slice(0, ASSISTANT_MAX_ROWS).map((set) => {
      const value = set as Record<string, unknown>;
      return {
        exercise: value.exercise, set_number: value.set_number, reps: value.reps,
        weight_kg: value.weight_kg, duration_min: value.duration_min, distance_km: value.distance_km,
      };
    }),
  };
}

export function createReadToolRegistry(): ReadToolRegistry {
  return {
    get_profile_and_targets: defineTool({
      type: 'function', name: 'get_profile_and_targets', kind: 'read', limits,
      description: 'Use when body stats, goal, nutrition targets, dietary preferences, allergies, injuries, or coaching preferences are needed.',
      parameters: emptyParameters, args: emptyToolArgsSchema,
      run: async ({ db, userId }) => {
        const { data, error } = await db.from('profiles').select(
          'display_name, sex, birth_year, height_cm, activity_level, goal_type, target_weight_kg, calorie_target, protein_target_g, carbs_target_g, fat_target_g, water_target_ml, targets_locked, coaching_profile'
        ).eq('id', userId).single();
        if (error || !data) throw new HttpError('INTERNAL', 'Could not load profile context.');
        return data;
      },
    }),
    get_workout_trends: defineTool({
      type: 'function', name: 'get_workout_trends', kind: 'read', limits,
      description: 'Use for aggregate training consistency, volume, cardio, and recent personal-best trends before drilling into individual workouts.',
      parameters: daysParameters, args: daysArgsSchema,
      run: async ({ db, userId }, { days }) => {
        const from = isoDaysAgo(days ?? 90);
        const [{ data: sessions, error }, { data: exercises, error: exerciseError }] = await Promise.all([
          db.from('workout_sessions').select('*, workout_sets(*)').eq('user_id', userId).gte('logged_on', from).order('logged_on').limit(ASSISTANT_MAX_ROWS),
          db.from('exercises').select('id, name, muscle_group, kind').limit(ASSISTANT_MAX_ROWS),
        ]);
        if (error || exerciseError) throw new HttpError('INTERNAL', 'Could not load workout trends.');
        const meta = Object.fromEntries((exercises ?? []).map((row) => [row.id, { name: row.name, muscle_group: row.muscle_group, kind: row.kind }]));
        return trainingAnalytics(sessions ?? [], meta);
      },
    }),
    get_workouts: defineTool({
      type: 'function', name: 'get_workouts', kind: 'read', limits,
      description: 'Use to inspect specific workouts in a bounded date range after aggregate trends suggest a useful drill-down.',
      parameters: dateRangeParameters, args: getWorkoutsArgsSchema,
      run: async ({ db, userId }, { from, to, limit }) => {
        const { data, error } = await db.from('workout_sessions')
          .select('title, notes, duration_min, logged_on, workout_sets(exercise, set_number, reps, weight_kg, duration_min, distance_km)')
          .eq('user_id', userId).gte('logged_on', from).lte('logged_on', to).order('logged_on', { ascending: false }).limit(limit ?? 100);
        if (error) throw new HttpError('INTERNAL', 'Could not load workouts.');
        return (data ?? []).map((row) => publicWorkout(row as Record<string, unknown>));
      },
    }),
    get_exercise_history: defineTool({
      type: 'function', name: 'get_exercise_history', kind: 'read', limits,
      description: 'Use for progression history of one known exercise ID, including estimated strength and volume.',
      parameters: { type: 'object', additionalProperties: false, properties: { exercise_id: { type: 'string', format: 'uuid' } }, required: ['exercise_id'] },
      args: exerciseHistoryArgsSchema,
      run: async ({ db, userId }, { exercise_id }) => {
        const from = isoDaysAgo(ASSISTANT_MAX_RANGE_DAYS);
        const { data, error } = await db.from('workout_sessions').select('*, workout_sets(*)')
          .eq('user_id', userId).gte('logged_on', from).not('workout_sets.exercise_id', 'is', null).order('logged_on').limit(ASSISTANT_MAX_ROWS);
        if (error) throw new HttpError('INTERNAL', 'Could not load exercise history.');
        return exerciseSessionHistory(data ?? [], exercise_id).slice(-ASSISTANT_MAX_ROWS);
      },
    }),
    get_routines: defineTool({
      type: 'function', name: 'get_routines', kind: 'read', limits,
      description: 'Use when the current planned workout structure or exercise prescriptions matter.',
      parameters: emptyParameters, args: emptyToolArgsSchema,
      run: async ({ db, userId }) => {
        const { data, error } = await db.from('routines').select('name, notes, updated_at, routine_exercises(position, target_sets, target_reps, exercise:exercises(name, muscle_group, kind))')
          .eq('user_id', userId).order('updated_at', { ascending: false }).limit(ASSISTANT_MAX_ROWS);
        if (error) throw new HttpError('INTERNAL', 'Could not load routines.');
        return data ?? [];
      },
    }),
    get_food_logs: defineTool({
      type: 'function', name: 'get_food_logs', kind: 'read', limits,
      description: 'Use to inspect meals already logged for one day or a bounded date range. Never infer unlogged meals.',
      parameters: {
        type: 'object',
        oneOf: [
          { type: 'object', additionalProperties: false, properties: { date: { type: 'string', format: 'date' } }, required: ['date'] },
          { type: 'object', additionalProperties: false, properties: { from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' } }, required: ['from', 'to'] },
        ],
      },
      args: getFoodLogsArgsSchema,
      run: async ({ db, userId }, args) => {
        let query = db.from('food_logs').select('food_name, brand, meal_type, quantity_g, calories, protein_g, carbs_g, fat_g, source, logged_on').eq('user_id', userId);
        if ('date' in args && args.date) query = query.eq('logged_on', args.date);
        else if ('from' in args) query = query.gte('logged_on', args.from).lte('logged_on', args.to);
        const { data, error } = await query.order('logged_on', { ascending: false }).limit(ASSISTANT_MAX_ROWS);
        if (error) throw new HttpError('INTERNAL', 'Could not load food logs.');
        return data ?? [];
      },
    }),
    get_nutrition_trends: defineTool({
      type: 'function', name: 'get_nutrition_trends', kind: 'read', limits,
      description: 'Use for aggregate calorie, macro, meal-type, and commonly logged food trends.',
      parameters: daysParameters, args: daysArgsSchema,
      run: async ({ db, userId }, { days }) => {
        const from = isoDaysAgo(days ?? 90);
        const [{ data: logs, error }, { data: profile, error: profileError }] = await Promise.all([
          db.from('food_logs').select('*').eq('user_id', userId).gte('logged_on', from).order('logged_on').limit(ASSISTANT_MAX_ROWS),
          db.from('profiles').select('calorie_target, protein_target_g, carbs_target_g, fat_target_g').eq('id', userId).single(),
        ]);
        if (error || profileError) throw new HttpError('INTERNAL', 'Could not load nutrition trends.');
        return foodAnalytics(logs ?? [], {
          calories: profile?.calorie_target ?? null, protein_g: profile?.protein_target_g ?? null,
          carbs_g: profile?.carbs_target_g ?? null, fat_g: profile?.fat_target_g ?? null,
        });
      },
    }),
    get_weight_trend: defineTool({
      type: 'function', name: 'get_weight_trend', kind: 'read', limits,
      description: 'Use when recent weight direction or pace is relevant; treat sparse data cautiously and avoid medical conclusions.',
      parameters: daysParameters, args: daysArgsSchema,
      run: async ({ db, userId }, { days }) => {
        const { data, error } = await db.from('weight_logs').select('weight_kg, logged_on').eq('user_id', userId)
          .gte('logged_on', isoDaysAgo(days ?? 90)).order('logged_on').limit(ASSISTANT_MAX_ROWS);
        if (error) throw new HttpError('INTERNAL', 'Could not load weight trend.');
        const rows = data ?? [];
        const delta_kg = rows.length > 1 ? Number(rows.at(-1)?.weight_kg) - Number(rows[0].weight_kg) : null;
        return { entries: rows, delta_kg: delta_kg == null ? null : Math.round(delta_kg * 10) / 10 };
      },
    }),
    get_coach_memory: defineTool({
      type: 'function', name: 'get_coach_memory', kind: 'read', limits,
      description: 'Use to maintain continuity with durable coaching preferences and lessons from earlier reviews.',
      parameters: emptyParameters, args: emptyToolArgsSchema,
      run: async ({ db, userId }) => {
        const { data, error } = await db.from('profiles').select('coach_memory').eq('id', userId).single();
        if (error) throw new HttpError('INTERNAL', 'Could not load coach memory.');
        return data?.coach_memory ?? {};
      },
    }),
    get_recipes: defineTool({
      type: 'function', name: 'get_recipes', kind: 'read', limits,
      description: 'Use when the user asks about saved recipes or wants to log, adapt, or reuse one. Returns capped recipes with ingredient bases.',
      parameters: emptyParameters, args: emptyToolArgsSchema,
      run: async ({ db, userId }) => {
        const { data, error } = await db.from('recipes').select('id, name, servings, updated_at, recipe_items(name, quantity_g, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)')
          .eq('user_id', userId).order('updated_at', { ascending: false }).limit(ASSISTANT_MAX_ROWS);
        if (error) throw new HttpError('INTERNAL', 'Could not load recipes.');
        return data ?? [];
      },
    }),
    get_recipe: defineTool({
      type: 'function', name: 'get_recipe', kind: 'read', limits,
      description: 'Use after get_recipes when one specific saved recipe needs its full ingredient detail.',
      parameters: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] }, args: getRecipeArgsSchema,
      run: async ({ db, userId }, { id }) => {
        const { data, error } = await db.from('recipes').select('id, name, servings, updated_at, recipe_items(name, quantity_g, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)')
          .eq('id', id).eq('user_id', userId).maybeSingle();
        if (error) throw new HttpError('INTERNAL', 'Could not load recipe.');
        if (!data) throw new HttpError('NOT_FOUND', 'Recipe not found.');
        return data;
      },
    }),
    search_foods: defineTool({
      type: 'function', name: 'search_foods', kind: 'read', limits,
      description: 'Use to search packaged foods and per-100g nutrition when the user names a product or brand.',
      parameters: { type: 'object', additionalProperties: false, properties: { q: { type: 'string', minLength: 1, maxLength: 120 } }, required: ['q'] },
      args: searchFoodsArgsSchema, run: async (_ctx, { q }) => (await searchFoods(q)).slice(0, ASSISTANT_MAX_ROWS),
    }),
    resolve_macros: defineTool({
      type: 'function', name: 'resolve_macros', kind: 'read', limits,
      description: 'Use to estimate macros for explicitly named food items and gram quantities. Results can be estimates and must be described as such.',
      parameters: {
        type: 'object', additionalProperties: false, properties: { items: { type: 'array', minItems: 1, maxItems: 50, items: {
          type: 'object', additionalProperties: false, properties: { name: shortText, quantity_g: { type: 'number', exclusiveMinimum: 0, maximum: 10000 } }, required: ['name', 'quantity_g'],
        } } }, required: ['items'],
      },
      args: resolveMacrosArgsSchema, run: async (_ctx, { items }) => resolveIngredients(items),
    }),
  };
}

const toolProposalBaseShape = {
  title: z.string().trim().min(1).max(120), summary: z.string().trim().max(280).optional(),
  supersedes_insight_id: z.string().uuid().optional(),
};
const toolMicronutrientsSchema = z.object({
  fiber_g: z.number().min(0).optional(), sugar_g: z.number().min(0).optional(),
  saturated_fat_g: z.number().min(0).optional(), sodium_mg: z.number().min(0).optional(),
  potassium_mg: z.number().min(0).optional(), calcium_mg: z.number().min(0).optional(),
  iron_mg: z.number().min(0).optional(), vitamin_c_mg: z.number().min(0).optional(),
}).strict();
const toolIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120), quantity_g: z.number().min(0).max(10_000),
  calories_per_100g: z.number().min(0).max(10_000), protein_per_100g: z.number().min(0).max(1_000),
  carbs_per_100g: z.number().min(0).max(1_000), fat_per_100g: z.number().min(0).max(1_000),
  source: z.enum(['usda', 'openfoodfacts', 'estimated']), source_id: z.string().optional(),
  fdc_id: z.number().int().positive().optional(), micronutrients_per_100g: toolMicronutrientsSchema.optional(),
}).strict();
const coachQuantitySchema = z.union([
  z.number().positive().max(10_000), z.string().trim().min(1).max(40),
]);
const programRevisionToolArgsSchema = z.object({
  ...toolProposalBaseShape, routine_id: z.string().uuid(),
  days: z.array(z.object({
    name: z.string().trim().min(1).max(120), rationale: z.string().max(500).optional(),
    exercises: z.array(z.object({
      name: z.string().trim().min(1).max(120), exercise_id: z.string().uuid().optional(),
      sets: coachQuantitySchema, reps: coachQuantitySchema,
      rest_seconds: z.number().min(0).max(3_600).optional(), rationale: z.string().max(500).optional(),
    }).strict()).min(1).max(30),
  }).strict()).min(1).max(7),
  notes: z.array(z.string().max(240)).max(12).optional(),
}).strict().transform((input) => programRevisionProposalSchema.parse({ ...input, kind: 'program_revision' }));
const toolMacrosSchema = z.object({
  calories: z.number().min(0), protein_g: z.number().min(0), carbs_g: z.number().min(0), fat_g: z.number().min(0),
}).strict();
const mealPlanToolArgsSchema = z.object({
  ...toolProposalBaseShape, date: z.string().date(),
  meals: z.array(z.object({
    name: z.string().trim().min(1).max(120), meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    macros: toolMacrosSchema,
    recipe: z.object({
      ingredients: z.array(z.string().trim().min(1).max(240)).max(50),
      steps: z.array(z.string().trim().min(1).max(500)).max(30),
    }).strict(),
    note: z.string().max(500).optional(),
  }).strict()).min(1).max(12),
  notes: z.array(z.string().max(240)).max(12).optional(),
}).strict().transform((input) => mealPlanProposalSchema.parse({ ...input, kind: 'meal_plan' }));
const foodLogsToolArgsSchema = z.object({
  ...toolProposalBaseShape,
  entries: z.array(z.object({
    food_name: z.string().trim().min(1).max(120), brand: z.string().max(120).optional(),
    meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']), quantity_g: z.number().positive().max(10_000),
    calories: z.number().min(0), protein_g: z.number().min(0), carbs_g: z.number().min(0), fat_g: z.number().min(0),
    source: z.enum(['manual', 'openfoodfacts', 'recipe', 'ai_photo']).optional().default('manual'),
    source_id: z.string().optional(), logged_on: z.string().date(),
    ingredients: z.array(toolIngredientSchema).min(1).max(30),
  }).strict()).min(1).max(20),
}).strict().transform((input) => richFoodLogsProposalSchema.parse({ ...input, kind: 'food_logs' }));
const targetValuesToolSchema = z.object({
  calorie_target: z.number().int().positive().optional(), protein_target_g: z.number().int().min(0).optional(),
  carbs_target_g: z.number().int().min(0).optional(), fat_target_g: z.number().int().min(0).optional(),
  water_target_ml: z.number().int().positive().optional(),
}).strict();
const targetChangeToolArgsSchema = z.object({
  ...toolProposalBaseShape, current: targetValuesToolSchema,
  changes: targetValuesToolSchema.refine((value) => Object.keys(value).length > 0, 'At least one target change is required.'),
  rationale: z.string().trim().min(1).max(500),
}).strict().transform((input) => targetChangeProposalSchema.parse({ ...input, kind: 'target_change' }));
const recipeToolArgsSchema = z.object({
  ...toolProposalBaseShape, name: z.string().trim().min(1).max(120),
  servings: z.number().positive().max(100), ingredients: z.array(toolIngredientSchema).min(1).max(30),
}).strict().transform((input) => recipeProposalSchema.parse({ ...input, kind: 'recipe' }));

const groupedStrengthSetSchema = z.object({
  count: z.number().int().min(1).max(100), reps: z.number().int().min(0).max(10_000),
  weight_kg: z.number().min(0).max(10_000).optional(),
  duration_min: z.number().min(0).max(10_000).optional(),
}).strict();
const groupedCardioSetSchema = z.object({
  count: z.number().int().min(1).max(100), duration_min: z.number().positive().max(10_000),
  distance_km: z.number().min(0).max(10_000).optional(),
}).strict();

/** Exact model contract; the transform only expands explicitly supplied counts. */
const workoutLogToolArgsSchema = z.object({
  title: z.string().trim().min(1).max(120), summary: z.string().trim().max(280).optional(),
  logged_on: z.string().date(), duration_min: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().max(2_000).optional(), supersedes_insight_id: z.string().uuid().optional(),
  exercises: z.array(z.discriminatedUnion('kind', [
    z.object({
      name: z.string().trim().min(1).max(120), exercise_id: z.string().uuid().optional(),
      kind: z.literal('strength'), sets: z.array(groupedStrengthSetSchema).min(1).max(100),
    }).strict(),
    z.object({
      name: z.string().trim().min(1).max(120), exercise_id: z.string().uuid().optional(),
      kind: z.literal('cardio'), sets: z.array(groupedCardioSetSchema).min(1).max(100),
    }).strict(),
  ])).min(1).max(30),
}).strict().transform((input) => workoutLogProposalSchema.parse({
  ...input,
  kind: 'workout_log',
  exercises: input.exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.flatMap(({ count, ...set }) => Array.from({ length: count }, () => set)),
  })),
}));

export function createProposalToolRegistry(): Record<string, ProposalToolDef> {
  const proposalLimits = { maxRows: 20, maxRangeDays: 7 };
  return {
    propose_program_revision: defineProposal({
      type: 'function', name: 'propose_program_revision', kind: 'proposal', limits: proposalLimits,
      description: 'Propose an exact revision to an existing workout routine. Fill every required day, exercise, sets, and reps field; never claim it was applied.',
      parameters: { type: 'object', additionalProperties: false, required: ['title', 'routine_id', 'days'], properties: {
        ...proposalProperties, routine_id: { type: 'string', format: 'uuid' },
        days: { type: 'array', minItems: 1, maxItems: 7, items: {
          type: 'object', additionalProperties: false, required: ['name', 'exercises'], properties: {
            name: shortText, rationale: { type: 'string', maxLength: 500 },
            exercises: { type: 'array', minItems: 1, maxItems: 30, items: {
              type: 'object', additionalProperties: false, required: ['name', 'sets', 'reps'], properties: {
                name: shortText, exercise_id: { type: 'string', format: 'uuid' },
                sets: { oneOf: [{ type: 'number', exclusiveMinimum: 0, maximum: 10_000 }, { type: 'string', minLength: 1, maxLength: 40 }] },
                reps: { oneOf: [{ type: 'number', exclusiveMinimum: 0, maximum: 10_000 }, { type: 'string', minLength: 1, maxLength: 40 }] },
                rest_seconds: { type: 'number', minimum: 0, maximum: 3_600 }, rationale: { type: 'string', maxLength: 500 },
              },
            } },
          },
        } },
        notes: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 240 } },
      } }, args: programRevisionToolArgsSchema,
    }),
    propose_meal_plan: defineProposal({
      type: 'function', name: 'propose_meal_plan', kind: 'proposal', limits: proposalLimits,
      description: 'Propose a dated meal plan that obeys allergies. Supply exact macros and recipe details for every meal; never log it automatically.',
      parameters: { type: 'object', additionalProperties: false, required: ['title', 'date', 'meals'], properties: {
        ...proposalProperties, date: { type: 'string', format: 'date' },
        meals: { type: 'array', minItems: 1, maxItems: 12, items: {
          type: 'object', additionalProperties: false, required: ['name', 'meal_type', 'macros', 'recipe'], properties: {
            name: shortText, meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
            macros: macrosParameters,
            recipe: { type: 'object', additionalProperties: false, required: ['ingredients', 'steps'], properties: {
              ingredients: { type: 'array', maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 240 } },
              steps: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 500 } },
            } },
            note: { type: 'string', maxLength: 500 },
          },
        } },
        notes: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 240 } },
      } }, args: mealPlanToolArgsSchema,
    }),
    propose_food_logs: defineProposal({
      type: 'function', name: 'propose_food_logs', kind: 'proposal', limits: proposalLimits,
      description: 'Propose food-log entries only for food the user said they ate. Resolve ingredients first, then copy exact totals and provenance; never insert automatically.',
      parameters: { type: 'object', additionalProperties: false, required: ['title', 'entries'], properties: {
        ...proposalProperties,
        entries: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', required: ['food_name', 'meal_type', 'quantity_g', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'logged_on', 'ingredients'], properties: {
          food_name: shortText, brand: { type: 'string', maxLength: 120 }, meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] }, quantity_g: { type: 'number', exclusiveMinimum: 0, maximum: 10_000 },
          calories: { type: 'number', minimum: 0 }, protein_g: { type: 'number', minimum: 0 }, carbs_g: { type: 'number', minimum: 0 }, fat_g: { type: 'number', minimum: 0 }, logged_on: { type: 'string', format: 'date' },
          source: { type: 'string', enum: ['manual', 'openfoodfacts', 'recipe', 'ai_photo'], default: 'manual' }, source_id: { type: 'string' },
          ingredients: { type: 'array', minItems: 1, maxItems: 30, items: ingredientParameters },
        }, additionalProperties: false } },
      } }, args: foodLogsToolArgsSchema,
    }),
    propose_target_change: defineProposal({
      type: 'function', name: 'propose_target_change', kind: 'proposal', limits: proposalLimits,
      description: 'Propose nutrition or water target changes for user approval. Locked targets cannot be changed.',
      parameters: { type: 'object', additionalProperties: false, required: ['title', 'current', 'changes', 'rationale'], properties: {
        ...proposalProperties,
        current: { type: 'object', additionalProperties: false, properties: targetProperties },
        changes: { type: 'object', additionalProperties: false, minProperties: 1, properties: targetProperties },
        rationale: { type: 'string', minLength: 1, maxLength: 500 },
      } }, args: targetChangeToolArgsSchema,
    }),
    propose_workout_log: defineProposal({
      type: 'function', name: 'propose_workout_log', kind: 'proposal', limits: proposalLimits,
      description: 'Use immediately when the user asks to add completed training. Fill every required argument exactly. Group identical sets with count; never claim the workout is already logged.',
      parameters: { type: 'object', required: ['title', 'logged_on', 'exercises'], additionalProperties: false, properties: {
        title: { type: 'string', minLength: 1, maxLength: 120, description: 'Short natural title for this completed workout.' },
        summary: { type: 'string', maxLength: 280 }, logged_on: { type: 'string', format: 'date', description: 'Resolved calendar date; use the system-provided current date for today.' },
        duration_min: { type: 'integer', minimum: 0, maximum: 10_000 }, notes: { type: 'string', maxLength: 2_000 },
        supersedes_insight_id: { type: 'string', format: 'uuid' },
        exercises: { type: 'array', minItems: 1, maxItems: 30, items: { oneOf: [
          { type: 'object', required: ['name', 'kind', 'sets'], additionalProperties: false, properties: {
            name: shortText, exercise_id: { type: 'string', format: 'uuid' }, kind: { type: 'string', enum: ['strength'] },
            sets: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', required: ['count', 'reps'], additionalProperties: false, properties: {
              count: { type: 'integer', minimum: 1, maximum: 100 }, reps: { type: 'integer', minimum: 0, maximum: 10000 },
              weight_kg: { type: 'number', minimum: 0, maximum: 10000 }, duration_min: { type: 'number', minimum: 0, maximum: 10000 },
            } } },
          } },
          { type: 'object', required: ['name', 'kind', 'sets'], additionalProperties: false, properties: {
            name: shortText, exercise_id: { type: 'string', format: 'uuid' }, kind: { type: 'string', enum: ['cardio'] },
            sets: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', required: ['count', 'duration_min'], additionalProperties: false, properties: {
              count: { type: 'integer', minimum: 1, maximum: 100 }, duration_min: { type: 'number', exclusiveMinimum: 0, maximum: 10000 },
              distance_km: { type: 'number', minimum: 0, maximum: 10000 },
            } } },
          } },
        ] } },
      } }, args: workoutLogToolArgsSchema,
    }),
    propose_recipe: defineProposal({
      type: 'function', name: 'propose_recipe', kind: 'proposal', limits: proposalLimits,
      description: 'Use when the user wants to create a reusable recipe, not when they only want to log food they ate. Include resolved per-100g ingredient nutrition for review.',
      parameters: { type: 'object', additionalProperties: false, required: ['title', 'name', 'servings', 'ingredients'], properties: {
        ...proposalProperties, name: shortText,
        servings: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
        ingredients: { type: 'array', minItems: 1, maxItems: 30, items: ingredientParameters },
      } }, args: recipeToolArgsSchema,
    }),
  };
}

export function createToolRegistry(): ToolRegistry {
  return { ...createReadToolRegistry(), ...createProposalToolRegistry() };
}

export async function dispatchReadTool(registry: ReadToolRegistry, name: string, context: ToolContext, rawArgs: unknown): Promise<unknown> {
  const tool = registry[name];
  if (!tool) throw new HttpError('VALIDATION_ERROR', `Unknown assistant tool: ${name}.`);
  const args = tool.args.safeParse(rawArgs);
  if (!args.success) throw new HttpError('VALIDATION_ERROR', `Invalid arguments for ${name}.`, args.error.flatten());
  return tool.run(context, args.data);
}

export async function dispatchTool(registry: ToolRegistry, name: string, context: ToolContext, rawArgs: unknown): Promise<{ kind: ToolDef['kind']; result: unknown }> {
  const tool = registry[name];
  if (!tool) throw new HttpError('VALIDATION_ERROR', `Unknown assistant tool: ${name}.`);
  const args = tool.args.safeParse(rawArgs);
  if (!args.success) throw new HttpError('VALIDATION_ERROR', `Invalid arguments for ${name}.`, args.error.flatten());
  return { kind: tool.kind, result: await tool.run(context, args.data) };
}

export function interactionToolDeclarations(registry: ToolRegistry): JsonSchema[] {
  return Object.values(registry).map(({ type, name, description, parameters }) => ({ type, name, description, parameters }));
}
