import {
  type AiMealCandidate,
  type CouncilPlan,
  type GeneratedProgram,
  formatWeeklyReview,
  type ResolvedIngredient,
  type RoutineDiff,
  type WeeklyReviewContent,
  type WeeklySummary,
  type WorkoutProgramQuestionnaire,
  aiMealCandidateSchema,
  councilPlanSchema,
  generatedProgramSchema,
  resolvedIngredientSchema,
  routineDiffSchema,
  validateWeeklyReview,
  type CoachChatMessage,
  type RefineProgramResponse,
  COACH_MEMORY_MAX_CHARS,
  refineProgramResponseSchema,
  type MealPlan,
  type RefineMealPlanResponse,
  mealPlanSchema,
  mealPlanTotals,
  proposalIngredientSchema,
  refineMealPlanResponseSchema,
} from '../../_shared/index.ts';
import { COACH_MEMORY_PROMPT_VERSION, coachMemoryPrompt } from '../prompts/coach-memory.v1.ts';
import { COUNCIL_PROMPT_VERSION, councilPrompt } from '../prompts/council.v1.ts';
import { PROGRAM_REFINE_SYSTEM, programRefinePrompt } from '../prompts/program-refine.v1.ts';
import { MEAL_PLAN_PROMPT_VERSION, MEAL_PLAN_SYSTEM, mealPlanPrompt, type MealPlanContext } from '../prompts/meal-plan.v1.ts';
import { MEAL_PLAN_REFINE_SYSTEM, mealPlanRefinePrompt } from '../prompts/meal-plan-refine.v1.ts';
import { MEAL_PHOTO_PROMPT_VERSION, mealPhotoPrompt } from '../prompts/meal-photo.v1.ts';
import { PHYSIQUE_COMPARE_PROMPT_VERSION, physiqueComparePrompt } from '../prompts/physique-compare.v1.ts';
import { PROGRAM_GEN_PROMPT_VERSION, PROGRAM_GEN_SYSTEM, programGenPrompt, type ProgramContext } from '../prompts/program-gen.v1.ts';
import { weeklyReviewPrompt } from '../prompts/weekly-review.v1.ts';
import { structuredInteraction } from './agent/interactions.ts';

const PROGRAM_REFINE_PROMPT_VERSION = 'program-refine.v2';
const MEAL_PLAN_REFINE_PROMPT_VERSION = 'meal-plan-refine.v2';

export interface GeneratedText {
  model: string;
  content: WeeklyReviewContent;
}

