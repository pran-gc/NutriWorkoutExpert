import { assertEquals } from 'jsr:@std/assert@1';

import { apiAs, createTestUser, deleteTestUser } from './test-helpers.ts';

const TODAY = new Date().toISOString().slice(0, 10);

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.test('insights: weekly summary and generated review are idempotent', async () => {
  const a = await createTestUser();
  try {
    await apiAs(a.token, 'PATCH', '/me', {
      calorie_target: 2100,
      protein_target_g: 140,
      carbs_target_g: 240,
      fat_target_g: 70,
      targets_locked: true,
    });
    await apiAs(a.token, 'POST', '/food-logs', {
      food_name: 'Insight meal',
      meal_type: 'lunch',
      quantity_g: 100,
      calories: 2100,
      protein_g: 120,
      carbs_g: 220,
      fat_g: 65,
      source: 'manual',
      logged_on: TODAY,
    });
    const summary = await apiAs(a.token, 'GET', `/insights/weekly-summary?week=${TODAY}`);
    assertEquals(summary.status, 200);
    assertEquals(summary.body.data.nutrition.daysLogged, 1);

    const first = await apiAs(a.token, 'POST', '/insights/generate', { week: TODAY });
    const second = await apiAs(a.token, 'POST', '/insights/generate', { week: TODAY });
    assertEquals(first.status, 200);
    assertEquals(second.status, 200);
    assertEquals(second.body.data.id, first.body.data.id);
    assertEquals(first.body.data.kind, 'weekly');
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('cron: weekly review generation is idempotent for active users (with valid secret)', async () => {
  const a = await createTestUser();
  const prevSecret = Deno.env.get('CRON_SECRET');
  Deno.env.set('CRON_SECRET', 'test-cron-secret');
  const auth = { 'x-cron-secret': 'test-cron-secret' };
  try {
    await apiAs(a.token, 'POST', '/food-logs', {
      food_name: 'Cron meal',
      meal_type: 'lunch',
      quantity_g: 100,
      calories: 500,
      protein_g: 30,
      carbs_g: 50,
      fat_g: 12,
      source: 'manual',
      logged_on: TODAY,
    });
    const first = await apiAs(null, 'POST', '/cron/weekly-review', undefined, auth);
    const second = await apiAs(null, 'POST', '/cron/weekly-review', undefined, auth);
    assertEquals(first.status, 200);
    assertEquals(second.status, 200);
    assertEquals(first.body.data.generated >= 1, true);
    assertEquals(second.body.data.generated, 0);
  } finally {
    if (prevSecret === undefined) Deno.env.delete('CRON_SECRET');
    else Deno.env.set('CRON_SECRET', prevSecret);
    await deleteTestUser(a.id);
  }
});

Deno.test('cron: service-role endpoint fails closed without the secret and rejects a wrong one', async () => {
  const prevSecret = Deno.env.get('CRON_SECRET');
  try {
    // Secret configured, but caller sends none / a wrong one → rejected (403).
    Deno.env.set('CRON_SECRET', 'test-cron-secret');
    const noHeader = await apiAs(null, 'POST', '/cron/weekly-review');
    const wrongHeader = await apiAs(null, 'POST', '/cron/weekly-review', undefined, { 'x-cron-secret': 'nope' });
    assertEquals(noHeader.status, 403);
    assertEquals(wrongHeader.status, 403);

    // Secret NOT configured → the endpoint refuses rather than running unauthenticated.
    Deno.env.delete('CRON_SECRET');
    const unconfigured = await apiAs(null, 'POST', '/cron/weekly-review', undefined, { 'x-cron-secret': 'anything' });
    assertEquals(unconfigured.status, 500);
  } finally {
    if (prevSecret === undefined) Deno.env.delete('CRON_SECRET');
    else Deno.env.set('CRON_SECRET', prevSecret);
  }
});

Deno.test('notifications: prefs and push token registration round-trip through API', async () => {
  const a = await createTestUser();
  try {
    const prefs = await apiAs(a.token, 'PATCH', '/notifications/prefs', {
      enabled: true,
      meal_reminders: true,
      meal_times: ['08:30', '13:00'],
      quiet_hours: { start: '23:58', end: '23:59' },
    });
    assertEquals(prefs.status, 200);
    assertEquals(prefs.body.data.enabled, true);
    assertEquals(prefs.body.data.meal_times.length, 2);

    const token = await apiAs(a.token, 'POST', '/notifications/tokens', {
      expo_token: `ExponentPushToken[test-${a.id}]`,
      platform: 'ios',
      device_name: 'integration',
    });
    assertEquals(token.status, 200);
    assertEquals(token.body.data.platform, 'ios');
    const testPush = await apiAs(a.token, 'POST', '/notifications/test');
    assertEquals(testPush.status, 200);
    assertEquals(testPush.body.data.delivered, true);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('snap-to-log: analyze photo, resolve ingredients, and log AI meal', async () => {
  const a = await createTestUser();
  try {
    const candidates = await apiAs(a.token, 'POST', '/foods/analyze-photo', {
      photo: 'base64-photo',
      logged_on: TODAY,
    });
    assertEquals(candidates.status, 200);
    assertEquals(candidates.body.data.length > 0, true);

    const first = candidates.body.data[0];
    const resolved = await apiAs(a.token, 'POST', '/foods/resolve', {
      dish_name: first.dish_name,
      ingredients: first.ingredients.map((i: { name: string; quantity_g: number }) => ({
        name: i.name,
        quantity_g: i.quantity_g,
      })),
    });
    assertEquals(resolved.status, 200);
    assertEquals(resolved.body.data.ingredients.length > 0, true);

    const log = await apiAs(a.token, 'POST', '/food-logs', {
      food_name: resolved.body.data.dish_name,
      meal_type: 'lunch',
      quantity_g: 100,
      calories: resolved.body.data.totals.calories,
      protein_g: resolved.body.data.totals.protein_g,
      carbs_g: resolved.body.data.totals.carbs_g,
      fat_g: resolved.body.data.totals.fat_g,
      source: 'ai_photo',
      source_id: JSON.stringify({ ingredients: resolved.body.data.ingredients }),
      logged_on: TODAY,
    });
    assertEquals(log.status, 200);
    assertEquals(log.body.data.source, 'ai_photo');
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('snap-to-log: daily photo quota blocks the sixth AI meal analysis', async () => {
  const a = await createTestUser();
  try {
    for (let i = 0; i < 5; i++) {
      await apiAs(a.token, 'POST', '/food-logs', {
        food_name: `AI meal ${i}`,
        meal_type: 'lunch',
        quantity_g: 100,
        calories: 100,
        protein_g: 10,
        carbs_g: 10,
        fat_g: 3,
        source: 'ai_photo',
        logged_on: TODAY,
      });
    }
    const blocked = await apiAs(a.token, 'POST', '/foods/analyze-photo', {
      photo: 'base64-photo',
      logged_on: TODAY,
    });
    assertEquals(blocked.status, 429);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('physique compare requires consent, stores text only, and deletes feedback', async () => {
  const a = await createTestUser();
  try {
    const denied = await apiAs(a.token, 'POST', '/insights/physique/analyze', {
      consent: true,
      photos: ['one', 'two'],
    });
    assertEquals(denied.status, 403);

    const consent = await apiAs(a.token, 'PATCH', '/me/ai-consent', {
      physique: true,
      free_tier_acknowledged: true,
    });
    assertEquals(consent.status, 200);
    assertEquals(consent.body.data.physique, true);

    const result = await apiAs(a.token, 'POST', '/insights/physique/analyze', {
      consent: true,
      notes: 'same lighting',
      photos: ['one', 'two'],
    });
    assertEquals(result.status, 200);
    assertEquals(result.body.data.kind, 'physique');
    assertEquals(JSON.stringify(result.body.data).includes('one'), false);

    const del = await apiAs(a.token, 'DELETE', `/insights/${result.body.data.id}`);
    assertEquals(del.status, 200);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('coaches: council, generated program save, and adaptation suggestion', async () => {
  const a = await createTestUser();
  try {
    for (const date of [addDays(TODAY, -2), addDays(TODAY, -1), TODAY]) {
      await apiAs(a.token, 'POST', '/food-logs', {
        food_name: `Council meal ${date}`,
        meal_type: 'lunch',
        quantity_g: 100,
        calories: 500,
        protein_g: 30,
        carbs_g: 50,
        fat_g: 12,
        source: 'manual',
        logged_on: date,
      });
    }
    await apiAs(a.token, 'POST', '/workouts', {
      title: 'Council lift',
      logged_on: TODAY,
      sets: [{ exercise: 'Bench Press', set_number: 1, reps: 8, weight_kg: 60 }],
    });
    const council = await apiAs(a.token, 'POST', '/insights/council', { week: TODAY });
    assertEquals(council.status, 200);
    assertEquals(council.body.data.kind, 'council');

    const program = await apiAs(a.token, 'POST', '/routines/generate', {
      goal: 'Build strength',
      experience: 'beginner',
      days_per_week: 2,
      equipment: ['gym'],
    });
    assertEquals(program.status, 200);
    assertEquals(program.body.data.program.days.length, 2);
    assertEquals(typeof program.body.data.insight_id, 'string');

    const saved = await apiAs(a.token, 'POST', '/routines/generated/save', {
      program: program.body.data.program,
    });
    assertEquals(saved.status, 200);
    assertEquals(saved.body.data.length, 2);

    // Daily draft quota is temporarily disabled while the program coach is under
    // active product testing; repeated generations should keep working.
    for (let i = 0; i < 4; i++) {
      const generated = await apiAs(a.token, 'POST', '/routines/generate', {
        goal: 'Build strength',
        experience: 'beginner',
        days_per_week: 2,
        equipment: ['gym'],
      });
      assertEquals(generated.status, 200);
    }

    const routineId = saved.body.data[0].id;
    const diff = await apiAs(a.token, 'POST', `/routines/${routineId}/adapt`);
    assertEquals(diff.status, 200);
    assertEquals(diff.body.data.diff.changes.length > 0, true);

    const repeated = await apiAs(a.token, 'POST', `/routines/${routineId}/adapt`);
    assertEquals(repeated.status, 429);

    const applied = await apiAs(a.token, 'POST', `/routines/${routineId}/apply-diff`);
    assertEquals(applied.status, 200);
    assertEquals(applied.body.data.applied_at !== null, true);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('coach council: generate falls back to weekly for sparse users and council for data-rich users', async () => {
  const sparse = await createTestUser();
  const rich = await createTestUser();
  try {
    const sparseGenerated = await apiAs(sparse.token, 'POST', '/insights/generate', { week: TODAY });
    assertEquals(sparseGenerated.status, 200);
    assertEquals(sparseGenerated.body.data.kind, 'weekly');

    for (const date of [addDays(TODAY, -2), addDays(TODAY, -1), TODAY]) {
      await apiAs(rich.token, 'POST', '/food-logs', {
        food_name: `Rich meal ${date}`,
        meal_type: 'lunch',
        quantity_g: 100,
        calories: 500,
        protein_g: 30,
        carbs_g: 50,
        fat_g: 12,
        source: 'manual',
        logged_on: date,
      });
    }
    await apiAs(rich.token, 'POST', '/workouts', {
      title: 'Rich lift',
      logged_on: TODAY,
      sets: [{ exercise: 'Bench Press', set_number: 1, reps: 8, weight_kg: 60 }],
    });
    const richGenerated = await apiAs(rich.token, 'POST', '/insights/generate', { week: TODAY });
    assertEquals(richGenerated.status, 200);
    assertEquals(richGenerated.body.data.kind, 'council');
  } finally {
    await deleteTestUser(sparse.id);
    await deleteTestUser(rich.id);
  }
});

Deno.test('coach council: applying target proposals is explicit, logged, and respects target locks', async () => {
  const unlocked = await createTestUser();
  const locked = await createTestUser();
  const mockPlan = {
    headline: 'Target review',
    coaches: {
      goal: {
        summary: 'A small calorie proposal is available.',
        proposals: [
          {
            type: 'target_diff',
            target: 'calorie_target',
            label: 'Calorie target',
            current: 2200,
            proposed: 2050,
            unit: 'kcal',
          },
        ],
      },
      nutrition: { summary: 'Keep protein steady.', proposals: [] },
      training: { summary: 'Training is steady.', proposals: [] },
    },
    checkins: [],
  };
  Deno.env.set('GEMINI_MOCK_COUNCIL_RESPONSE', JSON.stringify(mockPlan));
  try {
    for (const user of [unlocked, locked]) {
      await apiAs(user.token, 'PATCH', '/me', {
        calorie_target: 2200,
        targets_locked: user === locked,
      });
      for (const date of [addDays(TODAY, -2), addDays(TODAY, -1), TODAY]) {
        await apiAs(user.token, 'POST', '/food-logs', {
          food_name: `Apply meal ${date}`,
          meal_type: 'lunch',
          quantity_g: 100,
          calories: 500,
          protein_g: 30,
          carbs_g: 50,
          fat_g: 12,
          source: 'manual',
          logged_on: date,
        });
      }
      await apiAs(user.token, 'POST', '/workouts', {
        title: 'Apply lift',
        logged_on: TODAY,
        sets: [{ exercise: 'Bench Press', set_number: 1, reps: 8, weight_kg: 60 }],
      });
    }

    const unlockedCouncil = await apiAs(unlocked.token, 'POST', '/insights/council', { week: TODAY });
    const unlockedApply = await apiAs(unlocked.token, 'POST', `/insights/${unlockedCouncil.body.data.id}/apply-proposal`, {
      proposal: mockPlan.coaches.goal.proposals[0],
    });
    assertEquals(unlockedApply.status, 200);
    assertEquals(unlockedApply.body.data.profile.calorie_target, 2050);
    assertEquals(unlockedApply.body.data.profile.targets_locked, true);
    assertEquals(unlockedApply.body.data.insight.applied_at !== null, true);

    const lockedCouncil = await apiAs(locked.token, 'POST', '/insights/council', { week: TODAY });
    const lockedApply = await apiAs(locked.token, 'POST', `/insights/${lockedCouncil.body.data.id}/apply-proposal`, {
      proposal: mockPlan.coaches.goal.proposals[0],
    });
    assertEquals(lockedApply.status, 409);
    const lockedProfile = await apiAs(locked.token, 'GET', '/me');
    assertEquals(lockedProfile.body.data.calorie_target, 2200);
    assertEquals(lockedProfile.body.data.targets_locked, true);
  } finally {
    Deno.env.delete('GEMINI_MOCK_COUNCIL_RESPONSE');
    await deleteTestUser(unlocked.id);
    await deleteTestUser(locked.id);
  }
});

Deno.test('coach council: deterministic logging-lapse check-in reaches the strict plan payload', async () => {
  const a = await createTestUser();
  try {
    for (const date of [addDays(TODAY, -5), addDays(TODAY, -4), addDays(TODAY, -3)]) {
      await apiAs(a.token, 'POST', '/food-logs', {
        food_name: `Older meal ${date}`,
        meal_type: 'lunch',
        quantity_g: 100,
        calories: 500,
        protein_g: 30,
        carbs_g: 50,
        fat_g: 12,
        source: 'manual',
        logged_on: date,
      });
    }
    await apiAs(a.token, 'POST', '/workouts', {
      title: 'Older lift',
      logged_on: addDays(TODAY, -3),
      sets: [{ exercise: 'Bench Press', set_number: 1, reps: 8, weight_kg: 60 }],
    });
    const council = await apiAs(a.token, 'POST', '/insights/council', { week: TODAY });
    assertEquals(council.status, 200);
    assertEquals(council.body.data.payload.plan.checkins.length > 0, true);
    assertEquals(council.body.data.payload.plan.checkins[0].message.includes('logging'), true);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('gamification: streaks, quests, and badges derive from real logs', async () => {
  const a = await createTestUser();
  try {
    for (const date of [addDays(TODAY, -2), addDays(TODAY, -1), TODAY]) {
      await apiAs(a.token, 'POST', '/food-logs', {
        food_name: `Meal ${date}`,
        meal_type: 'lunch',
        quantity_g: 100,
        calories: 400,
        protein_g: 20,
        carbs_g: 40,
        fat_g: 10,
        source: 'manual',
        logged_on: date,
      });
    }
    await apiAs(a.token, 'POST', '/water', { ml: 500, logged_on: TODAY });
    await apiAs(a.token, 'POST', '/workouts', {
      title: 'Quest workout',
      logged_on: TODAY,
      sets: [{ exercise: 'Bench Press', set_number: 1, reps: 8, weight_kg: 60 }],
    });

    const streaks = await apiAs(a.token, 'GET', `/streaks?date=${TODAY}`);
    assertEquals(streaks.status, 200);
    assertEquals(streaks.body.data.food.current, 3);

    const quests = await apiAs(a.token, 'GET', `/quests?date=${TODAY}`);
    assertEquals(quests.status, 200);
    assertEquals(quests.body.data.some((q: { id: string; complete: boolean }) => q.id === 'move_or_recover' && q.complete), true);

    const badges = await apiAs(a.token, 'GET', `/badges?date=${TODAY}`);
    assertEquals(badges.status, 200);
    assertEquals(
      badges.body.data.earned.some((b: { badge_id: string }) => b.badge_id === 'three_day_streak'),
      true
    );
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('coach awareness: coaching profile round-trips and refine chat is two-channel (NWE-118/120)', async () => {
  const a = await createTestUser();
  const prevRefine = Deno.env.get('GEMINI_MOCK_REFINE_RESPONSE');
  try {
    // 118: stated intent round-trips through PATCH /me.
    const patched = await apiAs(a.token, 'PATCH', '/me', {
      coaching_profile: {
        motivation: 'feel strong on hikes',
        dislikes: ['running'],
        coach_tone: 'direct',
      },
    });
    assertEquals(patched.status, 200);
    assertEquals(patched.body.data.coaching_profile.dislikes, ['running']);

    // Generate a draft (mocked model) to refine.
    Deno.env.set('GEMINI_MOCK_PROGRAM_RESPONSE', JSON.stringify({
      title: 'Mock plan',
      days: [
        { name: 'Day 1', rationale: 'push', exercises: [{ name: 'Bench Press', sets: 3, reps: 8, rationale: 'push' }] },
        { name: 'Day 2', rationale: 'pull', exercises: [{ name: 'Barbell Row', sets: 3, reps: 8, rationale: 'pull' }] },
      ],
      notes: [],
    }));
    const generated = await apiAs(a.token, 'POST', '/routines/generate', {
      goal: 'strength', experience: 'beginner', days_per_week: 2, equipment: ['gym'],
    });
    assertEquals(generated.status, 200);
    const insightId = generated.body.data.insight_id;

    // 120 turn 1: question only → reply, no program change.
    Deno.env.set('GEMINI_MOCK_REFINE_RESPONSE', JSON.stringify({ reply: 'Rows balance the pressing volume.' }));
    const turn1 = await apiAs(a.token, 'POST', '/routines/generated/refine', {
      insight_id: insightId, message: 'why rows?',
    });
    assertEquals(turn1.status, 200);
    assertEquals(turn1.body.data.updated_program, null);

    // 120 turn 2: change requested → revised program returned and persisted as draft.
    Deno.env.set('GEMINI_MOCK_REFINE_RESPONSE', JSON.stringify({
      reply: 'Swapped rows for lat pulldown.',
      updated_program: {
        title: 'Mock plan v2',
        days: [
          { name: 'Day 1', rationale: 'push', exercises: [{ name: 'Bench Press', sets: 3, reps: 8, rationale: 'push' }] },
          { name: 'Day 2', rationale: 'pull', exercises: [{ name: 'Lat Pulldown', sets: 3, reps: 10, rationale: 'pull' }] },
        ],
        notes: [],
      },
    }));
    const turn2 = await apiAs(a.token, 'POST', '/routines/generated/refine', {
      insight_id: insightId, message: 'swap rows for lat pulldown',
    });
    assertEquals(turn2.status, 200);
    assertEquals(turn2.body.data.updated_program.title, 'Mock plan v2');

    // Cross-user: B cannot refine A's draft.
    const b = await createTestUser();
    try {
      const stolen = await apiAs(b.token, 'POST', '/routines/generated/refine', {
        insight_id: insightId, message: 'hi',
      });
      assertEquals(stolen.status, 404);
    } finally {
      await deleteTestUser(b.id);
    }
  } finally {
    Deno.env.delete('GEMINI_MOCK_PROGRAM_RESPONSE');
    if (prevRefine === undefined) Deno.env.delete('GEMINI_MOCK_REFINE_RESPONSE');
    else Deno.env.set('GEMINI_MOCK_REFINE_RESPONSE', prevRefine);
    await deleteTestUser(a.id);
  }
});

Deno.test('coach memory: weekly run distills and stores memory; clear works (NWE-119)', async () => {
  const a = await createTestUser();
  const prevMemory = Deno.env.get('GEMINI_MOCK_MEMORY_RESPONSE');
  try {
    Deno.env.set('GEMINI_MOCK_MEMORY_RESPONSE', JSON.stringify({ text: 'Prefers short sessions; dislikes running.' }));
    await apiAs(a.token, 'POST', '/food-logs', {
      food_name: 'Memory meal', meal_type: 'lunch', quantity_g: 100,
      calories: 400, protein_g: 30, carbs_g: 40, fat_g: 10, source: 'manual', logged_on: TODAY,
    });
    const generated = await apiAs(a.token, 'POST', '/insights/generate', { week: TODAY });
    assertEquals(generated.status, 200);

    const me = await apiAs(a.token, 'GET', '/me');
    assertEquals(me.body.data.coach_memory.text, 'Prefers short sessions; dislikes running.');

    // Clear memory → {}.
    const cleared = await apiAs(a.token, 'PATCH', '/me', { coach_memory: null });
    assertEquals(cleared.status, 200);
    assertEquals(cleared.body.data.coach_memory.text ?? '', '');
  } finally {
    if (prevMemory === undefined) Deno.env.delete('GEMINI_MOCK_MEMORY_RESPONSE');
    else Deno.env.set('GEMINI_MOCK_MEMORY_RESPONSE', prevMemory);
    await deleteTestUser(a.id);
  }
});

Deno.test('generated save: coach-style string reps ("8-12", "AMRAP", timed) store as sane ints (regression)', async () => {
  const a = await createTestUser();
  try {
    const saved = await apiAs(a.token, 'POST', '/routines/generated/save', {
      program: {
        title: 'String reps',
        days: [{
          name: 'Day 1',
          rationale: '',
          exercises: [
            { name: 'Bench Press', sets: 3, reps: '8-12', rationale: '' },
            { name: 'Push-Up', sets: '3', reps: 'AMRAP', rationale: '' },
            { name: 'Plank', sets: 3, reps: '30-60 seconds hold', rationale: '' },
          ],
        }],
        notes: [],
      },
    });
    assertEquals(saved.status, 200);
    const routines = await apiAs(a.token, 'GET', '/routines');
    const items = routines.body.data[0].routine_exercises;
    const byName = (n: string) => items.find((i: { exercise: { name: string } }) => i.exercise.name === n);
    assertEquals(byName('Bench Press').target_reps, 8);   // lower bound of "8-12"
    assertEquals(byName('Bench Press').target_sets, 3);
    assertEquals(byName('Push-Up').target_reps, null);    // AMRAP → no fixed target
    assertEquals(byName('Push-Up').target_sets, 3);       // "3" → 3
    assertEquals(byName('Plank').target_reps, null);      // timed hold → null
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('nutrition: generate → refine → log-meal, with cross-user isolation (NWE-121)', async () => {
  const a = await createTestUser();
  const prevPlan = Deno.env.get('GEMINI_MOCK_MEALPLAN_RESPONSE');
  const prevRefine = Deno.env.get('GEMINI_MOCK_MEALPLAN_REFINE');
  try {
    // Set macro targets + dietary style so context is populated.
    await apiAs(a.token, 'PATCH', '/me', {
      calorie_target: 2200, protein_target_g: 160, carbs_target_g: 220, fat_target_g: 70,
      coaching_profile: { dietary_style: 'vegetarian', allergies: ['peanuts'], meals_per_day: 3 },
    });

    Deno.env.set('GEMINI_MOCK_MEALPLAN_RESPONSE', JSON.stringify({
      title: 'Veg training-day plan',
      meals: [
        { name: 'Tofu scramble', meal_type: 'breakfast', macros: { calories: 500, protein_g: 40, carbs_g: 45, fat_g: 18 }, recipe: { ingredients: ['tofu', 'spinach'], steps: ['scramble'] } },
        { name: 'Lentil bowl', meal_type: 'lunch', macros: { calories: 800, protein_g: 55, carbs_g: 90, fat_g: 22 }, recipe: { ingredients: ['lentils', 'rice'], steps: ['cook'] } },
        { name: 'Paneer dinner', meal_type: 'dinner', macros: { calories: 900, protein_g: 65, carbs_g: 85, fat_g: 30 }, recipe: { ingredients: ['paneer'], steps: ['grill'] } },
      ],
      notes: [],
    }));
    const generated = await apiAs(a.token, 'POST', '/nutrition/plan', { date: TODAY });
    assertEquals(generated.status, 200);
    assertEquals(generated.body.data.plan.meals.length, 3);
    const insightId = generated.body.data.insight_id;

    // Refine, reply-only → no plan change.
    Deno.env.set('GEMINI_MOCK_MEALPLAN_REFINE', JSON.stringify({ reply: 'Lentils cover your fiber and protein.' }));
    const turn1 = await apiAs(a.token, 'POST', '/nutrition/plan/refine', { insight_id: insightId, message: 'why lentils?' });
    assertEquals(turn1.status, 200);
    assertEquals(turn1.body.data.updated_plan, null);

    // Refine, change requested → revised plan persisted as draft.
    Deno.env.set('GEMINI_MOCK_MEALPLAN_REFINE', JSON.stringify({
      reply: 'Swapped lunch for a chickpea bowl.',
      updated_plan: {
        title: 'Veg training-day plan v2',
        meals: [
          { name: 'Tofu scramble', meal_type: 'breakfast', macros: { calories: 500, protein_g: 40, carbs_g: 45, fat_g: 18 }, recipe: { ingredients: ['tofu'], steps: ['scramble'] } },
          { name: 'Chickpea bowl', meal_type: 'lunch', macros: { calories: 780, protein_g: 50, carbs_g: 95, fat_g: 20 }, recipe: { ingredients: ['chickpeas'], steps: ['cook'] } },
          { name: 'Paneer dinner', meal_type: 'dinner', macros: { calories: 900, protein_g: 65, carbs_g: 85, fat_g: 30 }, recipe: { ingredients: ['paneer'], steps: ['grill'] } },
        ],
        notes: [],
      },
    }));
    const turn2 = await apiAs(a.token, 'POST', '/nutrition/plan/refine', { insight_id: insightId, message: 'swap lunch for chickpeas' });
    assertEquals(turn2.status, 200);
    assertEquals(turn2.body.data.updated_plan.meals[1].name, 'Chickpea bowl');

    // "I had this" logs the (revised) meal's macros to food_logs.
    const logged = await apiAs(a.token, 'POST', '/nutrition/plan/log-meal', { insight_id: insightId, meal_index: 1, logged_on: TODAY });
    assertEquals(logged.status, 200);
    assertEquals(logged.body.data.food_name, 'Chickpea bowl');
    assertEquals(logged.body.data.calories, 780);

    const logs = await apiAs(a.token, 'GET', `/food-logs?date=${TODAY}`);
    assertEquals(logs.body.data.some((l: { food_name: string }) => l.food_name === 'Chickpea bowl'), true);

    // Cross-user: B cannot refine or log from A's draft.
    const b = await createTestUser();
    try {
      const stolen = await apiAs(b.token, 'POST', '/nutrition/plan/refine', { insight_id: insightId, message: 'hi' });
      assertEquals(stolen.status, 404);
      const stolenLog = await apiAs(b.token, 'POST', '/nutrition/plan/log-meal', { insight_id: insightId, meal_index: 0, logged_on: TODAY });
      assertEquals(stolenLog.status, 404);
    } finally {
      await deleteTestUser(b.id);
    }
  } finally {
    if (prevPlan === undefined) Deno.env.delete('GEMINI_MOCK_MEALPLAN_RESPONSE');
    else Deno.env.set('GEMINI_MOCK_MEALPLAN_RESPONSE', prevPlan);
    if (prevRefine === undefined) Deno.env.delete('GEMINI_MOCK_MEALPLAN_REFINE');
    else Deno.env.set('GEMINI_MOCK_MEALPLAN_REFINE', prevRefine);
    await deleteTestUser(a.id);
  }
});
