import { assertEquals } from 'jsr:@std/assert@1';

import { parseAssistantSse } from '../_shared/index.ts';
import { app } from './index.ts';
import { admin, apiAs, createTestUser, deleteTestUser, userDb } from './test-helpers.ts';

function interaction(id: string, text: string) {
  return [
    { event_type: 'interaction.created', interaction: { id, status: 'in_progress' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'text', text } },
    { event_type: 'interaction.completed', interaction: { id, status: 'completed', usage: { total_tokens: 9 } } },
  ];
}

function proposalInteraction(id: string, name: string, args: unknown) {
  return [
    { event_type: 'interaction.created', interaction: { id, status: 'in_progress' } },
    { event_type: 'step.start', index: 0, step: { id: `call-${id}`, type: 'function_call', name, arguments: args } },
    { event_type: 'step.stop', index: 0 },
    { event_type: 'interaction.completed', interaction: { id, status: 'requires_action', usage: { total_tokens: 20 } } },
  ];
}

Deno.test('assistant chat streams, persists, resumes, enforces quota, and isolates both tables', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  Deno.env.set('ASSISTANT_DAILY_QUOTA', '1');
  Deno.env.set('GEMINI_MOCK_INTERACTION_SEQUENCE', JSON.stringify([interaction('mock-interaction-1', 'Your recent rhythm looks steady.') ]));
  try {
    const response = await app.request('http://localhost/api/assistant/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'How are my workouts going?' }),
    });
    assertEquals(response.status, 200);
    assertEquals(response.headers.get('content-type')?.includes('text/event-stream'), true);
    const events = parseAssistantSse([await response.text()]);
    assertEquals(events.some((event) => event.type === 'text' && event.delta.includes('steady')), true);
    const done = events.find((event) => event.type === 'done');
    if (!done || done.type !== 'done') throw new Error('Missing done event.');

    const ownThread = await app.request(`http://localhost/api/assistant/threads/${done.thread_id}`, {
      headers: { Authorization: `Bearer ${a.token}` },
    });
    assertEquals(ownThread.status, 200);
    const ownBody = await ownThread.json();
    assertEquals(ownBody.data.messages.map((message: { role: string }) => message.role), ['user', 'assistant']);

    const otherThread = await app.request(`http://localhost/api/assistant/threads/${done.thread_id}`, {
      headers: { Authorization: `Bearer ${b.token}` },
    });
    assertEquals(otherThread.status, 404);

    // Direct PostgREST reads prove RLS separately for both new tables.
    const bDb = userDb(b.token);
    const [{ data: bThreads }, { data: bMessages }] = await Promise.all([
      bDb.from('assistant_threads').select('id').eq('id', done.thread_id),
      bDb.from('assistant_messages').select('id').eq('thread_id', done.thread_id),
    ]);
    assertEquals(bThreads, []);
    assertEquals(bMessages, []);

    const limited = await app.request('http://localhost/api/assistant/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: done.thread_id, message: 'And today?' }),
    });
    assertEquals(limited.status, 429);
    assertEquals((await limited.json()).error.code, 'RATE_LIMITED');
  } finally {
    Deno.env.delete('ASSISTANT_DAILY_QUOTA');
    Deno.env.delete('GEMINI_MOCK_INTERACTION_SEQUENCE');
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('a failed turn persists partial progress instead of leaving a dangling user message', async () => {
  const a = await createTestUser();
  const prevQuota = Deno.env.get('ASSISTANT_DAILY_QUOTA');
  Deno.env.set('ASSISTANT_DAILY_QUOTA', '50');
  // Partial text, then the stream errors mid-turn.
  Deno.env.set('GEMINI_MOCK_INTERACTION_SEQUENCE', JSON.stringify([[
    { event_type: 'interaction.created', interaction: { id: 'mock-fail-1', status: 'in_progress' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'Looking at your training, ' } },
    { event_type: 'error', error: { message: 'upstream exploded' } },
  ]]));
  try {
    const response = await app.request('http://localhost/api/assistant/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'How is my training?' }),
    });
    // The stream itself is a healthy 200; the failure is carried as an SSE error event.
    assertEquals(response.status, 200);
    const events = parseAssistantSse([await response.text()]);
    const errorEvent = events.find((event) => event.type === 'error');
    if (!errorEvent || errorEvent.type !== 'error') throw new Error('Missing error event.');
    assertEquals(errorEvent.code, 'UPSTREAM_ERROR');
    assertEquals(events.some((event) => event.type === 'done'), false);

    // The thread must NOT be left with a user message and no reply.
    const threads = await app.request('http://localhost/api/assistant/threads', {
      headers: { Authorization: `Bearer ${a.token}` },
    });
    const threadId = (await threads.json()).data[0].id;
    const detail = await app.request(`http://localhost/api/assistant/threads/${threadId}`, {
      headers: { Authorization: `Bearer ${a.token}` },
    });
    const messages = (await detail.json()).data.messages as {
      role: string; content: string; failed: boolean;
    }[];
    assertEquals(messages.map((m) => m.role), ['user', 'assistant']);
    // Partial text is kept, and the turn is flagged so the UI can label it.
    assertEquals(messages[1].failed, true);
    assertEquals(messages[1].content, 'Looking at your training, ');
  } finally {
    Deno.env.delete('GEMINI_MOCK_INTERACTION_SEQUENCE');
    if (prevQuota === undefined) Deno.env.delete('ASSISTANT_DAILY_QUOTA');
    else Deno.env.set('ASSISTANT_DAILY_QUOTA', prevQuota);
    await deleteTestUser(a.id);
  }
});

