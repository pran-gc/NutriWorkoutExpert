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
