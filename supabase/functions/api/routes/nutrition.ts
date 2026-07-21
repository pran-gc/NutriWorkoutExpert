// AI meal planner — the nutritionist (NWE-121). Builds full context (targets +
// training-day awareness + logged-food continuity + dietary/coaching profile),
// generates a day plan, supports chat-to-edit, and logs a chosen meal to food_logs.
import { Hono } from 'hono';
import { z } from 'zod';

import {
  REFINE_MAX_TURNS_PER_DRAFT,
  coachChatMessageSchema,
  generateMealPlanSchema,
  logPlannedMealSchema,
  mealPlanSchema,
  mealPlanTotals,
  ok,
  refineMealPlanRequestSchema,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import { buildCoachContext, coachContextLines } from '../services/coachContext.ts';
import { generateMealPlan, refineMealPlan } from '../services/gemini.ts';
import { MEAL_PLAN_PROMPT_VERSION } from '../prompts/meal-plan.v1.ts';
import type { Env } from '../types.ts';

type Db = Env['Variables']['db'];

function bodyLine(profile: Record<string, unknown> | null, latestWeightKg: number | null): string {
  if (!profile) return 'an adult with unspecified stats';
  const parts: string[] = [];
  if (profile.birth_year) parts.push(`${new Date().getUTCFullYear() - Number(profile.birth_year)}yo`);
  if (profile.sex) parts.push(String(profile.sex));
  if (profile.height_cm) parts.push(`${profile.height_cm}cm`);
  if (latestWeightKg) parts.push(`~${latestWeightKg}kg`);
  if (profile.goal_type) parts.push(`goal: ${profile.goal_type}`);
  return parts.join(', ') || 'an adult with unspecified stats';
}

// Is `date` a training day? True if the user has a routine whose exercises exist
// (they have a plan) AND they typically train — approximated by "has any routine";
// stronger signal: they logged a session in the last 10 days on the same weekday.
async function isTrainingDay(db: Db, userId: string, date: string): Promise<boolean> {
  const target = new Date(`${date}T00:00:00Z`).getUTCDay();
  const since = new Date(`${date}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 28);
  const { data } = await db
    .from('workout_sessions')
    .select('logged_on')
    .eq('user_id', userId)
    .gte('logged_on', since.toISOString().slice(0, 10));
  const trainedThatWeekday = (data ?? []).some(
    (s) => new Date(`${s.logged_on}T00:00:00Z`).getUTCDay() === target
  );
  if (trainedThatWeekday) return true;
  // Fallback: if they have routines at all, treat weekdays as likely training days.
  const { count } = await db.from('routines').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  return (count ?? 0) > 0 && target >= 1 && target <= 5;
}

async function buildPlanContext(db: Db, userId: string, date: string) {
  const [{ data: profile }, { data: weights }, { data: foods }] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).single(),
    db.from('weight_logs').select('weight_kg').eq('user_id', userId).order('logged_on', { ascending: false }).limit(1),
    db.from('food_logs').select('food_name').eq('user_id', userId).order('created_at', { ascending: false }).limit(60),
  ]);
  const latestWeight = weights?.[0]?.weight_kg ? Number(weights[0].weight_kg) : null;
  const recent = [...new Set((foods ?? []).map((f) => f.food_name))].slice(0, 20);
  const coach = (profile?.coaching_profile ?? {}) as { meals_per_day?: number };
  const coachCtx = await buildCoachContext(db, userId);

  return {
    date,
    isTrainingDay: await isTrainingDay(db, userId, date),
    targets: {
      calories: profile?.calorie_target ?? null,
      protein_g: profile?.protein_target_g ?? null,
      carbs_g: profile?.carbs_target_g ?? null,
      fat_g: profile?.fat_target_g ?? null,
    },
    bodyLine: bodyLine(profile ?? null, latestWeight),
    mealsPerDay: Math.min(6, Math.max(1, coach.meals_per_day ?? 3)),
    recentFoods: recent,
    contextLines: coachContextLines(coachCtx),
  };
}

export const nutritionRoute = new Hono<Env>()
  .post('/plan', zval('json', generateMealPlanSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { date } = c.req.valid('json');

    // Quota: 3 plans/day (same discipline as program generation).
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 1);
    const { count } = await db
      .from('insights')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('kind', 'nutrition')
      .gte('created_at', since.toISOString());
    if ((count ?? 0) >= 3) throw new HttpError('RATE_LIMITED', 'Daily meal-plan limit reached.');

    const ctx = await buildPlanContext(db, user.id, date);
    const generated = await generateMealPlan(ctx);

    const { data: draft, error } = await db
      .from('insights')
      .insert({
        user_id: user.id,
        kind: 'nutrition',
        content: `Meal plan for ${date}: ${generated.plan.title}`,
        payload: { plan: generated.plan, date, messages: [] },
        model: generated.model,
        prompt_version: generated.promptVersion,
      })
      .select('id')
      .single();
    if (error || !draft) throw new HttpError('INTERNAL', 'Could not store meal plan.');
    return c.json(ok({ plan: generated.plan, insight_id: draft.id }));
  })
  .post('/plan/refine', zval('json', refineMealPlanRequestSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { insight_id, message } = c.req.valid('json');

    const { data: draft } = await db
      .from('insights')
      .select('*')
      .eq('id', insight_id)
      .eq('user_id', user.id)
      .eq('kind', 'nutrition')
      .maybeSingle();
    if (!draft) throw new HttpError('NOT_FOUND', 'Meal plan not found.');

    const payload = (draft.payload ?? {}) as Record<string, unknown>;
    const planParsed = mealPlanSchema.safeParse(payload.draft_plan ?? payload.plan);
    if (!planParsed.success) throw new HttpError('VALIDATION_ERROR', 'Draft plan is not refinable.');
    const messages = z.array(coachChatMessageSchema).catch([]).parse(payload.messages ?? []);
    if (messages.length >= REFINE_MAX_TURNS_PER_DRAFT * 2) {
      throw new HttpError('RATE_LIMITED', 'Refinement limit reached for this plan — save it or generate a new one.');
    }

    const coachCtx = await buildCoachContext(db, user.id);
    const result = await refineMealPlan({
      plan: planParsed.data,
      messages: messages.slice(-8),
      userMessage: message,
      contextLines: coachContextLines(coachCtx),
    });
    if (!result) throw new HttpError('UPSTREAM_ERROR', 'The nutritionist is busy right now — try again in a moment.');

    const updatedPayload = {
      ...payload,
      messages: [...messages, { role: 'user', text: message }, { role: 'coach', text: result.turn.reply }],
      ...(result.turn.updated_plan ? { draft_plan: result.turn.updated_plan } : {}),
    };
    await db.from('insights').update({ payload: updatedPayload, model: result.model }).eq('id', insight_id).eq('user_id', user.id);
    return c.json(ok({ reply: result.turn.reply, updated_plan: result.turn.updated_plan ?? null }));
  })
  .post('/plan/log-meal', zval('json', logPlannedMealSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { insight_id, meal_index, logged_on } = c.req.valid('json');

    const { data: draft } = await db
      .from('insights')
      .select('payload')
      .eq('id', insight_id)
      .eq('user_id', user.id)
      .eq('kind', 'nutrition')
      .maybeSingle();
    if (!draft) throw new HttpError('NOT_FOUND', 'Meal plan not found.');

    const payload = (draft.payload ?? {}) as Record<string, unknown>;
    const planParsed = mealPlanSchema.safeParse(payload.draft_plan ?? payload.plan);
    if (!planParsed.success) throw new HttpError('VALIDATION_ERROR', 'Plan is not loggable.');
    const meal = planParsed.data.meals[meal_index];
    if (!meal) throw new HttpError('NOT_FOUND', 'Meal not found in plan.');

    const { data, error } = await db
      .from('food_logs')
      .insert({
        user_id: user.id,
        food_name: meal.name,
        meal_type: meal.meal_type,
        quantity_g: 100, // serving-based, like recipe logs (NWE-202)
        calories: Math.round(Number(meal.macros.calories) * 10) / 10,
        protein_g: Math.round(Number(meal.macros.protein_g) * 10) / 10,
        carbs_g: Math.round(Number(meal.macros.carbs_g) * 10) / 10,
        fat_g: Math.round(Number(meal.macros.fat_g) * 10) / 10,
        source: 'manual',
        logged_on,
      })
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not log meal.');
    return c.json(ok(data));
  });

// Re-export for tests that want the totals helper alongside the route.
export { mealPlanTotals, MEAL_PLAN_PROMPT_VERSION };