Deno.test('a failed turn still advances last_interaction_id so the next message does not resume stale state', async () => {
  const a = await createTestUser();
  const prevQuota = Deno.env.get('ASSISTANT_DAILY_QUOTA');
  Deno.env.set('ASSISTANT_DAILY_QUOTA', '50');
  Deno.env.set('GEMINI_MOCK_INTERACTION_SEQUENCE', JSON.stringify([[
    { event_type: 'interaction.created', interaction: { id: 'mock-fail-2', status: 'in_progress' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'partial' } },
    { event_type: 'error', error: { message: 'boom' } },
  ]]));
  try {
    const response = await app.request('http://localhost/api/assistant/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Give me advice.' }),
    });
    await response.text();

    const threads = await app.request('http://localhost/api/assistant/threads', {
      headers: { Authorization: `Bearer ${a.token}` },
    });
    const threadId = (await threads.json()).data[0].id;
    const { data } = await userDb(a.token)
      .from('assistant_threads').select('last_interaction_id').eq('id', threadId).single();
    assertEquals(data?.last_interaction_id, 'mock-fail-2');
  } finally {
    Deno.env.delete('GEMINI_MOCK_INTERACTION_SEQUENCE');
    if (prevQuota === undefined) Deno.env.delete('ASSISTANT_DAILY_QUOTA');
    else Deno.env.set('ASSISTANT_DAILY_QUOTA', prevQuota);
    await deleteTestUser(a.id);
  }
});

