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

Deno.test('cron: weekly review generation is idempotent for active users', async () => {
  const a = await createTestUser();
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
    const first = await apiAs(null, 'POST', '/cron/weekly-review');
    const second = await apiAs(null, 'POST', '/cron/weekly-review');
    assertEquals(first.status, 200);
    assertEquals(second.status, 200);
    assertEquals(first.body.data.generated >= 1, true);
    assertEquals(second.body.data.generated, 0);
  } finally {
    await deleteTestUser(a.id);
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
    assertEquals(program.body.data.days.length, 2);

    for (let i = 0; i < 2; i++) {
      await apiAs(a.token, 'POST', '/routines/generate', {
        goal: 'Build strength',
        experience: 'beginner',
        days_per_week: 2,
        equipment: ['gym'],
      });
    }
    const quota = await apiAs(a.token, 'POST', '/routines/generate', {
      goal: 'Build strength',
      experience: 'beginner',
      days_per_week: 2,
      equipment: ['gym'],
    });
    assertEquals(quota.status, 429);

    const saved = await apiAs(a.token, 'POST', '/routines/generated/save', {
      program: program.body.data,
    });
    assertEquals(saved.status, 200);
    assertEquals(saved.body.data.length, 2);

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
