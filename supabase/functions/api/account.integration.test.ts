// Account lifecycle integration tests (NWE-117). Requires a running local stack
// with SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY set.
import { assertEquals } from 'jsr:@std/assert@1';

import { USER_TABLES } from './services/userData.ts';
import { admin, apiAs, createTestUser, deleteTestUser } from './test-helpers.ts';

const TODAY = new Date().toISOString().slice(0, 10);

Deno.test('GET /me/export includes EVERY user table (registry stays complete)', async () => {
  const a = await createTestUser();
  try {
    const res = await apiAs(a.token, 'GET', '/me/export');
    assertEquals(res.status, 200);
    const tables = res.body.data.tables;
    // Every registered table must be present as a key — forgetting one fails here.
    for (const t of USER_TABLES) {
      assertEquals(Object.prototype.hasOwnProperty.call(tables, t), true, `missing table: ${t}`);
    }
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('GET /me/export returns the caller data, not other users', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    await apiAs(a.token, 'POST', '/food-logs', {
      food_name: 'A only', meal_type: 'snack', quantity_g: 100,
      calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0, source: 'manual', logged_on: TODAY,
    });
    const bExport = await apiAs(b.token, 'GET', '/me/export');
    assertEquals(bExport.body.data.tables.food_logs.length, 0);
    const aExport = await apiAs(a.token, 'GET', '/me/export');
    assertEquals(aExport.body.data.tables.food_logs.length, 1);
  } finally {
    await deleteTestUser(a.id);
    await deleteTestUser(b.id);
  }
});

Deno.test('DELETE /me removes the user and cascades every table', async () => {
  const a = await createTestUser();
  // Seed a row in several tables.
  await apiAs(a.token, 'PUT', `/weights/${TODAY}`, { weight_kg: 80 });
  await apiAs(a.token, 'POST', '/food-logs', {
    food_name: 'x', meal_type: 'snack', quantity_g: 100,
    calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0, source: 'manual', logged_on: TODAY,
  });
  await apiAs(a.token, 'POST', '/workouts', {
    title: 'W', logged_on: TODAY, sets: [{ exercise: 'Squat', set_number: 1, reps: 5, weight_kg: 100 }],
  });

  const del = await apiAs(a.token, 'DELETE', '/me');
  assertEquals(del.status, 200);

  // Auth user is gone.
  const { data } = await admin.auth.admin.getUserById(a.id);
  assertEquals(data.user, null);

  // Every user table cascaded to zero rows for this user (checked via service role).
  for (const table of ['profiles', 'weight_logs', 'food_logs', 'workout_sessions', 'workout_sets']) {
    const col = table === 'profiles' ? 'id' : 'user_id';
    const { count } = await admin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(col, a.id);
    assertEquals(count ?? 0, 0, `${table} still has rows after delete`);
  }
});
