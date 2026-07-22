import { z } from 'zod';

import { exerciseKindSchema, isoDateSchema } from './types.ts';
import { createFoodLogSchema, generatedProgramDaySchema, plannedMealSchema } from './contracts.ts';
import { ingredientTotals } from './proposalNutrition.ts';

export const ASSISTANT_MAX_ROWS = 200;
export const ASSISTANT_MAX_RANGE_DAYS = 365;
export const ASSISTANT_DEFAULT_STEP_CAP = 6;
export const ASSISTANT_HARD_STEP_CAP = 10;
// Temporarily disabled while Gemini Interactions latency is evaluated. A positive
// value restores the hard total-loop deadline; 0 means no default deadline.
export const ASSISTANT_LOOP_BUDGET_MS = 0;

function utcDayNumber(value: string): number {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / 86_400_000);
}

function validRange(value: { from: string; to: string }): boolean {
  const days = utcDayNumber(value.to) - utcDayNumber(value.from);
  return days >= 0 && days <= ASSISTANT_MAX_RANGE_DAYS;
}

export const assistantChatSchema = z.object({
  thread_id: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2000),
});
export type AssistantChatInput = z.infer<typeof assistantChatSchema>;

export const assistantThreadParamSchema = z.object({ id: z.string().uuid() });

export const daysArgsSchema = z.object({ days: z.number().int().min(1).max(ASSISTANT_MAX_RANGE_DAYS).default(90) }).strict();
export const getWorkoutsArgsSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    limit: z.number().int().min(1).max(ASSISTANT_MAX_ROWS).default(100),
  }).strict()
  .refine(validRange, { message: `Date range must be 0–${ASSISTANT_MAX_RANGE_DAYS} days.` });
export const exerciseHistoryArgsSchema = z.object({ exercise_id: z.string().uuid() }).strict();
export const emptyToolArgsSchema = z.object({}).strict();
export const getRecipeArgsSchema = z.object({ id: z.string().uuid() }).strict();
export const getFoodLogsArgsSchema = z
  .union([
    z.object({ date: isoDateSchema, from: z.never().optional(), to: z.never().optional() }).strict(),
    z.object({ date: z.never().optional(), from: isoDateSchema, to: isoDateSchema }).strict().refine(validRange, {
      message: `Date range must be 0–${ASSISTANT_MAX_RANGE_DAYS} days.`,
    }),
  ]);
export const searchFoodsArgsSchema = z.object({ q: z.string().trim().min(1).max(120) }).strict();
export const resolveMacrosArgsSchema = z.object({
  items: z.array(z.object({ name: z.string().trim().min(1).max(120), quantity_g: z.number().positive().max(10_000) }).strict()).min(1).max(50),
}).strict();

export const assistantToolTraceSchema = z.object({
  name: z.string(),
  args_preview: z.record(z.unknown()),
  ms: z.number().int().min(0),
  ok: z.boolean(),
});
export type AssistantToolTrace = z.infer<typeof assistantToolTraceSchema>;

const proposalBase = z.object({
  title: z.string().trim().min(1).max(120), summary: z.string().trim().max(280).optional(),
  supersedes_insight_id: z.string().uuid().optional(),
});
export const micronutrientsSchema = z.object({
  fiber_g: z.number().min(0).nullable().default(null), sugar_g: z.number().min(0).nullable().default(null),
  saturated_fat_g: z.number().min(0).nullable().default(null), sodium_mg: z.number().min(0).nullable().default(null),
  potassium_mg: z.number().min(0).nullable().default(null), calcium_mg: z.number().min(0).nullable().default(null),
  iron_mg: z.number().min(0).nullable().default(null), vitamin_c_mg: z.number().min(0).nullable().default(null),
});
export type Micronutrients = z.infer<typeof micronutrientsSchema>;