function fallbackReview(summary: WeeklySummary): GeneratedText {
  const kcal = summary.nutrition.avgDailyCalories;
  const adherence =
    summary.nutrition.adherencePct == null ? 'without a calorie target yet' : `${summary.nutrition.adherencePct}% close to target`;
  return {
    model: 'local-fallback',
    content: {
      summary: `You logged ${summary.nutrition.daysLogged} food days and ${summary.training.sessions} training sessions this week, averaging ${kcal} kcal ${adherence}.`,
      recommendations: [
        summary.nutrition.daysLogged < 5
          ? 'Aim for one more logged day next week so the review has a steadier picture.'
          : 'Keep the logging rhythm steady and focus on repeatable meals that already work.',
        summary.training.sessions === 0
          ? 'Plan one short training session or recovery walk before the week gets busy.'
          : 'Keep one training slot anchored early in the week, then adjust volume based on recovery.',
      ],
      encouragement: 'Small honest logs are enough to make the next step clearer.',
    },
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('Gemini response did not contain JSON.');
  return JSON.parse(trimmed.slice(start, end + 1));
}

function mockSequence<T>(envName: string, parse: (value: unknown) => T): T | null {
  const raw = Deno.env.get(envName);
  if (!raw) return null;
  const values = JSON.parse(raw);
  if (!Array.isArray(values)) throw new Error(`${envName} must be an array.`);
  for (const value of values.slice(0, 2)) {
    try {
      return parse(typeof value === 'string' ? extractJson(value) : value);
    } catch {
      // Contract violation: retry once with the next mocked model response.
    }
  }
  return null;
}

export async function generateWeeklyReview(summary: WeeklySummary, contextLines: string[] = []): Promise<GeneratedText> {
  const sequence = mockSequence('GEMINI_MOCK_RESPONSE_SEQUENCE', validateWeeklyReview);
  if (sequence) return { model: 'mock-gemini', content: sequence };
  const mock = Deno.env.get('GEMINI_MOCK_RESPONSE');
  if (mock) {
    return { model: 'mock-gemini', content: validateWeeklyReview(JSON.parse(mock)) };
  }
  const result = await structuredInteraction({ input: weeklyReviewPrompt(summary, contextLines), parse: validateWeeklyReview, store: false });
  return result ? { model: result.model, content: result.value } : fallbackReview(summary);
}

export { formatWeeklyReview };

export async function analyzeMealPhoto(photoBase64: string): Promise<{ model: string; promptVersion: string; candidates: AiMealCandidate[] }> {
  const sequence = mockSequence('GEMINI_MOCK_MEAL_RESPONSE_SEQUENCE', (value) => {
    if (!Array.isArray(value)) throw new Error('Meal photo response must be an array.');
    return value.map((row) => aiMealCandidateSchema.parse(row));
  });
  if (sequence) return { model: 'mock-gemini', promptVersion: MEAL_PHOTO_PROMPT_VERSION, candidates: sequence };
  const mock = Deno.env.get('GEMINI_MOCK_MEAL_RESPONSE');
  if (mock) {
    return { model: 'mock-gemini', promptVersion: MEAL_PHOTO_PROMPT_VERSION, candidates: JSON.parse(mock).map((row: unknown) => aiMealCandidateSchema.parse(row)) };
  }
  const result = await structuredInteraction({
    input: [{ type: 'text', text: mealPhotoPrompt() }, { type: 'image', mime_type: 'image/jpeg', data: photoBase64 }],
    parse: (value) => {
      if (!Array.isArray(value)) throw new Error('Meal photo response must be an array.');
      return value.map((row) => aiMealCandidateSchema.parse(row));
    },
    store: false,
  });
  if (result) return { model: result.model, promptVersion: MEAL_PHOTO_PROMPT_VERSION, candidates: result.value };
  return { model: 'local-meal-fallback', promptVersion: MEAL_PHOTO_PROMPT_VERSION, candidates: [
    aiMealCandidateSchema.parse({
      id: 'candidate-balanced-bowl',
      dish_name: 'Balanced meal bowl',
      confidence: 0.62,
      estimated_calories: 520,
      ingredients: [
        { name: 'cooked rice', quantity_g: 150, calories: 195, protein_g: 4, carbs_g: 42, fat_g: 0.4, estimated: true },
        { name: 'lean protein', quantity_g: 120, calories: 220, protein_g: 35, carbs_g: 0, fat_g: 8, estimated: true },
        { name: 'mixed vegetables', quantity_g: 100, calories: 55, protein_g: 3, carbs_g: 10, fat_g: 0.5, estimated: true },
      ],
    }),
  ] };
}

async function searchUsda(name: string) {
  const key = Deno.env.get('USDA_FDC_API_KEY');
  if (!key) return null;
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&query=${encodeURIComponent(name)}&pageSize=1`);
  if (!res.ok) return null;
  const body = await res.json();
  const food = body.foods?.[0];
  if (!food) return null;
  const nutrients = new Map<string, number>((food.foodNutrients ?? []).map((n: { nutrientName: string; value: number }) => [n.nutrientName, Number(n.value)]));
  const value = (...names: string[]) => {
    const found = names.map((key) => nutrients.get(key)).find((item) => item != null && Number.isFinite(item));
    return found ?? null;
  };
  return {
    calories: value('Energy', 'Energy (Atwater General Factors)') ?? 0,
    protein_g: value('Protein') ?? 0, carbs_g: value('Carbohydrate, by difference') ?? 0,
    fat_g: value('Total lipid (fat)') ?? 0,
    source: 'usda' as const,
    fdc_id: typeof food.fdcId === 'number' ? food.fdcId : null,
    source_id: typeof food.fdcId === 'number' ? String(food.fdcId) : null,
    micronutrients: {
      fiber_g: value('Fiber, total dietary'), sugar_g: value('Sugars, total including NLEA', 'Sugars, Total'),
      saturated_fat_g: value('Fatty acids, total saturated'), sodium_mg: value('Sodium, Na'),
      potassium_mg: value('Potassium, K'), calcium_mg: value('Calcium, Ca'), iron_mg: value('Iron, Fe'),
      vitamin_c_mg: value('Vitamin C, total ascorbic acid'),
    },
  };
}

async function searchOpenFoodFacts(name: string) {
  const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&search_simple=1&action=process&json=1&page_size=1`, {
    headers: { 'User-Agent': 'NutriWorkoutExpert/1.0 (dev)' },
  });
  if (!res.ok) return null;
  const body = await res.json();
  const product = body.products?.[0];
  const n = product?.nutriments;
  if (!n) return null;
  return {
    calories: Number(n['energy-kcal_100g'] ?? 0),
    protein_g: Number(n.proteins_100g ?? 0),
    carbs_g: Number(n.carbohydrates_100g ?? 0),
    fat_g: Number(n.fat_100g ?? 0),
    source: 'openfoodfacts' as const,
    source_id: typeof product.code === 'string' ? product.code : null,
    fdc_id: null,
    micronutrients: {
      fiber_g: typeof n.fiber_100g === 'number' ? n.fiber_100g : null,
      sugar_g: typeof n.sugars_100g === 'number' ? n.sugars_100g : null,
      saturated_fat_g: typeof n['saturated-fat_100g'] === 'number' ? n['saturated-fat_100g'] : null,
      sodium_mg: typeof n.sodium_100g === 'number' ? n.sodium_100g * 1000 : null,
      potassium_mg: typeof n.potassium_100g === 'number' ? n.potassium_100g * 1000 : null,
      calcium_mg: typeof n.calcium_100g === 'number' ? n.calcium_100g * 1000 : null,
      iron_mg: typeof n.iron_100g === 'number' ? n.iron_100g * 1000 : null,
      vitamin_c_mg: typeof n['vitamin-c_100g'] === 'number' ? n['vitamin-c_100g'] * 1000 : null,
    },
  };
}

