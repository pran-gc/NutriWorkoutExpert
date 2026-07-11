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
} from '../../_shared/index.ts';
import { COUNCIL_PROMPT_VERSION, councilPrompt } from '../prompts/council.v1.ts';
import { MEAL_PHOTO_PROMPT_VERSION, mealPhotoPrompt } from '../prompts/meal-photo.v1.ts';
import { PHYSIQUE_COMPARE_PROMPT_VERSION, physiqueComparePrompt } from '../prompts/physique-compare.v1.ts';
import { PROGRAM_GEN_PROMPT_VERSION, programGenPrompt } from '../prompts/program-gen.v1.ts';
import { weeklyReviewPrompt } from '../prompts/weekly-review.v1.ts';

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

async function geminiJson<T>(prompt: string, parse: (value: unknown) => T, parts: Record<string, unknown>[] = []): Promise<{ model: string; value: T } | null> {
  const key = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-1.5-flash';
  if (!key) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }, ...parts] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.35 },
          }),
        }
      );
      if (!response.ok) return null;
      const body = await response.json();
      const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string') continue;
      return { model, value: parse(extractJson(text)) };
    } catch {
      if (attempt === 1) return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

export async function generateWeeklyReview(summary: WeeklySummary): Promise<GeneratedText> {
  const sequence = mockSequence('GEMINI_MOCK_RESPONSE_SEQUENCE', validateWeeklyReview);
  if (sequence) return { model: 'mock-gemini', content: sequence };
  const mock = Deno.env.get('GEMINI_MOCK_RESPONSE');
  if (mock) {
    return { model: 'mock-gemini', content: validateWeeklyReview(JSON.parse(mock)) };
  }
  const result = await geminiJson(weeklyReviewPrompt(summary), validateWeeklyReview);
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
  const result = await geminiJson(
    mealPhotoPrompt(),
    (value) => {
      if (!Array.isArray(value)) throw new Error('Meal photo response must be an array.');
      return value.map((row) => aiMealCandidateSchema.parse(row));
    },
    [{ inlineData: { mimeType: 'image/jpeg', data: photoBase64 } }]
  );
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
  const nutrients = new Map((food.foodNutrients ?? []).map((n: { nutrientName: string; value: number }) => [n.nutrientName, Number(n.value)]));
  return {
    calories: Number(nutrients.get('Energy') ?? nutrients.get('Energy (Atwater General Factors)') ?? 0),
    protein_g: Number(nutrients.get('Protein') ?? 0),
    carbs_g: Number(nutrients.get('Carbohydrate, by difference') ?? 0),
    fat_g: Number(nutrients.get('Total lipid (fat)') ?? 0),
    source: 'usda' as const,
  };
}

async function searchOpenFoodFacts(name: string) {
  const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&search_simple=1&action=process&json=1&page_size=1`, {
    headers: { 'User-Agent': 'NutriWorkoutExpert/1.0 (dev)' },
  });
  if (!res.ok) return null;
  const body = await res.json();
  const n = body.products?.[0]?.nutriments;
  if (!n) return null;
  return {
    calories: Number(n['energy-kcal_100g'] ?? 0),
    protein_g: Number(n.proteins_100g ?? 0),
    carbs_g: Number(n.carbohydrates_100g ?? 0),
    fat_g: Number(n.fat_100g ?? 0),
    source: 'openfoodfacts' as const,
  };
}

export async function resolveIngredients(
  ingredients: { name: string; quantity_g: number }[]
): Promise<ResolvedIngredient[]> {
  const rows: ResolvedIngredient[] = [];
  for (const ingredient of ingredients) {
    const q = ingredient.quantity_g / 100;
    const dbBase = await searchUsda(ingredient.name) ?? await searchOpenFoodFacts(ingredient.name);
    const lower = ingredient.name.toLowerCase();
    const fallback =
      lower.includes('rice')
        ? { calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, source: 'ai_estimate' as const }
        : lower.includes('chicken') || lower.includes('protein')
          ? { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, source: 'ai_estimate' as const }
          : { calories: 80, protein_g: 2, carbs_g: 12, fat_g: 2, source: 'ai_estimate' as const };
    const base = dbBase ?? fallback;
    rows.push(resolvedIngredientSchema.parse({
      name: ingredient.name,
      quantity_g: ingredient.quantity_g,
      calories: Math.round(base.calories * q * 10) / 10,
      protein_g: Math.round(base.protein_g * q * 10) / 10,
      carbs_g: Math.round(base.carbs_g * q * 10) / 10,
      fat_g: Math.round(base.fat_g * q * 10) / 10,
      estimated: base.source === 'ai_estimate',
      source: base.source,
    }));
  }
  return rows;
}

export async function generateWorkoutProgram(input: WorkoutProgramQuestionnaire): Promise<GeneratedProgram> {
  const sequence = mockSequence('GEMINI_MOCK_PROGRAM_RESPONSE_SEQUENCE', (value) => generatedProgramSchema.parse(value));
  if (sequence) return sequence;
  const mock = Deno.env.get('GEMINI_MOCK_PROGRAM_RESPONSE');
  if (mock) return generatedProgramSchema.parse(JSON.parse(mock));
  const result = await geminiJson(programGenPrompt(input), (value) => generatedProgramSchema.parse(value));
  if (result) return result.value;
  const days = Array.from({ length: input.days_per_week }, (_, i) => ({
    name: `Day ${i + 1}`,
    rationale: i % 2 === 0 ? 'Strength focus with room to progress.' : 'Balanced accessories and recovery-friendly volume.',
    exercises: [
      { name: 'Bench Press', sets: 3, reps: input.experience === 'beginner' ? 8 : 6, rationale: 'Main push pattern.' },
      { name: 'Squat', sets: 3, reps: 8, rationale: 'Main lower-body pattern.' },
      { name: 'Lat Pulldown', sets: 3, reps: 10, rationale: 'Balances pressing volume.' },
    ],
  }));
  return generatedProgramSchema.parse({
    title: `${input.goal} program`,
    days,
    notes: input.constraints ? [`Adjusted for: ${input.constraints}`] : [],
  });
}

export async function generateRoutineDiff(reason: string, context?: unknown): Promise<RoutineDiff> {
  const sequence = mockSequence('GEMINI_MOCK_ROUTINE_DIFF_SEQUENCE', (value) => routineDiffSchema.parse(value));
  if (sequence) return sequence;
  const mock = Deno.env.get('GEMINI_MOCK_ROUTINE_DIFF');
  if (mock) return routineDiffSchema.parse(JSON.parse(mock));
  const result = await geminiJson(
    `Return strict JSON routine diff. Reason: ${reason}\nContext: ${JSON.stringify(context ?? {})}`,
    (value) => routineDiffSchema.parse(value)
  );
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
  const result = await geminiJson(
    physiqueComparePrompt(summary, notes),
    (value) => {
      const row = value as { feedback?: unknown; refused?: unknown };
      if (typeof row.feedback !== 'string') throw new Error('Physique response missing feedback.');
      return { feedback: row.feedback, refused: Boolean(row.refused) };
    },
    photos.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } }))
  );
  if (result) return { model: result.model, promptVersion: PHYSIQUE_COMPARE_PROMPT_VERSION, ...result.value };
  return {
    model: 'local-physique-fallback',
    promptVersion: PHYSIQUE_COMPARE_PROMPT_VERSION,
    feedback: 'I can compare these only in a general, body-neutral way. Keep photo conditions consistent and pair visual notes with strength, weight, and energy trends.',
    refused: false,
  };
}

export async function generateCouncilPlan(summary: WeeklySummary, detectorMessages: string[]): Promise<{ model: string; promptVersion: string; plan: CouncilPlan }> {
  const sequence = mockSequence('GEMINI_MOCK_COUNCIL_RESPONSE_SEQUENCE', (value) => councilPlanSchema.parse(value));
  if (sequence) return { model: 'mock-gemini', promptVersion: COUNCIL_PROMPT_VERSION, plan: sequence };
  const mock = Deno.env.get('GEMINI_MOCK_COUNCIL_RESPONSE');
  if (mock) return { model: 'mock-gemini', promptVersion: COUNCIL_PROMPT_VERSION, plan: councilPlanSchema.parse(JSON.parse(mock)) };
  const result = await geminiJson(councilPrompt(summary, detectorMessages), (value) => councilPlanSchema.parse(value));
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
