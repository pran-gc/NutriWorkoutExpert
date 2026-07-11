// Workout-session endpoints (NWE-114/NWE-305): list a range (with sets),
// create, edit/PATCH, and delete. RLS-scoped.
import { Hono } from 'hono';

import {
  createWorkoutSessionSchema,
  ok,
  sessionRangeQuerySchema,
  updateWorkoutSessionSchema,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import type { Env } from '../types.ts';

type DraftSet = {
  exercise: string;
  exercise_id?: string | null;
  set_number: number;
  reps?: number | null;
  weight_kg?: number | null;
  duration_min?: number | null;
  distance_km?: number | null;
};

async function assertSetShapes(db: Env['Variables']['db'], userId: string, sets: DraftSet[]) {
  const ids = [...new Set(sets.map((set) => set.exercise_id).filter(Boolean))] as string[];
  const kinds = new Map<string, string>();
  if (ids.length) {
    const { data, error } = await db
      .from('exercises')
      .select('id, kind')
      .in('id', ids)
      .or(`user_id.is.null,user_id.eq.${userId}`);
    if (error) throw new HttpError('INTERNAL', 'Could not validate exercises.');
    for (const row of data ?? []) kinds.set(row.id, row.kind);
  }
  for (const set of sets) {
    const kind = set.exercise_id ? kinds.get(set.exercise_id) : undefined;
    const looksCardio = kind === 'cardio' || set.distance_km != null;
    if (looksCardio && (set.duration_min == null || Number(set.duration_min) <= 0)) {
      throw new HttpError('VALIDATION_ERROR', 'Cardio sets need a duration.');
    }
    if (!looksCardio && set.reps == null) {
      throw new HttpError('VALIDATION_ERROR', 'Strength sets need reps.');
    }
  }
}

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
    await assertSetShapes(db, user.id, sets);

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
    const { data } = await db
      .from('workout_sessions')
      .select('*, workout_sets(*)')
      .eq('id', created.id)
      .eq('user_id', user.id)
      .single();
    return c.json(ok(data ?? created));
  })
  .patch('/:id', zval('json', updateWorkoutSessionSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const { sets, ...sessionPatch } = c.req.valid('json');
    if (sets) await assertSetShapes(db, user.id, sets);

    const { data: current, error: loadErr } = await db
      .from('workout_sessions')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (loadErr || !current) throw new HttpError('NOT_FOUND', 'Workout not found.');

    if (Object.keys(sessionPatch).length > 0) {
      const { error } = await db
        .from('workout_sessions')
        .update(sessionPatch)
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw new HttpError('INTERNAL', 'Could not update workout.');
    }

    if (sets) {
      const { data: previousSets, error: snapshotErr } = await db
        .from('workout_sets')
        .select('*')
        .eq('session_id', id)
        .eq('user_id', user.id);
      if (snapshotErr) throw new HttpError('INTERNAL', 'Could not update workout sets.');

      const { error: deleteErr } = await db
        .from('workout_sets')
        .delete()
        .eq('session_id', id)
        .eq('user_id', user.id);
      if (deleteErr) throw new HttpError('INTERNAL', 'Could not update workout sets.');
      if (sets.length) {
        const { error: insertErr } = await db.from('workout_sets').insert(
          sets.map(({ id: _id, ...set }) => ({ ...set, session_id: id, user_id: user.id }))
        );
        if (insertErr) {
          if (previousSets?.length) {
            await db.from('workout_sets').insert(previousSets);
          }
          throw new HttpError('INTERNAL', 'Could not update workout sets.');
        }
      }
    }

    const { data, error } = await db
      .from('workout_sessions')
      .select('*, workout_sets(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not load updated workout.');
    return c.json(ok(data));
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
