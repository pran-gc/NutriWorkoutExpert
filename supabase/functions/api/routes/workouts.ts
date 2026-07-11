// Workout-session endpoints (NWE-114): list a range (with sets), create with
// nested sets, delete. RLS-scoped. (Edit/PATCH lands in NWE-305.)
import { Hono } from 'hono';

import { createWorkoutSessionSchema, ok, sessionRangeQuerySchema } from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import type { Env } from '../types.ts';

export const workoutsRoute = new Hono<Env>()
  .get('/', zval('query', sessionRangeQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { from, to } = c.req.valid('query');
    let q = db.from('workout_sessions').select('*, workout_sets(*)').eq('user_id', user.id);
    if (from) q = q.gte('logged_on', from);
    if (to) q = q.lte('logged_on', to);
    const { data, error } = await q
      .order('logged_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new HttpError('INTERNAL', 'Could not load workouts.');
    return c.json(ok(data));
  })
  .post('/', zval('json', createWorkoutSessionSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { sets = [], ...session } = c.req.valid('json');

    const { data: created, error } = await db
      .from('workout_sessions')
      .insert({ ...session, user_id: user.id })
      .select()
      .single();
    if (error || !created) throw new HttpError('INTERNAL', 'Could not save workout.');

    if (sets.length > 0) {
      const { error: setsError } = await db.from('workout_sets').insert(
        sets.map((s) => ({ ...s, session_id: created.id, user_id: user.id }))
      );
      if (setsError) {
        // No orphan session: roll back the header we just wrote.
        await db.from('workout_sessions').delete().eq('id', created.id);
        throw new HttpError('INTERNAL', 'Could not save workout sets.');
      }
    }
    return c.json(ok(created));
  })
  .delete('/:id', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const { error } = await db
      .from('workout_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not delete workout.');
    return c.json(ok({ id }));
  });
