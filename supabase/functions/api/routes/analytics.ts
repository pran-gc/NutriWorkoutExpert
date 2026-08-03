import { Hono } from 'hono';

import {
  analyticsRangeQuerySchema,
  foodAnalytics,
  goalProjection,
  ok,
  trainingAnalytics,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import type { Env } from '../types.ts';

export const analyticsRoute = new Hono<Env>()
  .get('/food', zval('query', analyticsRangeQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { from, to } = c.req.valid('query');
    const [{ data: logs, error: logsErr }, { data: profile, error: profileErr }] = await Promise.all([
      db
        .from('food_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('logged_on', from)
        .lte('logged_on', to)
        .order('logged_on', { ascending: true }),
      db
        .from('profiles')
        .select('calorie_target, protein_target_g, carbs_target_g, fat_target_g')
        .eq('id', user.id)
        .single(),
    ]);
    if (logsErr || profileErr) throw new HttpError('INTERNAL', 'Could not load food analytics.');
    return c.json(
      ok(
        foodAnalytics(logs ?? [], {
          calories: profile?.calorie_target ?? null,
          protein_g: profile?.protein_target_g ?? null,
          carbs_g: profile?.carbs_target_g ?? null,
          fat_g: profile?.fat_target_g ?? null,
        })
      )
    );
  })
  .get('/training', zval('query', analyticsRangeQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { from, to } = c.req.valid('query');
    const [{ data: sessions, error }, { data: exercises, error: exerciseErr }] = await Promise.all([
      db
        .from('workout_sessions')
        .select('*, workout_sets(*)')
        .eq('user_id', user.id)
        .gte('logged_on', from)
        .lte('logged_on', to)
        .order('logged_on', { ascending: true }),
      db.from('exercises').select('id, name, muscle_group, kind'),
    ]);
    if (error || exerciseErr) throw new HttpError('INTERNAL', 'Could not load gym analytics.');
    const meta = Object.fromEntries(
      (exercises ?? []).map((e) => [e.id, { name: e.name, muscle_group: e.muscle_group, kind: e.kind }])
    );
    return c.json(ok(trainingAnalytics(sessions ?? [], meta)));
  })
  .get('/goal', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const [{ data: weights, error: weightsErr }, { data: profile, error: profileErr }] = await Promise.all([
      db.from('weight_logs').select('*').eq('user_id', user.id).order('logged_on', { ascending: true }),
      db
        .from('profiles')
        .select('target_weight_kg, calorie_target')
        .eq('id', user.id)
        .single(),
    ]);
    if (weightsErr || profileErr) throw new HttpError('INTERNAL', 'Could not load goal analytics.');
    return c.json(ok({ projection: goalProjection(weights ?? [], profile?.target_weight_kg ?? null), weights: weights ?? [] }));
  });