async function estimateIngredient(name: string, quantity_g: number) {
  const mock = Deno.env.get('GEMINI_MOCK_NUTRIENT_RESPONSE');
  if (mock) {
    const values = JSON.parse(mock) as Record<string, unknown>;
    const row = values[name] ?? values.default;
    return proposalIngredientSchema.parse({ ...(row && typeof row === 'object' ? row as Record<string, unknown> : {}), name, quantity_g, source: 'estimated' });
  }
  if (!Deno.env.get('GEMINI_API_KEY')) return null;
  const result = await structuredInteraction({
    model: Deno.env.get('GEMINI_NUTRIENT_MODEL') || undefined,
    input: `Estimate nutrition per 100 g for the ingredient "${name}". Return calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g and nullable micronutrients_per_100g fields. Use null when unknown.`,
    systemInstruction: 'You estimate nutrition only when food databases have no match. Return conservative JSON numbers and null for unknown micronutrients.',
    temperature: 0.2, store: false,
    parse: (value) => proposalIngredientSchema.parse({ ...(value as Record<string, unknown>), name, quantity_g, source: 'estimated' }),
  });
  return result?.value ?? null;
}

export async function resolveIngredients(
  ingredients: { name: string; quantity_g: number }[]
): Promise<ResolvedIngredient[]> {
  const rows: ResolvedIngredient[] = [];
  for (const ingredient of ingredients) {
    const q = ingredient.quantity_g / 100;
    const dbBase = await searchUsda(ingredient.name) ?? await searchOpenFoodFacts(ingredient.name);
    const aiEstimate = dbBase ? null : await estimateIngredient(ingredient.name, ingredient.quantity_g);
    const lower = ingredient.name.toLowerCase();
    const fallback =
      lower.includes('rice')
        ? { calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 }
        : lower.includes('chicken') || lower.includes('protein')
          ? { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 }
          : { calories: 80, protein_g: 2, carbs_g: 12, fat_g: 2 };
    const base = dbBase ?? (aiEstimate ? {
      calories: aiEstimate.calories_per_100g, protein_g: aiEstimate.protein_per_100g, carbs_g: aiEstimate.carbs_per_100g,
      fat_g: aiEstimate.fat_per_100g, source: 'estimated' as const, source_id: aiEstimate.source_id ?? null,
      fdc_id: null, micronutrients: aiEstimate.micronutrients_per_100g,
    } : { ...fallback, source: 'estimated' as const, source_id: null, fdc_id: null, micronutrients: {
      fiber_g: null, sugar_g: null, saturated_fat_g: null, sodium_mg: null, potassium_mg: null,
      calcium_mg: null, iron_mg: null, vitamin_c_mg: null,
    } });
    rows.push(resolvedIngredientSchema.parse({
      name: ingredient.name,
      quantity_g: ingredient.quantity_g,
      calories: Math.round(base.calories * q * 10) / 10,
      protein_g: Math.round(base.protein_g * q * 10) / 10,
      carbs_g: Math.round(base.carbs_g * q * 10) / 10,
      fat_g: Math.round(base.fat_g * q * 10) / 10,
      estimated: base.source === 'estimated',
      source: base.source,
      source_id: base.source_id, fdc_id: base.fdc_id,
      calories_per_100g: base.calories, protein_per_100g: base.protein_g,
      carbs_per_100g: base.carbs_g, fat_per_100g: base.fat_g,
      micronutrients_per_100g: base.micronutrients,
    }));
  }
  return rows;
}

