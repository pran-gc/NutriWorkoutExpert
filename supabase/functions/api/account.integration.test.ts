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

Deno.test('PATCH /me auto-stamps onboarding_completed_at once core stats arrive (redirect-loop fix)', async () => {
  const a = await createTestUser();
  try {
    // Fresh profile: onboarding not yet complete.
    const before = await apiAs(a.token, 'GET', '/me');
    assertEquals(before.body.data.onboarding_completed_at ?? null, null);

    // Providing core body stats marks onboarding done server-side.
    const patched = await apiAs(a.token, 'PATCH', '/me', {
      sex: 'male', birth_year: 1990, height_cm: 180,
    });
    assertEquals(patched.status, 200);
    assertEquals(typeof patched.body.data.onboarding_completed_at, 'string');

    // The stamp is stable — a later edit doesn't move it.
    const stamp = patched.body.data.onboarding_completed_at;
    const again = await apiAs(a.token, 'PATCH', '/me', { height_cm: 181 });
    assertEquals(again.body.data.onboarding_completed_at, stamp);
  } finally {
    await deleteTestUser(a.id);
  }
});

Deno.test('PATCH /me accepts an explicit onboarding_completed_at (Skip path)', async () => {
  const a = await createTestUser();
  try {
    const iso = new Date().toISOString();
    const patched = await apiAs(a.token, 'PATCH', '/me', { onboarding_completed_at: iso });
    assertEquals(patched.status, 200);
    assertEquals(typeof patched.body.data.onboarding_completed_at, 'string');
  } finally {
    await deleteTestUser(a.id);
  }
});
