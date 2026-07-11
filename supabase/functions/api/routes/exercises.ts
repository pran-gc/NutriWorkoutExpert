import { Hono } from 'hono';

import {
  createExerciseSchema,
  exerciseHistoryQuerySchema,
  exerciseSearchQuerySchema,
  exerciseSessionHistory,
  ok,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import type { Env } from '../types.ts';

export const exercisesRoute = new Hono<Env>()
  .get('/', zval('query', exerciseSearchQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { q } = c.req.valid('query');
    // TODO(perf): this unbounded set fetch only supports recency ranking; replace with
    // a bounded subquery or denormalized last_used_at once workout volume grows.
    let query = db
      .from('exercises')
      .select('*, workout_sets!left(created_at)')
      .or(`user_id.is.null,user_id.eq.${user.id}`);
    if (q?.trim()) query = query.ilike('name', `%${q.trim()}%`);
    const { data, error } = await query.order('name', { ascending: true });
    if (error) throw new HttpError('INTERNAL', 'Could not load exercises.');
    const ranked = (data ?? [])
      .map((exercise) => ({
        ...exercise,
        recent_at: Array.isArray(exercise.workout_sets)
          ? exercise.workout_sets
              .map((set: { created_at?: string }) => set.created_at)
              .filter(Boolean)
              .sort()
              .at(-1) ?? null
          : null,
        workout_sets: undefined,
      }))
      .sort((a, b) => {
        if (a.recent_at && b.recent_at) return b.recent_at.localeCompare(a.recent_at);
        if (a.recent_at) return -1;
        if (b.recent_at) return 1;
        return a.name.localeCompare(b.name);
      });
    return c.json(ok(ranked));
  })
  .post('/', zval('json', createExerciseSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const body = c.req.valid('json');
    const { data, error } = await db
      .from('exercises')
      .insert({ ...body, user_id: user.id })
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not create exercise.');
    return c.json(ok(data));
  })
  .get('/:id/history', zval('query', exerciseHistoryQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const { range } = c.req.valid('query');
    let query = db
      .from('workout_sessions')
      .select('*, workout_sets(*)')
      .eq('user_id', user.id)
      .not('workout_sets.exercise_id', 'is', null)
      .order('logged_on', { ascending: true });
    // The embedded filter trims nested workout_sets; parent sessions with no matching
    // sets may still return and are dropped by exerciseSessionHistory below.
    if (range && range !== 'all') {
      const from = new Date();
      from.setDate(from.getDate() - Number(range));
      query = query.gte('logged_on', from.toISOString().slice(0, 10));
    }
    const { data, error } = await query;
    if (error) throw new HttpError('INTERNAL', 'Could not load exercise history.');
    return c.json(ok(exerciseSessionHistory(data ?? [], id)));
  });