Deno.test('assistant proposals apply all four kinds idempotently with ownership and safety rails', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    await admin.from('profiles').update({ targets_locked: false, coaching_profile: { allergies: ['peanut'] } }).eq('id', a.id);
    const { data: exercise } = await admin.from('exercises').insert({ user_id: a.id, name: 'Assistant Test Row', muscle_group: 'back', kind: 'strength' }).select('id').single();
    const { data: routine } = await admin.from('routines').insert({ user_id: a.id, name: 'Old routine' }).select('id').single();
    if (!exercise || !routine) throw new Error('Could not seed proposal fixtures.');

    const insertProposal = async (proposal: unknown) => {
      const { data, error } = await admin.from('insights').insert({
        user_id: a.id, kind: 'assistant', content: 'Test proposal', payload: { proposal },
        model: 'mock', prompt_version: 'assistant-hub.v1',
      }).select('id').single();
      if (error || !data) throw new Error(`Could not insert proposal: ${error?.message}`);
      return data.id as string;
    };

    const programId = await insertProposal({
      kind: 'program_revision', title: 'New pull day', routine_id: routine.id,
      days: [{ name: 'Pull', exercises: [{ name: 'Assistant Test Row', exercise_id: exercise.id, sets: 4, reps: 8 }] }],
    });
    const mealId = await insertProposal({
      kind: 'meal_plan', title: 'Simple day', date: '2026-07-21', meals: [{ name: 'Rice bowl', meal_type: 'lunch', macros: { calories: 500, protein_g: 25, carbs_g: 70, fat_g: 12 } }],
    });
    const logsId = await insertProposal({
      kind: 'food_logs', title: 'Log breakfast', entries: [{ food_name: 'Oats', meal_type: 'breakfast', quantity_g: 80, calories: 300, protein_g: 10, carbs_g: 50, fat_g: 7, logged_on: '2026-07-21' }],
    });
    const targetId = await insertProposal({
      kind: 'target_change', title: 'Adjust energy', current: { calorie_target: 2100 }, changes: { calorie_target: 2300 }, rationale: 'Current goal',
    });

    assertEquals((await apiAs(b.token, 'POST', `/assistant/proposals/${programId}/apply`, {})).status, 404);
    for (const id of [programId, mealId, logsId, targetId]) {
      const first = await apiAs(a.token, 'POST', `/assistant/proposals/${id}/apply`, {});
      assertEquals(first.status, 200);
      const second = await apiAs(a.token, 'POST', `/assistant/proposals/${id}/apply`, {});
      assertEquals(second.status, 200);
      assertEquals(new Date(second.body.data.applied_at).getTime(), new Date(first.body.data.applied_at).getTime());
    }
    const { count } = await admin.from('food_logs').select('id', { count: 'exact', head: true }).eq('user_id', a.id).eq('logged_on', '2026-07-21');
    assertEquals(count, 2); // one planned meal + one explicit log, never doubled

    const allergyId = await insertProposal({
      kind: 'food_logs', title: 'Unsafe snack', entries: [{ food_name: 'Peanut bar', meal_type: 'snack', quantity_g: 50, calories: 250, protein_g: 8, carbs_g: 20, fat_g: 16, logged_on: '2026-07-21' }],
    });
    const unsafe = await apiAs(a.token, 'POST', `/assistant/proposals/${allergyId}/apply`, {});
    assertEquals(unsafe.status, 400);
    assertEquals(unsafe.body.error.code, 'VALIDATION_ERROR');

    const lockedId = await insertProposal({
      kind: 'target_change', title: 'Try again', current: { calorie_target: 2300 }, changes: { calorie_target: 2400 }, rationale: 'Follow-up',
    });
    const locked = await apiAs(a.token, 'POST', `/assistant/proposals/${lockedId}/apply`, {});
    assertEquals(locked.status, 400);
    assertEquals(locked.body.error.message.includes('locked'), true);

    const dismissId = await insertProposal({
      kind: 'food_logs', title: 'Skip this', entries: [{ food_name: 'Apple', meal_type: 'snack', quantity_g: 100, calories: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2, logged_on: '2026-07-21' }],
    });
    assertEquals((await apiAs(b.token, 'POST', `/assistant/proposals/${dismissId}/dismiss`)).status, 404);
    const dismissed = await apiAs(a.token, 'POST', `/assistant/proposals/${dismissId}/dismiss`);
    assertEquals(dismissed.status, 200);
    const dismissedAgain = await apiAs(a.token, 'POST', `/assistant/proposals/${dismissId}/dismiss`);
    assertEquals(new Date(dismissedAgain.body.data.dismissed_at).getTime(), new Date(dismissed.body.data.dismissed_at).getTime());
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('rich proposals preserve ingredients, apply edited food, log workouts, save recipes, and reject stale/allergenic versions', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    await admin.from('profiles').update({ coaching_profile: { allergies: ['peanut'] } }).eq('id', a.id);
    const { data: exercise } = await admin.from('exercises').insert({ name: `Bench ${a.id}`, muscle_group: 'chest', kind: 'strength' }).select('id').single();
    if (!exercise) throw new Error('Could not seed exercise.');
    const insertProposal = async (proposal: unknown, extraPayload: Record<string, unknown> = {}) => {
      const { data, error } = await admin.from('insights').insert({
        user_id: a.id, kind: 'assistant', content: 'Rich proposal', payload: { proposal, ...extraPayload }, model: 'mock', prompt_version: 'assistant-hub.v1',
      }).select('id').single();
      if (error || !data) throw new Error(error?.message ?? 'Could not seed proposal.');
      return data.id as string;
    };
    const chicken = {
      name: 'Chicken breast', quantity_g: 150, calories_per_100g: 165, protein_per_100g: 31,
      carbs_per_100g: 0, fat_per_100g: 3.6, source: 'usda', fdc_id: 171077,
      micronutrients_per_100g: { fiber_g: null, sugar_g: 0, saturated_fat_g: 1, sodium_mg: 74, potassium_mg: 256, calcium_mg: 15, iron_mg: 1, vitamin_c_mg: null },
    };
    const foodProposal = {
      kind: 'food_logs', title: 'Log chicken', entries: [{ food_name: 'Chicken breast', meal_type: 'dinner', quantity_g: 150, calories: 247.5, protein_g: 46.5, carbs_g: 0, fat_g: 5.4, source: 'manual', logged_on: '2026-07-22', ingredients: [chicken] }],
    };
    const foodId = await insertProposal(foodProposal);
    const edited = { ...foodProposal, entries: [{ ...foodProposal.entries[0], quantity_g: 200, calories: 330, protein_g: 62, fat_g: 7.2, ingredients: [{ ...chicken, quantity_g: 200 }] }] };
    assertEquals((await apiAs(b.token, 'POST', `/assistant/proposals/${foodId}/apply`, { proposal: edited })).status, 404);
    const appliedFood = await apiAs(a.token, 'POST', `/assistant/proposals/${foodId}/apply`, { proposal: edited });
    assertEquals(appliedFood.status, 200);
    const { data: logged } = await admin.from('food_logs').select('calories, protein_g, ingredients').eq('id', appliedFood.body.data.result.created_ids[0]).single();
    assertEquals(Number(logged?.calories), 330);
    assertEquals(Number(logged?.protein_g), 62);
    assertEquals((logged?.ingredients as unknown[]).length, 1);
    const totals = await apiAs(a.token, 'GET', '/food-logs/totals?date=2026-07-22');
    assertEquals(totals.status, 200);
    assertEquals(totals.body.data.micronutrients.values.sodium_mg, 148);
    assertEquals(totals.body.data.micronutrients.partial.sodium_mg, false);
    assertEquals(totals.body.data.micronutrients.partial.fiber_g, true);
    assertEquals(totals.body.data.micronutrients.approximate, false);

    const workoutId = await insertProposal({
      kind: 'workout_log', title: 'Push day', logged_on: '2026-07-22', duration_min: 48,
      exercises: [{ name: `Bench ${a.id}`, exercise_id: exercise.id, kind: 'strength', sets: [{ reps: 8, weight_kg: 80 }, { reps: 7, weight_kg: 80 }] }],
    });
    const workout = await apiAs(a.token, 'POST', `/assistant/proposals/${workoutId}/apply`, {});
    assertEquals(workout.status, 200);
    assertEquals(workout.body.data.result.message, 'Workout logged');
    const { data: session } = await admin.from('workout_sessions').select('workout_sets(*)').eq('id', workout.body.data.result.workout_id).single();
    assertEquals(session?.workout_sets.length, 2);

    const recipeId = await insertProposal({ kind: 'recipe', title: 'Save dinner prep', name: 'Chicken prep', servings: 2, ingredients: [chicken] });
    const recipe = await apiAs(a.token, 'POST', `/assistant/proposals/${recipeId}/apply`, {});
    assertEquals(recipe.status, 200);
    assertEquals(recipe.body.data.result.message, 'Recipe saved');
    assertEquals((await apiAs(a.token, 'POST', `/assistant/proposals/${recipeId}/apply`, {})).body.data.result.recipe_id, recipe.body.data.result.recipe_id);
    const { data: savedRecipe } = await admin.from('recipes').select('recipe_items(*)').eq('id', recipe.body.data.result.recipe_id).single();
    assertEquals(savedRecipe?.recipe_items.length, 1);

    for (const order of ['save-first', 'log-first']) {
      const id = await insertProposal({ ...foodProposal, title: order });
      const save = () => apiAs(a.token, 'POST', `/assistant/proposals/${id}/save-recipe`, {});
      const apply = () => apiAs(a.token, 'POST', `/assistant/proposals/${id}/apply`, {});
      const first = order === 'save-first' ? await save() : await apply();
      const second = order === 'save-first' ? await apply() : await save();
      assertEquals(first.status, 200); assertEquals(second.status, 200);
      assertEquals((await save()).body.data.result.message, 'Recipe saved');
    }

    const unsafeId = await insertProposal({
      ...foodProposal, title: 'Unsafe satay', entries: [{ ...foodProposal.entries[0], food_name: 'Satay', ingredients: [{ ...chicken, name: 'Groundnut sauce' }] }],
    });
    const unsafe = await apiAs(a.token, 'POST', `/assistant/proposals/${unsafeId}/apply`, {});
    assertEquals(unsafe.status, 400);
    assertEquals(unsafe.body.error.message.includes('peanut'), true);

    const staleId = await insertProposal(foodProposal, { dismiss_reason: 'superseded' });
    await admin.from('insights').update({ dismissed_at: new Date().toISOString() }).eq('id', staleId);
    const currentId = await insertProposal({ ...foodProposal, title: 'Current version', supersedes_insight_id: staleId }, { supersedes_insight_id: staleId });
    const stale = await apiAs(a.token, 'POST', `/assistant/proposals/${staleId}/apply`, {});
    assertEquals(stale.status, 400);
    assertEquals(stale.body.error.message.includes('updated'), true);
    assertEquals((await apiAs(a.token, 'POST', `/assistant/proposals/${currentId}/apply`, {})).status, 200);
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('conversational proposal revision supersedes the earlier card and thread marks only the current version actionable', async () => {
  const a = await createTestUser();
  const previousQuota = Deno.env.get('ASSISTANT_DAILY_QUOTA');
  Deno.env.set('ASSISTANT_DAILY_QUOTA', '50');
  const ingredient = { name: 'Rice', quantity_g: 100, calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3, source: 'usda' };
  const proposal = { kind: 'food_logs', title: 'Log rice', entries: [{ food_name: 'Rice', meal_type: 'lunch', quantity_g: 100, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, source: 'manual', logged_on: '2026-07-22', ingredients: [ingredient] }] };
  const { kind: _kind, ...toolProposal } = proposal;
  try {
    Deno.env.set('GEMINI_MOCK_INTERACTION_SEQUENCE', JSON.stringify([
      proposalInteraction('proposal-v1', 'propose_food_logs', toolProposal), interaction('proposal-v1-done', 'Review this first version.'),
    ]));
    const first = await app.request('http://localhost/api/assistant/chat', { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Log rice.' }) });
    const firstDone = parseAssistantSse([await first.text()]).find((event) => event.type === 'done');
    if (!firstDone || firstDone.type !== 'done') throw new Error('First proposal did not finish.');
    let detail = await apiAs(a.token, 'GET', `/assistant/threads/${firstDone.thread_id}`);
    const oldId = detail.body.data.messages.find((message: { proposal?: { id: string } }) => message.proposal)?.proposal.id;
    if (!oldId) throw new Error('First proposal missing.');

    Deno.env.set('GEMINI_MOCK_INTERACTION_SEQUENCE', JSON.stringify([
      proposalInteraction('proposal-v2', 'propose_food_logs', { ...toolProposal, title: 'Log more rice', supersedes_insight_id: oldId }), interaction('proposal-v2-done', 'I updated the amount.'),
    ]));
    const second = await app.request('http://localhost/api/assistant/chat', { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: firstDone.thread_id, message: 'Update that proposal.' }) });
    await second.text();
    detail = await apiAs(a.token, 'GET', `/assistant/threads/${firstDone.thread_id}`);
    const proposals = detail.body.data.messages.map((message: { proposal?: unknown }) => message.proposal).filter(Boolean);
    assertEquals(proposals.length, 2);
    assertEquals(proposals[0].superseded, true);
    assertEquals(proposals[1].superseded, false);
    const stale = await apiAs(a.token, 'POST', `/assistant/proposals/${oldId}/apply`, {});
    assertEquals(stale.status, 400);
    assertEquals(stale.body.error.message.includes('updated'), true);
  } finally {
    Deno.env.delete('GEMINI_MOCK_INTERACTION_SEQUENCE');
    if (previousQuota == null) Deno.env.delete('ASSISTANT_DAILY_QUOTA'); else Deno.env.set('ASSISTANT_DAILY_QUOTA', previousQuota);
    await deleteTestUser(a.id);
  }
});

Deno.test('conversational workout proposals normalize a catalogue exercise before review and apply transactionally', async () => {
  const a = await createTestUser();
  const previousQuota = Deno.env.get('ASSISTANT_DAILY_QUOTA');
  Deno.env.set('ASSISTANT_DAILY_QUOTA', '50');
  const exerciseName = `Custom split squat ${a.id}`;
  const { data: exercise, error } = await admin.from('exercises').insert({
    user_id: a.id, name: exerciseName, muscle_group: 'legs', kind: 'strength',
  }).select('id').single();
  if (error || !exercise) throw new Error(`Could not seed custom exercise: ${error?.message}`);
  const proposal = {
    kind: 'workout_log', title: 'Leg day', logged_on: '2026-07-22', duration_min: 35,
    exercises: [{ name: `${exerciseName.toUpperCase()} (custom)`, kind: 'strength', sets: [{ reps: 10, weight_kg: 24 }] }],
  };
  try {
    Deno.env.set('GEMINI_MOCK_INTERACTION_SEQUENCE', JSON.stringify([
      proposalInteraction('workout-proposal', 'propose_workout_log', {
        title: proposal.title, logged_on: proposal.logged_on, duration_min: proposal.duration_min,
        exercises: proposal.exercises.map((exercise) => ({
          name: exercise.name, kind: exercise.kind,
          sets: exercise.sets.map((set) => ({ count: 1, ...set })),
        })),
      }),
      interaction('workout-proposal-done', 'Review the workout before logging it.'),
    ]));
    const response = await app.request('http://localhost/api/assistant/chat', {
      method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Log the workout I just did.' }),
    });
    const streamed = parseAssistantSse([await response.text()]);
    const proposalEvent = streamed.find((event) => event.type === 'proposal');
    if (!proposalEvent || proposalEvent.type !== 'proposal') throw new Error('Workout proposal event missing.');
    assertEquals(proposalEvent.proposal?.kind, 'workout_log');
    assertEquals(proposalEvent.proposal?.title, 'Leg day');
    assertEquals(streamed.some((event) => event.type === 'text' && event.delta.includes('workout together below')), true);
    assertEquals(streamed.some((event) => event.type === 'text' && event.delta.includes('in your app')), false);
    const done = streamed.find((event) => event.type === 'done');
    if (!done || done.type !== 'done') throw new Error('Workout proposal did not finish.');
    const thread = await apiAs(a.token, 'GET', `/assistant/threads/${done.thread_id}`);
    const state = thread.body.data.messages.find((message: { proposal?: { id: string } }) => message.proposal)?.proposal;
    assertEquals(state.proposal.exercises[0].exercise_id, exercise.id);
    const applied = await apiAs(a.token, 'POST', `/assistant/proposals/${state.id}/apply`, {});
    assertEquals(applied.status, 200);
    const { data: workout } = await admin.from('workout_sessions').select('workout_sets(exercise_id, reps, weight_kg)').eq('id', applied.body.data.result.workout_id).single();
    assertEquals(workout?.workout_sets, [{ exercise_id: exercise.id, reps: 10, weight_kg: 24 }]);
  } finally {
    Deno.env.delete('GEMINI_MOCK_INTERACTION_SEQUENCE');
    if (previousQuota == null) Deno.env.delete('ASSISTANT_DAILY_QUOTA'); else Deno.env.set('ASSISTANT_DAILY_QUOTA', previousQuota);
    await deleteTestUser(a.id);
  }
});

Deno.test('workout proposals log unknown exercise names without asking the user to match an internal ID', async () => {
  const a = await createTestUser();
  const proposal = {
    kind: 'workout_log', title: 'Travel workout', logged_on: '2026-07-22',
    exercises: [{ name: `Hotel cable pull ${a.id}`, kind: 'strength', sets: [{ reps: 12, weight_kg: 20 }] }],
  };
  try {
    const { data: insight, error } = await admin.from('insights').insert({
      user_id: a.id, kind: 'assistant', content: 'Workout ready to log.', payload: { proposal },
      model: 'mock', prompt_version: 'assistant-hub.v2',
    }).select('id').single();
    if (error || !insight) throw new Error(`Could not seed workout proposal: ${error?.message}`);
    const applied = await apiAs(a.token, 'POST', `/assistant/proposals/${insight.id}/apply`, {});
    assertEquals(applied.status, 200);
    const { data: workout } = await admin.from('workout_sessions').select('workout_sets(exercise, exercise_id, reps, weight_kg)')
      .eq('id', applied.body.data.result.workout_id).single();
    assertEquals(workout?.workout_sets, [{ exercise: proposal.exercises[0].name, exercise_id: null, reps: 12, weight_kg: 20 }]);
  } finally {
    await deleteTestUser(a.id);
  }
});
