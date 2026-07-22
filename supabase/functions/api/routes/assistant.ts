import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import {
  assistantChatSchema,
  assistantProposalApplySchema,
  assistantProposalParamSchema,
  assistantProposalSchema,
  assistantThreadParamSchema,
  createWorkoutSessionSchema,
  saveProposalRecipeSchema,
  type AssistantToolTrace,
  type AssistantProposal,
  fail,
  ok,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import { createInteractionTransport } from '../services/agent/interactions.ts';
import { AgentLoopError, runAgentLoop } from '../services/agent/loop.ts';
import { interactionModel } from '../services/agent/model.ts';
import { createToolRegistry } from '../services/agent/registry.ts';
import { createRecipe } from '../services/recipes.ts';
import { createWorkoutSession } from '../services/workouts.ts';
import type { Env } from '../types.ts';

function dailyQuota(): number {
  const configured = Number(Deno.env.get('ASSISTANT_DAILY_QUOTA') ?? 50);
  return Number.isFinite(configured) ? Math.max(1, Math.floor(configured)) : 50;
}

function utcDayStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function threadTitle(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function proposalSummary(proposal: AssistantProposal): string {
  if (proposal.summary) return proposal.summary;
  if (proposal.kind === 'program_revision') return `${proposal.days.length} workout day${proposal.days.length === 1 ? '' : 's'} ready to review.`;
  if (proposal.kind === 'meal_plan') return `${proposal.meals.length} meal${proposal.meals.length === 1 ? '' : 's'} for ${proposal.date}.`;
  if (proposal.kind === 'food_logs') return `${proposal.entries.length} food entr${proposal.entries.length === 1 ? 'y' : 'ies'} ready to log.`;
  if (proposal.kind === 'workout_log') return `${proposal.exercises.length} exercise${proposal.exercises.length === 1 ? '' : 's'} ready to log.`;
  if (proposal.kind === 'recipe') return `${proposal.ingredients.length} ingredient${proposal.ingredients.length === 1 ? '' : 's'} ready to save.`;
  return `${Object.keys(proposal.changes).length} target change${Object.keys(proposal.changes).length === 1 ? '' : 's'} ready to review.`;
}

const ALLERGEN_ALIASES: Record<string, string[]> = {
  peanut: ['peanut', 'groundnut', 'satay', 'arachis'], groundnut: ['peanut', 'groundnut', 'satay', 'arachis'],
  milk: ['milk', 'cream', 'butter', 'cheese', 'whey', 'casein', 'yoghurt', 'yogurt'],
  dairy: ['milk', 'cream', 'butter', 'cheese', 'whey', 'casein', 'yoghurt', 'yogurt'],
  egg: ['egg', 'albumen', 'mayonnaise'], soy: ['soy', 'soya', 'tofu', 'tempeh', 'edamame'],
  wheat: ['wheat', 'flour', 'semolina', 'couscous'], sesame: ['sesame', 'tahini'],
};

async function assertNoAllergens(db: Env['Variables']['db'], userId: string, proposal: AssistantProposal) {
  if (proposal.kind !== 'meal_plan' && proposal.kind !== 'food_logs') return;
  const { data } = await db.from('profiles').select('coaching_profile').eq('id', userId).single();
  const profile = (data?.coaching_profile ?? {}) as { allergies?: unknown };
  const allergies = Array.isArray(profile.allergies) ? profile.allergies.filter((v): v is string => typeof v === 'string') : [];
  const ingredientNames = proposal.kind === 'food_logs'
    ? proposal.entries.flatMap((entry) => entry.ingredients?.map((ingredient) => ingredient.name) ?? [entry.food_name])
    : proposal.meals.flatMap((meal) => meal.recipe.ingredients);
  const normalized = ingredientNames.map((name) => name.toLocaleLowerCase());
  const found = allergies.find((allergy) => {
    const key = allergy.toLocaleLowerCase();
    const aliases = ALLERGEN_ALIASES[key] ?? [key];
    return normalized.some((name) => aliases.some((alias) => name.includes(alias)));
  });
  if (found) throw new HttpError('VALIDATION_ERROR', `This proposal includes ${found}, which is listed as an allergy. Nothing was changed.`);
}

async function applyProposal(db: Env['Variables']['db'], userId: string, proposal: AssistantProposal): Promise<Record<string, unknown>> {
  await assertNoAllergens(db, userId, proposal);
  if (proposal.kind === 'food_logs') {
    const { data, error } = await db.from('food_logs').insert(proposal.entries.map((entry) => ({ ...entry, ingredients: entry.ingredients ?? null, user_id: userId }))).select('id');
    if (error) throw new HttpError('INTERNAL', 'Could not add the proposed food logs.');
    return { kind: proposal.kind, created_ids: (data ?? []).map((row) => row.id), message: 'Added to your food log' };
  }
  if (proposal.kind === 'meal_plan') {
    const rows = proposal.meals.map((meal) => ({
      user_id: userId, food_name: meal.name, meal_type: meal.meal_type, quantity_g: 100,
      calories: meal.macros.calories, protein_g: meal.macros.protein_g, carbs_g: meal.macros.carbs_g,
      fat_g: meal.macros.fat_g, source: 'manual', logged_on: proposal.date,
    }));
    const { data, error } = await db.from('food_logs').insert(rows).select('id');
    if (error) throw new HttpError('INTERNAL', 'Could not add the proposed meal plan.');
    return { kind: proposal.kind, created_ids: (data ?? []).map((row) => row.id), message: 'Meal plan added to your food log' };
  }
  if (proposal.kind === 'target_change') {
    const { data: profile, error: loadError } = await db.from('profiles').select('targets_locked').eq('id', userId).single();
    if (loadError || !profile) throw new HttpError('NOT_FOUND', 'Profile not found.');
    if (profile.targets_locked) throw new HttpError('VALIDATION_ERROR', 'Your targets are locked. Unlock them in Profile before approving this change.');
    const { data, error } = await db.from('profiles').update({ ...proposal.changes, targets_locked: true }).eq('id', userId).select().single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not update your targets.');
    return { kind: proposal.kind, message: 'Targets updated' };
  }
  if (proposal.kind === 'workout_log') {
    const workout = createWorkoutSessionSchema.parse({
      title: proposal.title, notes: proposal.notes ?? null, duration_min: proposal.duration_min ?? null, logged_on: proposal.logged_on,
      sets: proposal.exercises.flatMap((exercise) => exercise.sets.map((set, index) => ({
        exercise: exercise.name, exercise_id: exercise.exercise_id, set_number: index + 1,
        reps: 'reps' in set ? set.reps : null, weight_kg: 'weight_kg' in set ? set.weight_kg ?? null : null,
        duration_min: set.duration_min ?? null, distance_km: 'distance_km' in set ? set.distance_km ?? null : null,
      }))),
    });
    const created = await createWorkoutSession(db, userId, workout);
    return { kind: proposal.kind, workout_id: created.id, message: 'Workout logged' };
  }
  if (proposal.kind === 'recipe') {
    const ingredients = proposal.ingredients.filter((ingredient) => ingredient.quantity_g > 0);
    if (!ingredients.length) throw new HttpError('VALIDATION_ERROR', 'A recipe needs at least one ingredient.');
    const recipe = await createRecipe(db, userId, { name: proposal.name, servings: proposal.servings, items: ingredients.map((ingredient) => ({
      name: ingredient.name, quantity_g: ingredient.quantity_g, calories_per_100g: ingredient.calories_per_100g,
      protein_per_100g: ingredient.protein_per_100g, carbs_per_100g: ingredient.carbs_per_100g, fat_per_100g: ingredient.fat_per_100g,
    })) });
    return { kind: proposal.kind, recipe_id: recipe.id, message: 'Recipe saved' };
  }

  const firstDay = proposal.days[0];
  const { data: routine, error: routineError } = await db.from('routines').select('id')
    .eq('id', proposal.routine_id).eq('user_id', userId).maybeSingle();
  if (routineError || !routine) throw new HttpError('NOT_FOUND', 'Routine not found.');
  const exerciseIds: string[] = [];
  for (const exercise of firstDay.exercises) {
    if (exercise.exercise_id) exerciseIds.push(exercise.exercise_id);
    else {
      const { data } = await db.from('exercises').select('id').ilike('name', exercise.name).limit(1).maybeSingle();
      if (!data?.id) throw new HttpError('VALIDATION_ERROR', `Exercise “${exercise.name}” could not be matched. Nothing was changed.`);
      exerciseIds.push(data.id);
    }
  }
  const { error: updateRoutineError } = await db.from('routines').update({
    name: `${proposal.title} · ${firstDay.name}`, notes: firstDay.rationale || null, source: 'ai',
  }).eq('id', routine.id).eq('user_id', userId);
  if (updateRoutineError) throw new HttpError('INTERNAL', 'Could not update the routine.');
  await db.from('routine_exercises').delete().eq('routine_id', routine.id).eq('user_id', userId);
  const values = firstDay.exercises.map((exercise, position) => ({
    user_id: userId, routine_id: routine.id, exercise_id: exerciseIds[position], position,
    target_sets: Math.max(1, Number.parseInt(String(exercise.sets ?? 3), 10) || 3),
    target_reps: Math.max(1, Number.parseInt(String(exercise.reps ?? 10), 10) || 10),
  }));
  const { error } = await db.from('routine_exercises').insert(values);
  if (error) throw new HttpError('INTERNAL', 'Could not update the routine exercises.');
  return { kind: proposal.kind, routine_id: routine.id, message: 'Routine updated' };
}

function canonicalExerciseName(value: string): string {
  return value
    .replace(/\([^)]*\)/g, ' ')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function resolveWorkoutExercises(db: Env['Variables']['db'], userId: string, proposal: AssistantProposal): Promise<AssistantProposal> {
  if (proposal.kind !== 'workout_log') return proposal;
  const exercises = [];
  for (const exercise of proposal.exercises) {
    if (exercise.exercise_id) {
      const { data } = await db.from('exercises').select('id, kind').eq('id', exercise.exercise_id)
        .or(`user_id.is.null,user_id.eq.${userId}`).maybeSingle();
      exercises.push(data?.kind === exercise.kind ? exercise : { ...exercise, exercise_id: null });
      continue;
    }
    // Stable priority: public exact → public case-insensitive → user's custom exact/case-insensitive.
    let { data } = await db.from('exercises').select('id, kind, user_id').eq('name', exercise.name).is('user_id', null).limit(1).maybeSingle();
    if (!data) data = (await db.from('exercises').select('id, kind, user_id').ilike('name', exercise.name).is('user_id', null).limit(1).maybeSingle()).data;
    if (!data) data = (await db.from('exercises').select('id, kind, user_id').eq('name', exercise.name).eq('user_id', userId).limit(1).maybeSingle()).data;
    if (!data) data = (await db.from('exercises').select('id, kind, user_id').ilike('name', exercise.name).eq('user_id', userId).limit(1).maybeSingle()).data;
    if (!data) {
      const canonical = canonicalExerciseName(exercise.name);
      const { data: candidates } = await db.from('exercises').select('id, name, kind, user_id')
        .eq('kind', exercise.kind).or(`user_id.is.null,user_id.eq.${userId}`).limit(200);
      data = (candidates ?? [])
        .sort((a, b) => Number(a.user_id !== null) - Number(b.user_id !== null))
        .find((candidate) => canonicalExerciseName(candidate.name) === canonical) ?? null;
    }
    exercises.push(data?.kind === exercise.kind ? { ...exercise, exercise_id: data.id } : { ...exercise, exercise_id: null });
  }
  return { ...proposal, exercises };
}

export const assistantRoute = new Hono<Env>()
  .get('/threads', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { data, error } = await db.from('assistant_threads')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(50);
    if (error) throw new HttpError('INTERNAL', 'Could not load assistant threads.');
    return c.json(ok(data ?? []));
  })
  .get('/threads/:id', zval('param', assistantThreadParamSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const { data: thread, error } = await db.from('assistant_threads')
      .select('id, title, created_at, updated_at').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (error) throw new HttpError('INTERNAL', 'Could not load assistant thread.');
    if (!thread) throw new HttpError('NOT_FOUND', 'Assistant thread not found.');
    const { data: messages, error: messagesError } = await db.from('assistant_messages')
      .select('id, role, content, tool_trace, failed, proposal_insight_id, created_at')
      .eq('thread_id', id).eq('user_id', user.id).order('created_at').limit(200);
    if (messagesError) throw new HttpError('INTERNAL', 'Could not load assistant messages.');
    const proposalIds = (messages ?? []).map((message) => message.proposal_insight_id).filter((id): id is string => Boolean(id));
    let proposalById = new Map<string, Record<string, unknown>>();
    if (proposalIds.length) {
      const { data: proposals, error: proposalError } = await db.from('insights')
        .select('id, payload, applied_at, dismissed_at').eq('user_id', user.id).in('id', proposalIds);
      if (proposalError) throw new HttpError('INTERNAL', 'Could not load assistant proposals.');
      proposalById = new Map((proposals ?? []).map((row) => [row.id, {
        id: row.id,
        proposal: (row.payload as Record<string, unknown>)?.proposal,
        apply_result: (row.payload as Record<string, unknown>)?.apply_result ?? null,
        recipe_result: (row.payload as Record<string, unknown>)?.recipe_result ?? null,
        supersedes_insight_id: (row.payload as Record<string, unknown>)?.supersedes_insight_id ?? null,
        superseded: (row.payload as Record<string, unknown>)?.dismiss_reason === 'superseded',
        applied_at: row.applied_at,
        dismissed_at: row.dismissed_at,
      }]));
    }
    return c.json(ok({ ...thread, messages: (messages ?? []).map((message) => ({
      ...message, proposal: message.proposal_insight_id ? proposalById.get(message.proposal_insight_id) ?? null : null,
    })) }));
  })
  .post('/proposals/:id/apply', zval('param', assistantProposalParamSchema), zval('json', assistantProposalApplySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const { data: insight, error } = await db.from('insights').select('*')
      .eq('id', id).eq('user_id', user.id).eq('kind', 'assistant').maybeSingle();
    if (error) throw new HttpError('INTERNAL', 'Could not load the proposal.');
    if (!insight) throw new HttpError('NOT_FOUND', 'Proposal not found.');
    const payload = (insight.payload ?? {}) as Record<string, unknown>;
    if (insight.applied_at) return c.json(ok({
      id, applied_at: insight.applied_at, result: payload.apply_result ?? null,
    }));
    if (insight.dismissed_at) throw new HttpError('VALIDATION_ERROR', payload.dismiss_reason === 'superseded' ? 'This proposal was updated. Review and approve the current version instead.' : 'This proposal was dismissed and cannot be applied.');
    const edited = c.req.valid('json').proposal;
    const parsed = assistantProposalSchema.safeParse(edited ?? payload.proposal);
    if (!parsed.success) throw new HttpError('VALIDATION_ERROR', 'This stored proposal is invalid and was not applied.', parsed.error.flatten());
    const original = assistantProposalSchema.safeParse(payload.proposal);
    if (!original.success || original.data.kind !== parsed.data.kind) throw new HttpError('VALIDATION_ERROR', 'The edited proposal type does not match the original.');
    // Re-resolve after any user edits and for older stored proposals. An
    // unmatched free-text exercise remains valid and logs without a catalogue
    // ID; matching is an internal analytics enhancement, never user work.
    const resolved = await resolveWorkoutExercises(db, user.id, parsed.data);
    const result = await applyProposal(db, user.id, resolved);
    const appliedAt = new Date().toISOString();
    const { error: updateError } = await db.from('insights').update({
      applied_at: appliedAt, payload: { ...payload, proposal: resolved, apply_result: result },
    }).eq('id', id).eq('user_id', user.id).is('applied_at', null);
    if (updateError) throw new HttpError('INTERNAL', 'The change was made, but confirmation could not be saved.');
    return c.json(ok({ id, applied_at: appliedAt, result }));
  })
  .post('/proposals/:id/save-recipe', zval('param', assistantProposalParamSchema), zval('json', saveProposalRecipeSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const { data: insight, error } = await db.from('insights').select('*').eq('id', id).eq('user_id', user.id).eq('kind', 'assistant').maybeSingle();
    if (error) throw new HttpError('INTERNAL', 'Could not load the proposal.');
    if (!insight) throw new HttpError('NOT_FOUND', 'Proposal not found.');
    const payload = (insight.payload ?? {}) as Record<string, unknown>;
    if (payload.dismiss_reason === 'superseded') throw new HttpError('VALIDATION_ERROR', 'This proposal was updated. Use the current version.');
    if (payload.recipe_result) return c.json(ok({ id, result: payload.recipe_result }));
    const parsed = c.req.valid('json').proposal ?? assistantProposalSchema.parse(payload.proposal);
    if (parsed.kind !== 'food_logs') throw new HttpError('VALIDATION_ERROR', 'Only a food proposal can be saved as a recipe.');
    const entry = parsed.entries[0];
    if (!entry?.ingredients?.length) throw new HttpError('VALIDATION_ERROR', 'Ingredient detail is required to save this as a recipe.');
    const recipe = await createRecipe(db, user.id, { name: entry.food_name, servings: 1, items: entry.ingredients.filter((item) => item.quantity_g > 0).map((item) => ({
      name: item.name, quantity_g: item.quantity_g, calories_per_100g: item.calories_per_100g,
      protein_per_100g: item.protein_per_100g, carbs_per_100g: item.carbs_per_100g, fat_per_100g: item.fat_per_100g,
    })) });
    const result = { recipe_id: recipe.id, message: 'Recipe saved' };
    const { error: updateError } = await db.from('insights').update({ payload: { ...payload, recipe_result: result } }).eq('id', id).eq('user_id', user.id);
    if (updateError) throw new HttpError('INTERNAL', 'The recipe was saved, but confirmation could not be stored.');
    return c.json(ok({ id, result }));
  })
  .post('/proposals/:id/dismiss', zval('param', assistantProposalParamSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const { data: insight, error } = await db.from('insights').select('id, applied_at, dismissed_at')
      .eq('id', id).eq('user_id', user.id).eq('kind', 'assistant').maybeSingle();
    if (error) throw new HttpError('INTERNAL', 'Could not load the proposal.');
    if (!insight) throw new HttpError('NOT_FOUND', 'Proposal not found.');
    if (insight.applied_at) throw new HttpError('VALIDATION_ERROR', 'An applied proposal cannot be dismissed.');
    if (insight.dismissed_at) return c.json(ok({ id, dismissed_at: insight.dismissed_at }));
    const dismissedAt = new Date().toISOString();
    const { error: updateError } = await db.from('insights').update({ dismissed_at: dismissedAt })
      .eq('id', id).eq('user_id', user.id).is('dismissed_at', null);
    if (updateError) throw new HttpError('INTERNAL', 'Could not dismiss the proposal.');
    return c.json(ok({ id, dismissed_at: dismissedAt }));
  })
  .post('/chat', zval('json', assistantChatSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { thread_id, message } = c.req.valid('json');
    const requestId = c.req.header('x-request-id')?.slice(0, 100) || crypto.randomUUID();

    const { count, error: quotaError } = await db.from('assistant_messages')
      .select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('role', 'user').gte('created_at', utcDayStart());
    if (quotaError) throw new HttpError('INTERNAL', 'Could not check assistant quota.');
    if ((count ?? 0) >= dailyQuota()) {
      throw new HttpError('RATE_LIMITED', 'You have reached today’s assistant message limit. Please continue tomorrow.');
    }

    let threadId = thread_id;
    let previousInteractionId: string | null = null;
    if (threadId) {
      const { data: thread, error } = await db.from('assistant_threads').select('id, last_interaction_id')
        .eq('id', threadId).eq('user_id', user.id).maybeSingle();
      if (error) throw new HttpError('INTERNAL', 'Could not load assistant thread.');
      if (!thread) throw new HttpError('NOT_FOUND', 'Assistant thread not found.');
      previousInteractionId = thread.last_interaction_id;
    } else {
      const { data: created, error } = await db.from('assistant_threads')
        .insert({ user_id: user.id, title: threadTitle(message) }).select('id').single();
      if (error || !created) throw new HttpError('INTERNAL', 'Could not start assistant thread.');
      threadId = created.id;
    }

    const { error: messageError } = await db.from('assistant_messages')
      .insert({ thread_id: threadId, user_id: user.id, role: 'user', content: message });
    if (messageError) throw new HttpError('INTERNAL', 'Could not save your assistant message.');

    // Persist the assistant turn + advance the thread's interaction pointer.
    // Runs on success AND on failure: a failed turn still records whatever was
    // produced, so the thread never keeps a user message with no reply, and
    // `last_interaction_id` stays in sync with Gemini's server-side state.
    const persistTurn = async (result: {
      text: string;
      trace: AssistantToolTrace[];
      interactionId: string | null;
      proposalInsightId?: string | null;
    }, failed: boolean) => {
      const { data: saved, error: saveError } = await db.from('assistant_messages').insert({
        thread_id: threadId,
        user_id: user.id,
        role: 'assistant',
        content: result.text,
        tool_trace: result.trace,
        failed,
        proposal_insight_id: result.proposalInsightId ?? null,
      }).select('id').single();
      if (saveError || !saved) throw new HttpError('INTERNAL', 'Could not save the assistant reply.');
      if (result.interactionId) {
        await db.from('assistant_threads').update({ last_interaction_id: result.interactionId })
          .eq('id', threadId).eq('user_id', user.id);
      }
      return saved.id as string;
    };

    return streamSSE(c, async (stream) => {
      try {
        const result = await runAgentLoop({
          input: message,
          previousInteractionId,
          context: { db, userId: user.id },
          registry: createToolRegistry(),
          transport: createInteractionTransport(),
          threadId,
          emit: async (event) => { await stream.writeSSE({ event: event.type, data: JSON.stringify(event) }); },
          persistProposal: async (rawProposal) => {
            const proposal = await resolveWorkoutExercises(db, user.id, assistantProposalSchema.parse(rawProposal));
            await assertNoAllergens(db, user.id, proposal);
            const supersedesId = proposal.supersedes_insight_id;
            let previous: { id: string; payload: unknown; applied_at: string | null; dismissed_at: string | null } | null = null;
            if (supersedesId) {
              const { data, error } = await db.from('insights').select('id, payload, applied_at, dismissed_at')
                .eq('id', supersedesId).eq('user_id', user.id).eq('kind', 'assistant').maybeSingle();
              if (error || !data) throw new HttpError('NOT_FOUND', 'The proposal being revised was not found.');
              if (data.applied_at || data.dismissed_at) throw new HttpError('VALIDATION_ERROR', 'Only a current, unapplied proposal can be revised.');
              previous = data;
            }
            const { data: insight, error } = await db.from('insights').insert({
              user_id: user.id, kind: 'assistant', content: proposalSummary(proposal),
              payload: { proposal, supersedes_insight_id: supersedesId ?? null },
              model: interactionModel(),
              prompt_version: 'assistant-hub.v2',
            }).select('id').single();
            if (error || !insight) throw new HttpError('INTERNAL', 'Could not save the assistant proposal.');
            if (previous) {
              const oldPayload = (previous.payload ?? {}) as Record<string, unknown>;
              const { error: supersedeError } = await db.from('insights').update({ dismissed_at: new Date().toISOString(), payload: { ...oldPayload, dismiss_reason: 'superseded', superseded_by_insight_id: insight.id } })
                .eq('id', previous.id).eq('user_id', user.id).is('dismissed_at', null);
              if (supersedeError) {
                await db.from('insights').delete().eq('id', insight.id).eq('user_id', user.id);
                throw new HttpError('INTERNAL', 'Could not replace the earlier proposal.');
              }
            }
            return { insight_id: insight.id, proposal_kind: proposal.kind, proposal };
          },
        });
        const messageId = await persistTurn(result, false);
        const done = { type: 'done' as const, thread_id: threadId, message_id: messageId, interaction_id: result.interactionId };
        await stream.writeSSE({ event: 'done', data: JSON.stringify(done) });
      } catch (error) {
        const body = error instanceof HttpError
          ? fail(error.code, error.message)
          : fail('INTERNAL', 'The assistant could not finish that response.');
        // Best-effort: never let a persistence failure mask the original error.
        if (error instanceof AgentLoopError) {
          try {
            await persistTurn(error.partial, true);
          } catch {
            console.error(JSON.stringify({ scope: 'assistant_persist_failed', thread_id: threadId }));
          }
        }
        console.error(JSON.stringify({
          scope: 'assistant_turn_failed', request_id: requestId, thread_id: threadId,
          code: body.error.code, message: body.error.message,
        }));
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ type: 'error', ...body.error, request_id: requestId }) });
      }
    });
  });