export async function generateWorkoutProgram(
  input: WorkoutProgramQuestionnaire,
  ctx?: ProgramContext
): Promise<GeneratedProgram> {
  const sequence = mockSequence('GEMINI_MOCK_PROGRAM_RESPONSE_SEQUENCE', (value) => generatedProgramSchema.parse(value));
  if (sequence) return sequence;
  const mock = Deno.env.get('GEMINI_MOCK_PROGRAM_RESPONSE');
  if (mock) return generatedProgramSchema.parse(JSON.parse(mock));

  const result = await structuredInteraction({
    input: programGenPrompt(input, ctx), parse: (value) => generatedProgramSchema.parse(value),
    systemInstruction: PROGRAM_GEN_SYSTEM, temperature: 0.7, store: false,
  });
  if (result) return result.value;

  // Fallback ONLY when Gemini is unreachable — build a real split, not 3 repeated
  // lifts, so even the degraded path is usable.
  return generatedProgramSchema.parse(buildFallbackProgram(input));
}

// A deterministic multi-day split used only if the model is unavailable.
function buildFallbackProgram(input: WorkoutProgramQuestionnaire): GeneratedProgram {
  const pool: Record<string, { name: string; sets: number; reps: number }[]> = {
    Push: [
      { name: 'Barbell Bench Press', sets: 4, reps: 6 },
      { name: 'Overhead Press', sets: 3, reps: 8 },
      { name: 'Incline Dumbbell Press', sets: 3, reps: 10 },
      { name: 'Triceps Pushdown', sets: 3, reps: 12 },
    ],
    Pull: [
      { name: 'Deadlift', sets: 3, reps: 5 },
      { name: 'Pull-Up', sets: 3, reps: 8 },
      { name: 'Barbell Row', sets: 3, reps: 10 },
      { name: 'Face Pull', sets: 3, reps: 15 },
    ],
    Legs: [
      { name: 'Back Squat', sets: 4, reps: 6 },
      { name: 'Romanian Deadlift', sets: 3, reps: 8 },
      { name: 'Leg Press', sets: 3, reps: 12 },
      { name: 'Calf Raise', sets: 4, reps: 15 },
    ],
    Upper: [
      { name: 'Barbell Bench Press', sets: 4, reps: 6 },
      { name: 'Barbell Row', sets: 4, reps: 8 },
      { name: 'Overhead Press', sets: 3, reps: 10 },
      { name: 'Lat Pulldown', sets: 3, reps: 12 },
    ],
    'Full Body': [
      { name: 'Back Squat', sets: 3, reps: 8 },
      { name: 'Barbell Bench Press', sets: 3, reps: 8 },
      { name: 'Barbell Row', sets: 3, reps: 10 },
      { name: 'Plank', sets: 3, reps: 30 },
    ],
  };
  const splits: Record<number, string[]> = {
    1: ['Full Body'],
    2: ['Full Body', 'Full Body'],
    3: ['Push', 'Pull', 'Legs'],
    4: ['Upper', 'Legs', 'Push', 'Pull'],
    5: ['Push', 'Pull', 'Legs', 'Upper', 'Legs'],
    6: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'],
  };
  const plan = splits[Math.min(6, Math.max(1, input.days_per_week))] ?? splits[3];
  return {
    title: `${input.goal} — ${input.days_per_week}-day program`,
    days: plan.map((focus, i) => ({
      name: `Day ${i + 1}: ${focus}`,
      rationale: `${focus} focus.`,
      exercises: (pool[focus] ?? pool['Full Body']).map((e) => ({ ...e, rationale: '' })),
    })),
    notes: input.constraints ? [`Work around: ${input.constraints}`] : [],
  };
}

