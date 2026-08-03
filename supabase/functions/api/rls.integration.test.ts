// Cross-user RLS integration tests (NWE-114 DoD: one per migrated resource).
// Proves user B can never read or delete user A's rows, through the real API +
// Postgres RLS. Requires a running local stack.
//
//   supabase start
//   export $(supabase status -o env | sed 's/SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY/;s/ANON_KEY/SUPABASE_ANON_KEY/;s/API_URL/SUPABASE_URL/' | xargs)
//   deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/api/rls.integration.test.ts
import { assertEquals } from 'jsr:@std/assert@1';

import { apiAs, createTestUser, deleteTestUser } from './test-helpers.ts';

const TODAY = new Date().toISOString().slice(0, 10);

Deno.test('food logs: user B cannot see or delete user A rows', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    // A logs a food.
    const created = await apiAs(a.token, 'POST', '/food-logs', {
      food_name: 'Secret Snack',
      meal_type: 'snack',
      quantity_g: 100,
      calories: 200,
      protein_g: 10,
      carbs_g: 20,
      fat_g: 5,
      source: 'manual',
      logged_on: TODAY,
    });
    assertEquals(created.status, 200);
    const logId = created.body.data.id;

    // B lists the same day → does NOT see A's row.
    const bList = await apiAs(b.token, 'GET', `/food-logs?date=${TODAY}`);
    assertEquals(bList.status, 200);
    assertEquals(
      bList.body.data.some((r: { id: string }) => r.id === logId),
      false
    );

    // A sees their own row.
    const aList = await apiAs(a.token, 'GET', `/food-logs?date=${TODAY}`);
    assertEquals(aList.body.data.some((r: { id: string }) => r.id === logId), true);

    // B's delete of A's row affects nothing; A's row survives.
    await apiAs(b.token, 'DELETE', `/food-logs/${logId}`);
    const stillThere = await apiAs(a.token, 'GET', `/food-logs?date=${TODAY}`);
    assertEquals(stillThere.body.data.some((r: { id: string }) => r.id === logId), true);
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('weights: user B cannot read user A range', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    await apiAs(a.token, 'PUT', `/weights/${TODAY}`, { weight_kg: 80 });
    const bWeights = await apiAs(b.token, 'GET', '/weights');
    assertEquals(bWeights.status, 200);
    assertEquals(bWeights.body.data.length, 0);
    const aWeights = await apiAs(a.token, 'GET', '/weights');
    assertEquals(aWeights.body.data.length, 1);
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('profile: PATCH /me recomputes targets from weight', async () => {
  const a = await createTestUser();
  try {
    await apiAs(a.token, 'PUT', `/weights/${TODAY}`, { weight_kg: 80 });
    const patched = await apiAs(a.token, 'PATCH', '/me', {
      sex: 'male',
      birth_year: 1994,
      height_cm: 180,
      activity_level: 'moderate',
      goal_type: 'maintain',
    });
    assertEquals(patched.status, 200);
    // Targets computed server-side from shared logic.
    assertEquals(patched.body.data.calorie_target > 0, true);
    assertEquals(patched.body.data.protein_target_g, 144); // 80kg * 1.8
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('food-logs: PATCH rescales searched-entry macros server-side (NWE-205)', async () => {
  const a = await createTestUser();
  try {
    const created = await apiAs(a.token, 'POST', '/food-logs', {
      food_name: 'Yogurt', meal_type: 'snack', quantity_g: 100,
      calories: 100, protein_g: 10, carbs_g: 5, fat_g: 3, source: 'openfoodfacts', logged_on: TODAY,
    });
    const id = created.body.data.id;
    // Double the quantity → macros should double.
    const patched = await apiAs(a.token, 'PATCH', `/food-logs/${id}`, { quantity_g: 200 });
    assertEquals(patched.status, 200);
    assertEquals(Number(patched.body.data.calories), 200);
    assertEquals(Number(patched.body.data.protein_g), 20);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('food-logs: PATCH lets manual entries edit macros directly (NWE-205)', async () => {
  const a = await createTestUser();
  try {
    const created = await apiAs(a.token, 'POST', '/food-logs', {
      food_name: 'Custom', meal_type: 'lunch', quantity_g: 100,
      calories: 100, protein_g: 5, carbs_g: 5, fat_g: 5, source: 'manual', logged_on: TODAY,
    });
    const id = created.body.data.id;
    const patched = await apiAs(a.token, 'PATCH', `/food-logs/${id}`, { calories: 250, food_name: 'Custom v2' });
    assertEquals(patched.status, 200);
    assertEquals(Number(patched.body.data.calories), 250);
    assertEquals(patched.body.data.food_name, 'Custom v2');
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('workouts: user B cannot see user A sessions', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    await apiAs(a.token, 'POST', '/workouts', {
      title: 'Push Day',
      logged_on: TODAY,
      sets: [{ exercise: 'Bench Press', set_number: 1, reps: 8, weight_kg: 60 }],
    });
    const bList = await apiAs(b.token, 'GET', '/workouts');
    assertEquals(bList.body.data.length, 0);
    const aList = await apiAs(a.token, 'GET', '/workouts');
    assertEquals(aList.body.data.length, 1);
    assertEquals(aList.body.data[0].workout_sets.length, 1);
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('exercises: global rows are visible but custom rows stay private', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    const created = await apiAs(a.token, 'POST', '/exercises', {
      name: 'Secret Cable Lift',
      muscle_group: 'full_body',
      kind: 'strength',
    });
    assertEquals(created.status, 200);

    const aList = await apiAs(a.token, 'GET', '/exercises?q=Secret');
    const bList = await apiAs(b.token, 'GET', '/exercises?q=Secret');
    assertEquals(aList.body.data.some((e: { id: string }) => e.id === created.body.data.id), true);
    assertEquals(bList.body.data.some((e: { id: string }) => e.id === created.body.data.id), false);

    const aBench = await apiAs(a.token, 'GET', '/exercises?q=Bench Press');
    const bBench = await apiAs(b.token, 'GET', '/exercises?q=Bench Press');
    assertEquals(aBench.body.data.some((e: { name: string }) => e.name === 'Bench Press'), true);
    assertEquals(bBench.body.data.some((e: { name: string }) => e.name === 'Bench Press'), true);
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('exercises: user B cannot read user A exercise history', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    const benchId = await exerciseId(a.token, 'Bench Press');
    const created = await apiAs(a.token, 'POST', '/workouts', {
      title: 'Bench Day',
      logged_on: TODAY,
      sets: [{ exercise: 'Bench Press', exercise_id: benchId, set_number: 1, reps: 8, weight_kg: 60 }],
    });
    assertEquals(created.status, 200);

    const aHistory = await apiAs(a.token, 'GET', `/exercises/${benchId}/history?range=all`);
    const bHistory = await apiAs(b.token, 'GET', `/exercises/${benchId}/history?range=all`);
    assertEquals(aHistory.body.data.length, 1);
    assertEquals(bHistory.body.data.length, 0);
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('routines: user B cannot read A routine and never-performed prefill is null', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    const benchId = await exerciseId(a.token, 'Bench Press');
    const routine = await apiAs(a.token, 'POST', '/routines', {
      name: 'Push A',
      exercises: [{ exercise_id: benchId, position: 0, target_sets: 3, target_reps: 8 }],
    });
    assertEquals(routine.status, 200);

    const ownPrefill = await apiAs(a.token, 'GET', `/routines/${routine.body.data.id}/prefill`);
    assertEquals(ownPrefill.status, 200);
    assertEquals(ownPrefill.body.data.exercises[0].last_set, null);

    const bPrefill = await apiAs(b.token, 'GET', `/routines/${routine.body.data.id}/prefill`);
    assertEquals(bPrefill.status, 404);
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('routines: reordered exercises round-trip by position', async () => {
  const a = await createTestUser();
  try {
    const benchId = await exerciseId(a.token, 'Bench Press');
    const squat = await apiAs(a.token, 'POST', '/exercises', {
      name: 'Review Squat',
      muscle_group: 'legs',
      kind: 'strength',
    });
    const routine = await apiAs(a.token, 'POST', '/routines', {
      name: 'Review Order',
      exercises: [
        { exercise_id: benchId, position: 0, target_sets: 3, target_reps: 8 },
        { exercise_id: squat.body.data.id, position: 1, target_sets: 3, target_reps: 5 },
      ],
    });
    assertEquals(routine.status, 200);

    const updated = await apiAs(a.token, 'PUT', `/routines/${routine.body.data.id}`, {
      name: 'Review Order',
      exercises: [
        { exercise_id: squat.body.data.id, position: 0, target_sets: 3, target_reps: 5 },
        { exercise_id: benchId, position: 1, target_sets: 3, target_reps: 8 },
      ],
    });
    assertEquals(updated.status, 200);
    assertEquals(
      updated.body.data.routine_exercises.map((row: { exercise_id: string }) => row.exercise_id),
      [squat.body.data.id, benchId]
    );

    const list = await apiAs(a.token, 'GET', '/routines');
    const roundTrip = list.body.data.find((row: { id: string }) => row.id === routine.body.data.id);
    assertEquals(
      roundTrip.routine_exercises.map((row: { exercise_id: string }) => row.exercise_id),
      [squat.body.data.id, benchId]
    );
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('routines: deleting a routine leaves past sessions with routine_id null', async () => {
  const a = await createTestUser();
  try {
    const benchId = await exerciseId(a.token, 'Bench Press');
    const routine = await apiAs(a.token, 'POST', '/routines', {
      name: 'Review Delete Safety',
      exercises: [{ exercise_id: benchId, position: 0, target_sets: 3, target_reps: 8 }],
    });
    const workout = await apiAs(a.token, 'POST', '/workouts', {
      title: 'From routine',
      routine_id: routine.body.data.id,
      logged_on: TODAY,
      sets: [{ exercise: 'Bench Press', exercise_id: benchId, set_number: 1, reps: 8, weight_kg: 60 }],
    });
    assertEquals(workout.status, 200);

    const deleted = await apiAs(a.token, 'DELETE', `/routines/${routine.body.data.id}`);
    assertEquals(deleted.status, 200);

    const list = await apiAs(a.token, 'GET', `/workouts?from=${TODAY}&to=${TODAY}`);
    const session = list.body.data.find((row: { id: string }) => row.id === workout.body.data.id);
    assertEquals(Boolean(session), true);
    assertEquals(session.routine_id, null);
    assertEquals(session.workout_sets.length, 1);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('workouts: PATCH restores old sets if replacement insert fails', async () => {
  const a = await createTestUser();
  try {
    const created = await apiAs(a.token, 'POST', '/workouts', {
      title: 'Leg Day',
      logged_on: TODAY,
      sets: [{ exercise: 'Squat', set_number: 1, reps: 5, weight_kg: 100 }],
    });
    assertEquals(created.status, 200);
    const sessionId = created.body.data.id;

    const patched = await apiAs(a.token, 'PATCH', `/workouts/${sessionId}`, {
      title: 'Leg Day edited',
      logged_on: TODAY,
      sets: [
        {
          exercise: 'Impossible FK',
          exercise_id: crypto.randomUUID(),
          set_number: 1,
          reps: 5,
          weight_kg: 100,
        },
      ],
    });
    assertEquals(patched.status, 500);

    const list = await apiAs(a.token, 'GET', `/workouts?from=${TODAY}&to=${TODAY}`);
    const session = list.body.data.find((s: { id: string }) => s.id === sessionId);
    assertEquals(session.workout_sets.length, 1);
    assertEquals(session.workout_sets[0].exercise, 'Squat');
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('workouts: user B cannot PATCH user A session', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    const created = await apiAs(a.token, 'POST', '/workouts', {
      title: 'Private Workout',
      logged_on: TODAY,
      sets: [{ exercise: 'Bench Press', set_number: 1, reps: 8, weight_kg: 60 }],
    });
    const patched = await apiAs(b.token, 'PATCH', `/workouts/${created.body.data.id}`, {
      title: 'Nope',
      logged_on: TODAY,
    });
    assertEquals(patched.status, 404);
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('analytics: food endpoint returns seeded aggregates', async () => {
  const a = await createTestUser();
  try {
    await apiAs(a.token, 'PATCH', '/me', {
      targets_locked: true,
      calorie_target: 1000,
      protein_target_g: 100,
      carbs_target_g: 100,
      fat_target_g: 40,
    });
    await apiAs(a.token, 'POST', '/food-logs', {
      food_name: 'Analytics Meal',
      meal_type: 'breakfast',
      quantity_g: 100,
      calories: 500,
      protein_g: 30,
      carbs_g: 50,
      fat_g: 10,
      source: 'manual',
      logged_on: TODAY,
    });
    const res = await apiAs(a.token, 'GET', `/analytics/food?from=${TODAY}&to=${TODAY}`);
    assertEquals(res.status, 200);
    assertEquals(res.body.data.daily[0].calories, 500);
    assertEquals(res.body.data.daily[0].closeness, 0.5);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('profile: locked custom targets are saved verbatim and never recomputed', async () => {
  const a = await createTestUser();
  try {
    await apiAs(a.token, 'PUT', `/weights/${TODAY}`, { weight_kg: 80 });
    const unlocked = await apiAs(a.token, 'PATCH', '/me', {
      targets_locked: false,
      sex: 'male',
      birth_year: 1994,
      height_cm: 180,
      activity_level: 'moderate',
      goal_type: 'maintain',
    });
    assertEquals(unlocked.status, 200);
    assertEquals(unlocked.body.data.protein_target_g, 144);

    const locked = await apiAs(a.token, 'PATCH', '/me', {
      targets_locked: true,
      calorie_target: 1111,
      protein_target_g: 77,
      carbs_target_g: 123,
      fat_target_g: 45,
    });
    assertEquals(locked.status, 200);
    assertEquals(locked.body.data.calorie_target, 1111);

    await apiAs(a.token, 'PUT', `/weights/${TODAY}`, { weight_kg: 95 });
    const changedBodyStats = await apiAs(a.token, 'PATCH', '/me', {
      height_cm: 190,
      activity_level: 'very_active',
    });
    assertEquals(changedBodyStats.status, 200);
    assertEquals(changedBodyStats.body.data.targets_locked, true);
    assertEquals(changedBodyStats.body.data.calorie_target, 1111);
    assertEquals(changedBodyStats.body.data.protein_target_g, 77);
    assertEquals(changedBodyStats.body.data.carbs_target_g, 123);
    assertEquals(changedBodyStats.body.data.fat_target_g, 45);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('analytics: training endpoint returns weekly volume', async () => {
  const a = await createTestUser();
  try {
    const benchId = await exerciseId(a.token, 'Bench Press');
    await apiAs(a.token, 'POST', '/workouts', {
      title: 'Analytics Lift',
      logged_on: TODAY,
      sets: [{ exercise: 'Bench Press', exercise_id: benchId, set_number: 1, reps: 10, weight_kg: 50 }],
    });
    const res = await apiAs(a.token, 'GET', `/analytics/training?from=${TODAY}&to=${TODAY}`);
    assertEquals(res.status, 200);
    assertEquals(res.body.data.consistency.sessions, 1);
    assertEquals(res.body.data.weeklyVolume.length, 1);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('analytics: goal endpoint returns projection shape', async () => {
  const a = await createTestUser();
  try {
    await apiAs(a.token, 'PATCH', '/me', { target_weight_kg: 75 });
    await apiAs(a.token, 'PUT', '/weights/2026-01-01', { weight_kg: 80 });
    await apiAs(a.token, 'PUT', '/weights/2026-01-15', { weight_kg: 78 });
    const res = await apiAs(a.token, 'GET', '/analytics/goal');
    assertEquals(res.status, 200);
    assertEquals(res.body.data.projection.state, 'projected');
    assertEquals(res.body.data.weights.length, 2);
  } finally {
    await deleteTestUser(a.id);
  }
});

async function exerciseId(token: string, name: string): Promise<string> {
  const res = await apiAs(token, 'GET', `/exercises?q=${encodeURIComponent(name)}`);
  const exercise = res.body.data.find((e: { name: string }) => e.name === name);
  if (!exercise) throw new Error(`Missing seeded exercise: ${name}`);
  return exercise.id;
}
