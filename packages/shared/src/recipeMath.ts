// Pure recipe math (NWE-202). A recipe is a list of ingredients (each with a
// quantity in grams + per-100g macros) and a servings count. We compute the total
// macros and the per-serving macros. Runtime-agnostic; tested in recipeMath.test.ts.
import type { Macros } from './foodMath.ts';

export interface RecipeIngredient {
  quantity_g: number;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Sum all ingredients into total macros for the whole recipe. */
export function recipeTotals(ingredients: RecipeIngredient[]): Macros {
  return ingredients.reduce<Macros>(
    (acc, ing) => {
      const f = ing.quantity_g / 100;
      return {
        calories: round1(acc.calories + ing.calories_per_100g * f),
        protein_g: round1(acc.protein_g + ing.protein_per_100g * f),
        carbs_g: round1(acc.carbs_g + ing.carbs_per_100g * f),
        fat_g: round1(acc.fat_g + ing.fat_per_100g * f),
      };
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

/**
 * Per-serving macros. Guards zero/negative servings (treats as 1 serving) so a
 * bad value can never divide-by-zero or produce Infinity.
 */
export function recipePerServing(ingredients: RecipeIngredient[], servings: number): Macros {
  const total = recipeTotals(ingredients);
  const s = servings > 0 ? servings : 1;
  return {
    calories: round1(total.calories / s),
    protein_g: round1(total.protein_g / s),
    carbs_g: round1(total.carbs_g / s),
    fat_g: round1(total.fat_g / s),
  };
}

/** Macros for logging N servings of a recipe (multiplier applied to per-serving). */
export function recipeLoggedMacros(
  ingredients: RecipeIngredient[],
  servings: number,
  multiplier: number
): Macros {
  const per = recipePerServing(ingredients, servings);
  return {
    calories: round1(per.calories * multiplier),
    protein_g: round1(per.protein_g * multiplier),
    carbs_g: round1(per.carbs_g * multiplier),
    fat_g: round1(per.fat_g * multiplier),
  };
}