export async function generateRoutineDiff(reason: string, context?: unknown): Promise<RoutineDiff> {
  const sequence = mockSequence('GEMINI_MOCK_ROUTINE_DIFF_SEQUENCE', (value) => routineDiffSchema.parse(value));
  if (sequence) return sequence;
  const mock = Deno.env.get('GEMINI_MOCK_ROUTINE_DIFF');
  if (mock) return routineDiffSchema.parse(JSON.parse(mock));
  const result = await structuredInteraction({
    input: `Return strict JSON routine diff. Reason: ${reason}\nContext: ${JSON.stringify(context ?? {})}`,
    parse: (value) => routineDiffSchema.parse(value), store: false,
  });
  if (result) return result.value;
  return routineDiffSchema.parse({
    title: 'Training adjustment',
    reason,
    changes: [
      { type: 'change', exercise: 'Main lift', detail: 'Reduce one working set for a week and rebuild.' },
      { type: 'add', exercise: 'Easy cardio', detail: 'Add 15 minutes after one session if recovery feels good.' },
    ],
  });
}

export async function analyzePhysique(photos: string[], summary: WeeklySummary, notes?: string) {
  const sequence = mockSequence('GEMINI_MOCK_PHYSIQUE_RESPONSE_SEQUENCE', (value) => {
    const row = value as { feedback?: unknown; refused?: unknown };
    if (typeof row.feedback !== 'string') throw new Error('Physique response missing feedback.');
    return { feedback: row.feedback, refused: Boolean(row.refused) };
  });
  if (sequence) return { model: 'mock-gemini', promptVersion: PHYSIQUE_COMPARE_PROMPT_VERSION, ...sequence };
  const mock = Deno.env.get('GEMINI_MOCK_PHYSIQUE_RESPONSE');
  if (mock) {
    const row = JSON.parse(mock) as { feedback: string; refused?: boolean };
    return { model: 'mock-gemini', promptVersion: PHYSIQUE_COMPARE_PROMPT_VERSION, feedback: row.feedback, refused: Boolean(row.refused) };
  }
  const result = await structuredInteraction({
    input: [{ type: 'text', text: physiqueComparePrompt(summary, notes) }, ...photos.map((data) => ({ type: 'image', mime_type: 'image/jpeg', data }))],
    parse: (value) => {
      const row = value as { feedback?: unknown; refused?: unknown };
      if (typeof row.feedback !== 'string') throw new Error('Physique response missing feedback.');
      return { feedback: row.feedback, refused: Boolean(row.refused) };
    },
    store: false,
  });
  if (result) return { model: result.model, promptVersion: PHYSIQUE_COMPARE_PROMPT_VERSION, ...result.value };
  return {
    model: 'local-physique-fallback',
    promptVersion: PHYSIQUE_COMPARE_PROMPT_VERSION,
    feedback: 'I can compare these only in a general, body-neutral way. Keep photo conditions consistent and pair visual notes with strength, weight, and energy trends.',
    refused: false,
  };
}

export async function generateCouncilPlan(summary: WeeklySummary, detectorMessages: string[], contextLines: string[] = []): Promise<{ model: string; promptVersion: string; plan: CouncilPlan }> {
  const sequence = mockSequence('GEMINI_MOCK_COUNCIL_RESPONSE_SEQUENCE', (value) => councilPlanSchema.parse(value));
  if (sequence) return { model: 'mock-gemini', promptVersion: COUNCIL_PROMPT_VERSION, plan: sequence };
  const mock = Deno.env.get('GEMINI_MOCK_COUNCIL_RESPONSE');
  if (mock) return { model: 'mock-gemini', promptVersion: COUNCIL_PROMPT_VERSION, plan: councilPlanSchema.parse(JSON.parse(mock)) };
  const result = await structuredInteraction({ input: councilPrompt(summary, detectorMessages, contextLines), parse: (value) => councilPlanSchema.parse(value), store: false });
  if (result) return { model: result.model, promptVersion: COUNCIL_PROMPT_VERSION, plan: result.value };
  return {
    model: 'local-council-fallback',
    promptVersion: COUNCIL_PROMPT_VERSION,
    plan: councilPlanSchema.parse({
      headline: 'Coach council plan',
      coaches: {
        goal: { summary: summary.weightTrend.deltaKg == null ? 'Add a few weigh-ins to sharpen goal guidance.' : `Weight moved ${summary.weightTrend.deltaKg} kg this week.`, proposals: [] },
        nutrition: { summary: `${summary.nutrition.daysLogged} food days logged with ${summary.nutrition.adherencePct ?? 0}% calorie adherence.`, proposals: [{ type: 'diet_suggestion', label: 'Steady logging', detail: 'Keep one simple repeatable meal ready for busy days.' }] },
        training: { summary: `${summary.training.sessions} training sessions logged.`, proposals: [{ type: 'training_focus', label: 'Anchor one session', detail: 'Place the most important lift early in the week.' }] },
      },
      checkins: detectorMessages.map((message, i) => ({ detector: `detector_${i}`, message })),
    }),
  };
}

