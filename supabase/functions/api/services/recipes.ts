import type { UpsertRecipeInput } from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import type { Env } from '../types.ts';

export async function createRecipe(db: Env['Variables']['db'], userId: string, input: UpsertRecipeInput) {
  const { name, servings, items } = input;
  const { data: recipe, error } = await db.from('recipes').insert({ user_id: userId, name, servings }).select().single();
  if (error || !recipe) throw new HttpError('INTERNAL', 'Could not create recipe.');
  const { error: itemsError } = await db.from('recipe_items').insert(items.map((item, position) => ({ ...item, recipe_id: recipe.id, user_id: userId, position })));
  if (itemsError) {
    await db.from('recipes').delete().eq('id', recipe.id).eq('user_id', userId);
    throw new HttpError('INTERNAL', 'Could not save recipe items.');
  }
  return { ...recipe, recipe_items: items };
}
