// /me endpoints: GET (profile) and PATCH (update + recompute targets).
// Both RLS-scoped: the caller can only ever touch their own row. (NWE-113/114.)
import { Hono } from 'hono';
import { z } from 'zod';

import { computeTargets, ok, updateProfileSchema } from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import { adminDb } from '../services/adminDb.ts';
import { USER_TABLES } from '../services/userData.ts';
import type { Env } from '../types.ts';

const changePasswordSchema = z.object({ new_password: z.string().min(8) });

export const meRoute = new Hono<Env>()
  .get('/', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { data, error } = await db.from('profiles').select('*').eq('id', user.id).single();
    if (error || !data) throw new HttpError('NOT_FOUND', 'Profile not found.');
    return c.json(ok(data));
  })
  .patch('/', zval('json', updateProfileSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const patch = c.req.valid('json');

    // Load the current row to merge + decide on target recompute.
    const { data: current, error: loadErr } = await db
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (loadErr || !current) throw new HttpError('NOT_FOUND', 'Profile not found.');

    const merged = { ...current, ...patch };

    // Recompute targets from body stats + latest weight — UNLESS the user locked
    // their own numbers (NWE-404). Locked profiles keep their targets verbatim.
    const update: Record<string, unknown> = { ...patch };
    if (!current.targets_locked) {
      const { data: latest } = await db
        .from('weight_logs')
        .select('weight_kg')
        .eq('user_id', user.id)
        .order('logged_on', { ascending: false })
        .limit(1);
      const weightKg = latest?.[0]?.weight_kg ? Number(latest[0].weight_kg) : 0;
      const targets = computeTargets(merged, weightKg);
      if (targets) {
        update.calorie_target = targets.calories;
        update.protein_target_g = targets.proteinG;
        update.carbs_target_g = targets.carbsG;
        update.fat_target_g = targets.fatG;
      }
    }

    const { data, error } = await db
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not update profile.');
    return c.json(ok(data));
  })
  // GET /me/export — one JSON bundle of ALL the caller's rows. The registry keeps
  // it exhaustive: a new user table not added there fails the export test (NWE-117).
  .get('/export', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const bundle: Record<string, unknown[]> = {};
    for (const table of USER_TABLES) {
      // Every query is RLS-scoped to the caller, so it only ever returns their rows.
      const { data, error } = await db.from(table).select('*');
      if (error) throw new HttpError('INTERNAL', `Could not export ${table}.`);
      bundle[table] = data ?? [];
    }
    return c.json(ok({ exported_at: new Date().toISOString(), user_id: user.id, tables: bundle }));
  })
  // POST /me/change-password — for a signed-in user (already reauthenticated by
  // holding a valid JWT). Uses the caller's own client (updateUser on self).
  .post('/change-password', zval('json', changePasswordSchema), async (c) => {
    const db = c.get('db');
    const { new_password } = c.req.valid('json');
    const { error } = await db.auth.updateUser({ password: new_password });
    if (error) throw new HttpError('VALIDATION_ERROR', error.message);
    return c.json(ok({ ok: true }));
  })
  // DELETE /me — App Store requirement. Deletes the auth user via the admin
  // client; every user table cascades via FK on delete. Local photos are wiped
  // on-device by the app after this returns.
  .delete('/', async (c) => {
    const user = c.get('user');
    const { error } = await adminDb().auth.admin.deleteUser(user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not delete account.');
    return c.json(ok({ deleted: true }));
  });