export const proposalIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120), quantity_g: z.number().min(0).max(10_000),
  calories_per_100g: z.number().min(0).max(10_000), protein_per_100g: z.number().min(0).max(1_000),
  carbs_per_100g: z.number().min(0).max(1_000), fat_per_100g: z.number().min(0).max(1_000),
  source: z.enum(['usda', 'openfoodfacts', 'estimated']), source_id: z.string().nullable().optional(),
  fdc_id: z.number().int().positive().nullable().optional(), micronutrients_per_100g: micronutrientsSchema.optional().default({}),
});
export type ProposalIngredient = z.infer<typeof proposalIngredientSchema>;

export const foodLogProposalEntrySchema = createFoodLogSchema.extend({
  ingredients: z.array(proposalIngredientSchema).min(1).max(30).optional(),
}).superRefine((entry, ctx) => {
  if (!entry.ingredients) return;
  const totals = ingredientTotals(entry.ingredients);
  const checks: Array<[keyof typeof totals, number]> = [['calories', 1], ['protein_g', 0.5], ['carbs_g', 0.5], ['fat_g', 0.5]];
  for (const [key, tolerance] of checks) if (Math.abs(entry[key] - totals[key]) > tolerance) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} does not match ingredient totals.` });
  }
});
export const programRevisionProposalSchema = proposalBase.extend({
  kind: z.literal('program_revision'),
  routine_id: z.string().uuid(),
  days: z.array(generatedProgramDaySchema).min(1).max(7),
  notes: z.array(z.string().max(240)).max(12).optional().default([]),
});
export const mealPlanProposalSchema = proposalBase.extend({
  kind: z.literal('meal_plan'), date: isoDateSchema,
  meals: z.array(plannedMealSchema).min(1).max(12),
  notes: z.array(z.string().max(240)).max(12).optional().default([]),
});
export const foodLogsProposalSchema = proposalBase.extend({
  kind: z.literal('food_logs'), entries: z.array(foodLogProposalEntrySchema).min(1).max(20),
});
/** New agent calls must be rich; the broader schema above remains for persisted NWE-124 payloads. */
export const richFoodLogsProposalSchema = foodLogsProposalSchema.superRefine((proposal, ctx) => {
  proposal.entries.forEach((entry, index) => {
    if (!entry.ingredients?.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries', index, 'ingredients'], message: 'Agent food proposals require ingredient detail.' });
  });
});
const strengthSetSchema = z.object({
  reps: z.number().int().min(0).max(10_000), weight_kg: z.number().min(0).max(10_000).nullable().optional(),
  duration_min: z.number().min(0).max(10_000).nullable().optional(), distance_km: z.never().optional(),
});
const cardioSetSchema = z.object({
  reps: z.never().optional(), weight_kg: z.never().optional(), duration_min: z.number().positive().max(10_000),
  distance_km: z.number().min(0).max(10_000).nullable().optional(),
});
export const workoutLogProposalSchema = proposalBase.extend({
  kind: z.literal('workout_log'), logged_on: isoDateSchema,
  duration_min: z.number().int().min(0).max(10_000).nullable().optional(), notes: z.string().max(2_000).nullable().optional(),
  exercises: z.array(z.discriminatedUnion('kind', [
    z.object({ name: z.string().trim().min(1).max(120), exercise_id: z.string().uuid().nullable().optional(), kind: z.literal(exerciseKindSchema.enum.strength), sets: z.array(strengthSetSchema).min(1).max(100) }),
    z.object({ name: z.string().trim().min(1).max(120), exercise_id: z.string().uuid().nullable().optional(), kind: z.literal(exerciseKindSchema.enum.cardio), sets: z.array(cardioSetSchema).min(1).max(100) }),
  ])).min(1).max(30),
});
export const recipeProposalSchema = proposalBase.extend({
  kind: z.literal('recipe'), name: z.string().trim().min(1).max(120), servings: z.number().positive().max(100),
  ingredients: z.array(proposalIngredientSchema).min(1).max(30),
});
const targetValuesSchema = z.object({
  calorie_target: z.number().int().positive().nullable().optional(),
  protein_target_g: z.number().int().min(0).nullable().optional(),
  carbs_target_g: z.number().int().min(0).nullable().optional(),
  fat_target_g: z.number().int().min(0).nullable().optional(),
  water_target_ml: z.number().int().positive().optional(),
});
const targetChangesSchema = targetValuesSchema.refine((value) => Object.keys(value).length > 0, { message: 'At least one target change is required.' });
export const targetChangeProposalSchema = proposalBase.extend({
  kind: z.literal('target_change'), current: targetValuesSchema, changes: targetChangesSchema,
  rationale: z.string().trim().min(1).max(500),
});
export const assistantProposalSchema = z.discriminatedUnion('kind', [
  programRevisionProposalSchema, mealPlanProposalSchema, foodLogsProposalSchema, targetChangeProposalSchema,
  workoutLogProposalSchema, recipeProposalSchema,
]);
export type AssistantProposal = z.infer<typeof assistantProposalSchema>;

export const assistantProposalParamSchema = z.object({ id: z.string().uuid() });
export const assistantProposalApplySchema = z.object({ proposal: assistantProposalSchema.optional() }).default({});
export const saveProposalRecipeSchema = z.object({ proposal: foodLogsProposalSchema.optional() }).default({});
export type AssistantProposalState = {
  id: string;
  proposal: AssistantProposal;
  applied_at: string | null;
  dismissed_at: string | null;
  apply_result?: Record<string, unknown> | null;
  recipe_result?: Record<string, unknown> | null;
  supersedes_insight_id?: string | null;
  superseded?: boolean;
};

export interface AssistantThreadSummary {
  id: string; title: string | null; created_at: string; updated_at: string;
}
export interface AssistantMessage {
  id: string; role: 'user' | 'assistant'; content: string; tool_trace: AssistantToolTrace[] | null;
  failed: boolean; proposal_insight_id: string | null; proposal?: AssistantProposalState | null; created_at: string;
}
export interface AssistantThread extends AssistantThreadSummary { messages: AssistantMessage[]; }

export const assistantSseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('thought'), message: z.string() }),
  z.object({ type: z.literal('function_call'), name: z.string(), args: z.record(z.unknown()).optional() }),
  z.object({ type: z.literal('text'), delta: z.string() }),
  z.object({
    type: z.literal('proposal'), insight_id: z.string().uuid(), proposal_kind: z.string(),
    // Optional for rolling deploy compatibility; current servers include the
    // resolved artifact so clients can render its card before the turn ends.
    proposal: assistantProposalSchema.optional(),
  }),
  z.object({ type: z.literal('done'), thread_id: z.string().uuid(), message_id: z.string().uuid(), interaction_id: z.string().nullable() }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string(), request_id: z.string().optional() }),
]);
export type AssistantSseEvent = z.infer<typeof assistantSseEventSchema>;

/** Parse complete or arbitrarily split SSE text chunks. Unknown events are forward-compatible. */
export function createAssistantSseParser() {
  let buffer = '';
  const consume = (block: string): AssistantSseEvent[] => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return [];
    try {
      const event = assistantSseEventSchema.safeParse(JSON.parse(data));
      if (event.success) return [event.data];
    } catch {
      // A malformed or unknown server event must not discard earlier valid events.
    }
    return [];
  };
  const push = (chunk: string): AssistantSseEvent[] => {
    const parsed: AssistantSseEvent[] = [];
    buffer += chunk;
    let boundary = buffer.search(/\r?\n\r?\n/);
    while (boundary !== -1) {
      const match = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n';
      parsed.push(...consume(buffer.slice(0, boundary)));
      buffer = buffer.slice(boundary + match.length);
      boundary = buffer.search(/\r?\n\r?\n/);
    }
    return parsed;
  };
  const finish = (): AssistantSseEvent[] => {
    const parsed = buffer.trim() ? consume(buffer) : [];
    buffer = '';
    return parsed;
  };
  return { push, finish };
}

export function parseAssistantSse(chunks: Iterable<string>): AssistantSseEvent[] {
  const parser = createAssistantSseParser();
  const parsed: AssistantSseEvent[] = [];
  for (const chunk of chunks) parsed.push(...parser.push(chunk));
  parsed.push(...parser.finish());
  return parsed;
}
