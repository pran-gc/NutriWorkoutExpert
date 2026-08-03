// GET /foods/search?q= — Open Food Facts proxied server-side (NWE-114).
import { Hono } from 'hono';

import {
  analyzeFoodPhotoSchema,
  foodSearchQuerySchema,
  ok,
  resolveFoodSchema,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import { analyzeMealPhoto, resolveIngredients } from '../services/gemini.ts';
import { searchFoods } from '../services/openfoodfacts.ts';
import type { Env } from '../types.ts';

export const foodsRoute = new Hono<Env>()
  .get('/search', zval('query', foodSearchQuerySchema), async (c) => {
    const { q } = c.req.valid('query');
    const results = await searchFoods(q);
    return c.json(ok(results));
  })
  .post('/analyze-photo', zval('json', analyzeFoodPhotoSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { logged_on, photo } = c.req.valid('json');
    const { count, error } = await db
      .from('food_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'ai_photo')
      .eq('logged_on', logged_on);
    if (error) throw new HttpError('INTERNAL', 'Could not check photo quota.');
    if ((count ?? 0) >= 5) throw new HttpError('RATE_LIMITED', 'Daily photo analysis limit reached.');
    const result = await analyzeMealPhoto(photo);
    return c.json(ok(result.candidates));
  })
  .post('/resolve', zval('json', resolveFoodSchema), async (c) => {
    const { dish_name, ingredients } = c.req.valid('json');
    const resolved = await resolveIngredients(ingredients);
    const totals = resolved.reduce(
      (sum, row) => ({
        calories: sum.calories + row.calories,
        protein_g: sum.protein_g + row.protein_g,
        carbs_g: sum.carbs_g + row.carbs_g,
        fat_g: sum.fat_g + row.fat_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    return c.json(ok({ dish_name, ingredients: resolved, totals }));
  })
  // GET /foods/recent — last 20 DISTINCT foods from the user's logs, most recent
  // first, keeping the most-recent macros/quantity for each (NWE-201).
  .get('/recent', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    // Pull recent rows and dedupe by name+brand in app code (simpler than DISTINCT ON
    // through PostgREST); 200 rows is plenty to surface 20 distinct foods.
    const { data, error } = await db
      .from('food_logs')
      .select('food_name, brand, meal_type, quantity_g, calories, protein_g, carbs_g, fat_g, source, source_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new HttpError('INTERNAL', 'Could not load recents.');

    const seen = new Set<string>();
    const recent: unknown[] = [];
    for (const row of data ?? []) {
      const key = `${row.food_name.toLowerCase()}|${(row.brand ?? '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recent.push(row);
      if (recent.length >= 20) break;
    }
    return c.json(ok(recent));
  });