// ── Coach memory distillation (NWE-119) ─────────────────────────────────────
// Returns the new memory text, or null when the model is unreachable (memory is
// then left unchanged — we never fabricate a memory locally).
export async function distillCoachMemory(input: {
  previousMemory: string;
  summary: WeeklySummary;
  recentDecisions: string[];
  profileLines: string[];
}): Promise<{ text: string; promptVersion: string } | null> {
  const parseMemory = (value: unknown): { text: string } => {
    const row = value as { text?: unknown };
    if (typeof row.text !== 'string' || row.text.length === 0) throw new Error('Memory response missing text.');
    return { text: row.text.slice(0, COACH_MEMORY_MAX_CHARS) };
  };
  const sequence = mockSequence('GEMINI_MOCK_MEMORY_RESPONSE_SEQUENCE', parseMemory);
  if (sequence) return { text: sequence.text, promptVersion: COACH_MEMORY_PROMPT_VERSION };
  const mock = Deno.env.get('GEMINI_MOCK_MEMORY_RESPONSE');
  if (mock) return { text: parseMemory(JSON.parse(mock)).text, promptVersion: COACH_MEMORY_PROMPT_VERSION };

  const result = await structuredInteraction({ input: coachMemoryPrompt(input), parse: parseMemory, temperature: 0.3, store: false });
  if (!result) return null;
  return { text: result.value.text, promptVersion: COACH_MEMORY_PROMPT_VERSION };
}

// ── Program refinement chat (NWE-120) ───────────────────────────────────────
// Two-channel turn: { reply, updated_program? }. Returns null when the model is
// unreachable — the route maps that to UPSTREAM_ERROR (no fake coach replies).
export async function refineProgram(input: {
  program: GeneratedProgram;
  messages: CoachChatMessage[];
  userMessage: string;
  contextLines: string[];
  previousInteractionId?: string | null;
}): Promise<{ model: string; promptVersion: string; turn: RefineProgramResponse; interactionId: string | null } | null> {
  const parseTurn = (value: unknown) => refineProgramResponseSchema.parse(value);
  const sequence = mockSequence('GEMINI_MOCK_REFINE_RESPONSE_SEQUENCE', parseTurn);
  if (sequence) return { model: 'mock-gemini', promptVersion: PROGRAM_REFINE_PROMPT_VERSION, turn: sequence, interactionId: input.previousInteractionId ?? null };
  const mock = Deno.env.get('GEMINI_MOCK_REFINE_RESPONSE');
  if (mock) return { model: 'mock-gemini', promptVersion: PROGRAM_REFINE_PROMPT_VERSION, turn: parseTurn(JSON.parse(mock)), interactionId: input.previousInteractionId ?? null };

  const legacyContext = Deno.env.get('ASSISTANT_INTERACTIONS_REFINE') === 'off'
    ? `\nRecent conversation:\n${input.messages.slice(-8).map((message) => `${message.role}: ${message.text}`).join('\n')}` : '';
  const result = await structuredInteraction({
    input: programRefinePrompt({ program: input.program, contextLines: input.contextLines, userMessage: input.userMessage }) + legacyContext,
    parse: parseTurn, systemInstruction: PROGRAM_REFINE_SYSTEM, temperature: 0.6, store: true,
    previousInteractionId: Deno.env.get('ASSISTANT_INTERACTIONS_REFINE') === 'off' ? null : input.previousInteractionId,
  });
  if (!result) return null;
  return { model: result.model, promptVersion: PROGRAM_REFINE_PROMPT_VERSION, turn: result.value, interactionId: result.interactionId };
}

