// Weight endpoints (NWE-114): PUT /weights/:date (upsert one-per-day),
// GET /weights?from&to (range for the trend chart). RLS-scoped.
import { Hono } from 'hono';

import { isoDateSchema, ok, upsertWeightSchema, weightRangeQuerySchema } from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import type { Env } from '../types.ts';

export const weightsRoute = new Hono<Env>()
  .get('/', zval('query', weightRangeQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { from, to } = c.req.valid('query');
    let q = db.from('weight_logs').select('*').eq('user_id', user.id);
    if (from) q = q.gte('logged_on', from);
    if (to) q = q.lte('logged_on', to);
    const { data, error } = await q.order('logged_on', { ascending: true });
    if (error) throw new HttpError('INTERNAL', 'Could not load weights.');
    return c.json(ok(data));
  })
  .put('/:date', zval('json', upsertWeightSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const date = isoDateSchema.safeParse(c.req.param('date'));
    if (!date.success) throw new HttpError('VALIDATION_ERROR', 'Invalid date.');
    const { weight_kg } = c.req.valid('json');
    const { data, error } = await db
      .from('weight_logs')
      .upsert(
        { user_id: user.id, weight_kg, logged_on: date.data },
        { onConflict: 'user_id,logged_on' }
      )
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not save weight.');
    return c.json(ok(data));
  });
