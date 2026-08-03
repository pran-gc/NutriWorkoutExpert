// Favorites endpoints (NWE-201): GET / (list), POST / (star — upsert on dedupe),
// DELETE /:id (unstar). RLS-scoped. Dedupe is enforced by the unique index on
// (user_id, lower(name), coalesce(lower(brand),'')) — POST upserts on it.
import { Hono } from 'hono';

import { createFavoriteSchema, ok } from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import type { Env } from '../types.ts';

export const favoritesRoute = new Hono<Env>()
  .get('/', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { data, error } = await db
      .from('favorite_foods')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw new HttpError('INTERNAL', 'Could not load favorites.');
    return c.json(ok(data));
  })
  .post('/', zval('json', createFavoriteSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const body = c.req.valid('json');

    // Dedupe by (name, brand) case-insensitively — starring the same food twice
    // updates the existing row (matching the unique index) instead of duplicating.
    const { data: existing } = await db
      .from('favorite_foods')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', body.name)
      .ilike('brand', body.brand ?? '')
      .maybeSingle();

    if (existing) {
      const { data, error } = await db
        .from('favorite_foods')
        .update({ ...body, user_id: user.id })
        .eq('id', existing.id)
        .select()
        .single();
      if (error || !data) throw new HttpError('INTERNAL', 'Could not update favorite.');
      return c.json(ok(data));
    }

    const { data, error } = await db
      .from('favorite_foods')
      .insert({ ...body, user_id: user.id })
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not save favorite.');
    return c.json(ok(data));
  })
  .delete('/:id', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const { error } = await db.from('favorite_foods').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not remove favorite.');
    return c.json(ok({ id }));
  });
