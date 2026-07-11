// Water endpoints (NWE-203): GET /water?date (total ml for the day), POST /water
// (one row per add), DELETE /water/last?date (undo the newest entry of the day).
// RLS-scoped. Append-only rows make undo exact.
import { Hono } from 'hono';

import { addWaterSchema, dayQuerySchema, ok } from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import type { Env } from '../types.ts';

export const waterRoute = new Hono<Env>()
  .get('/', zval('query', dayQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { date } = c.req.valid('query');
    const { data, error } = await db
      .from('water_logs')
      .select('ml')
      .eq('user_id', user.id)
      .eq('logged_on', date);
    if (error) throw new HttpError('INTERNAL', 'Could not load water.');
    const total = (data ?? []).reduce((s, r) => s + Number(r.ml), 0);
    return c.json(ok({ total_ml: total }));
  })
  .post('/', zval('json', addWaterSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { ml, logged_on } = c.req.valid('json');
    const { data, error } = await db
      .from('water_logs')
      .insert({ user_id: user.id, ml, logged_on })
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not add water.');
    return c.json(ok(data));
  })
  .delete('/last', zval('query', dayQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { date } = c.req.valid('query');
    // Newest entry of the day.
    const { data: last } = await db
      .from('water_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('logged_on', date)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) return c.json(ok({ removed: null }));
    const { error } = await db.from('water_logs').delete().eq('id', last.id).eq('user_id', user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not undo.');
    return c.json(ok({ removed: last.id }));
  });
