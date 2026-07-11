// Recipes endpoints (NWE-202): CRUD with nested items + one-tap log. Logging a
// recipe COPIES its summed (× multiplier) macros into a single food_log with
// source='recipe' — editing the recipe later never rewrites past logs (why #2).
import { Hono } from 'hono';

import {
  logRecipeSchema,
  ok,
  recipeLoggedMacros,
  upsertRecipeSchema,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import type { Env } from '../types.ts';

export const recipesRoute = new Hono<Env>()
  .get('/', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { data, error } = await db
      .from('recipes')
      .select('*, recipe_items(*)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw new HttpError('INTERNAL', 'Could not load recipes.');
    return c.json(ok(data));
  })
  .post('/', zval('json', upsertRecipeSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { name, servings, items } = c.req.valid('json');

    const { data: recipe, error } = await db
      .from('recipes')
      .insert({ user_id: user.id, name, servings })
      .select()
      .single();
    if (error || !recipe) throw new HttpError('INTERNAL', 'Could not create recipe.');

    const { error: itemsErr } = await db.from('recipe_items').insert(
      items.map((it, i) => ({ ...it, recipe_id: recipe.id, user_id: user.id, position: i }))
    );
    if (itemsErr) {
      await db.from('recipes').delete().eq('id', recipe.id); // no orphan recipe
      throw new HttpError('INTERNAL', 'Could not save recipe items.');
    }
    return c.json(ok(recipe));
  })
  .put('/:id', zval('json', upsertRecipeSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const { name, servings, items } = c.req.valid('json');

    const { data: recipe, error } = await db
      .from('recipes')
      .update({ name, servings })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error || !recipe) throw new HttpError('NOT_FOUND', 'Recipe not found.');

    // Replace items wholesale (simplest correct semantics for an editor save).
    await db.from('recipe_items').delete().eq('recipe_id', id).eq('user_id', user.id);
    const { error: itemsErr } = await db.from('recipe_items').insert(
      items.map((it, i) => ({ ...it, recipe_id: id, user_id: user.id, position: i }))
    );
    if (itemsErr) throw new HttpError('INTERNAL', 'Could not save recipe items.');
    return c.json(ok(recipe));
  })
  .delete('/:id', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const { error } = await db.from('recipes').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not delete recipe.');
    return c.json(ok({ id }));
  })
  // POST /recipes/:id/log — insert ONE food_log with summed × multiplier macros.
  .post('/:id/log', zval('json', logRecipeSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const { meal_type, servings: multiplier, logged_on } = c.req.valid('json');

    const { data: recipe, error } = await db
      .from('recipes')
      .select('*, recipe_items(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (error || !recipe) throw new HttpError('NOT_FOUND', 'Recipe not found.');

    const items = (recipe.recipe_items ?? []).map((it: Record<string, number>) => ({
      quantity_g: Number(it.quantity_g),
      calories_per_100g: Number(it.calories_per_100g),
      protein_per_100g: Number(it.protein_per_100g),
      carbs_per_100g: Number(it.carbs_per_100g),
      fat_per_100g: Number(it.fat_per_100g),
    }));
    const macros = recipeLoggedMacros(items, Number(recipe.servings), multiplier);

    const { data: log, error: logErr } = await db
      .from('food_logs')
      .insert({
        user_id: user.id,
        food_name: recipe.name,
        meal_type,
        quantity_g: 100, // recipe logs are serving-based; quantity is nominal
        calories: macros.calories,
        protein_g: macros.protein_g,
        carbs_g: macros.carbs_g,
        fat_g: macros.fat_g,
        source: 'recipe',
        source_id: recipe.id,
        logged_on,
      })
      .select()
      .single();
    if (logErr || !log) throw new HttpError('INTERNAL', 'Could not log recipe.');
    return c.json(ok(log));
  });
