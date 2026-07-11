// Food-log endpoints (NWE-114): list a day, create, delete, and day totals.
// All RLS-scoped to the caller.
import { Hono } from 'hono';

import {
  createFoodLogSchema,
  dayQuerySchema,
  ok,
  rescaleMacros,
  updateFoodLogSchema,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import type { Env } from '../types.ts';

export const foodLogsRoute = new Hono<Env>()
  .get('/', zval('query', dayQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { date } = c.req.valid('query');
    const { data, error } = await db
      .from('food_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('logged_on', date)
      .order('created_at', { ascending: true });
    if (error) throw new HttpError('INTERNAL', 'Could not load food logs.');
    return c.json(ok(data));
  })
  .get('/totals', zval('query', dayQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { date } = c.req.valid('query');
    const { data, error } = await db
      .from('food_logs')
      .select('calories, protein_g, carbs_g, fat_g')
      .eq('user_id', user.id)
      .eq('logged_on', date);
    if (error) throw new HttpError('INTERNAL', 'Could not load totals.');
    const totals = (data ?? []).reduce(
      (a, l) => ({
        calories: a.calories + Number(l.calories),
        protein_g: a.protein_g + Number(l.protein_g),
        carbs_g: a.carbs_g + Number(l.carbs_g),
        fat_g: a.fat_g + Number(l.fat_g),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    return c.json(ok(totals));
  })
  .post('/', zval('json', createFoodLogSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const body = c.req.valid('json');
    const { data, error } = await db
      .from('food_logs')
      .insert({ ...body, user_id: user.id })
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not log food.');
    return c.json(ok(data));
  })
  .patch('/:id', zval('json', updateFoodLogSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const patch = c.req.valid('json');

    const { data: current, error: loadErr } = await db
      .from('food_logs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (loadErr || !current) throw new HttpError('NOT_FOUND', 'Entry not found.');

    const update: Record<string, unknown> = {};
    if (patch.meal_type !== undefined) update.meal_type = patch.meal_type;
    if (patch.photo_path !== undefined) update.photo_path = patch.photo_path; // set/clear (NWE-204)

    if (current.source === 'manual') {
      // Manual entries: accept direct name + macro edits.
      for (const k of ['food_name', 'calories', 'protein_g', 'carbs_g', 'fat_g'] as const) {
        if (patch[k] !== undefined) update[k] = patch[k];
      }
      if (patch.quantity_g !== undefined) update.quantity_g = patch.quantity_g;
    } else if (patch.quantity_g !== undefined && patch.quantity_g !== Number(current.quantity_g)) {
      // Searched/AI entries: rescale macros from the stored quantity (shared math).
      const scaled = rescaleMacros(
        {
          calories: Number(current.calories),
          protein_g: Number(current.protein_g),
          carbs_g: Number(current.carbs_g),
          fat_g: Number(current.fat_g),
        },
        Number(current.quantity_g),
        patch.quantity_g
      );
      update.quantity_g = patch.quantity_g;
      update.calories = scaled.calories;
      update.protein_g = scaled.protein_g;
      update.carbs_g = scaled.carbs_g;
      update.fat_g = scaled.fat_g;
    }

    const { data, error } = await db
      .from('food_logs')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not update entry.');
    return c.json(ok(data));
  })
  .delete('/:id', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const { error } = await db.from('food_logs').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not delete entry.');
    return c.json(ok({ id }));
  });