// ── AI meal planner (NWE-121) ───────────────────────────────────────────────
function fallbackMealPlan(ctx: MealPlanContext): MealPlan {
  const kcal = ctx.targets.calories ?? 2000;
  const p = ctx.targets.protein_g ?? Math.round((kcal * 0.3) / 4);
  const per = Math.max(1, ctx.mealsPerDay);
  const share = (n: number) => Math.round(n / per);
  const types: MealPlan['meals'][number]['meal_type'][] = ['breakfast', 'lunch', 'dinner', 'snack', 'snack', 'snack'];
  const meals = Array.from({ length: per }, (_, i) => ({
    name: `Balanced ${types[i] ?? 'snack'}`,
    meal_type: types[i] ?? 'snack',
    macros: { calories: share(kcal), protein_g: share(p), carbs_g: share(Math.round((kcal * 0.4) / 4)), fat_g: share(Math.round((kcal * 0.3) / 9)) },
    recipe: { ingredients: ['a lean protein', 'a whole-grain or starch', 'vegetables'], steps: ['Combine and cook simply to taste.'] },
    note: '',
  }));
  return mealPlanSchema.parse({
    title: `${ctx.isTrainingDay ? 'Training-day' : 'Rest-day'} plan`,
    meals,
    day_totals: mealPlanTotals(meals),
    notes: ['Auto-generated fallback — regenerate for a tailored plan.'],
  });
}

export async function generateMealPlan(ctx: MealPlanContext): Promise<{ model: string; promptVersion: string; plan: MealPlan }> {
  const sequence = mockSequence('GEMINI_MOCK_MEALPLAN_RESPONSE_SEQUENCE', (v) => mealPlanSchema.parse(v));
  if (sequence) return { model: 'mock-gemini', promptVersion: MEAL_PLAN_PROMPT_VERSION, plan: sequence };
  const mock = Deno.env.get('GEMINI_MOCK_MEALPLAN_RESPONSE');
  if (mock) return { model: 'mock-gemini', promptVersion: MEAL_PLAN_PROMPT_VERSION, plan: mealPlanSchema.parse(JSON.parse(mock)) };

  const result = await structuredInteraction({ input: mealPlanPrompt(ctx), parse: (v) => mealPlanSchema.parse(v), systemInstruction: MEAL_PLAN_SYSTEM, temperature: 0.7, store: false });
  if (result) return { model: result.model, promptVersion: MEAL_PLAN_PROMPT_VERSION, plan: result.value };
  return { model: 'local-mealplan-fallback', promptVersion: MEAL_PLAN_PROMPT_VERSION, plan: fallbackMealPlan(ctx) };
}

export async function refineMealPlan(input: {
  plan: MealPlan;
  messages: CoachChatMessage[];
  userMessage: string;
  contextLines: string[];
  previousInteractionId?: string | null;
}): Promise<{ model: string; promptVersion: string; turn: RefineMealPlanResponse; interactionId: string | null } | null> {
  const parseTurn = (v: unknown) => refineMealPlanResponseSchema.parse(v);
  const sequence = mockSequence('GEMINI_MOCK_MEALPLAN_REFINE_SEQUENCE', parseTurn);
  if (sequence) return { model: 'mock-gemini', promptVersion: MEAL_PLAN_REFINE_PROMPT_VERSION, turn: sequence, interactionId: input.previousInteractionId ?? null };
  const mock = Deno.env.get('GEMINI_MOCK_MEALPLAN_REFINE');
  if (mock) return { model: 'mock-gemini', promptVersion: MEAL_PLAN_REFINE_PROMPT_VERSION, turn: parseTurn(JSON.parse(mock)), interactionId: input.previousInteractionId ?? null };

  const legacyContext = Deno.env.get('ASSISTANT_INTERACTIONS_REFINE') === 'off'
    ? `\nRecent conversation:\n${input.messages.slice(-8).map((message) => `${message.role}: ${message.text}`).join('\n')}` : '';
  const result = await structuredInteraction({
    input: mealPlanRefinePrompt({ plan: input.plan, contextLines: input.contextLines, userMessage: input.userMessage }) + legacyContext,
    parse: parseTurn, systemInstruction: MEAL_PLAN_REFINE_SYSTEM, temperature: 0.6, store: true,
    previousInteractionId: Deno.env.get('ASSISTANT_INTERACTIONS_REFINE') === 'off' ? null : input.previousInteractionId,
  });
  if (!result) return null;
  return { model: result.model, promptVersion: MEAL_PLAN_REFINE_PROMPT_VERSION, turn: result.value, interactionId: result.interactionId };
}
