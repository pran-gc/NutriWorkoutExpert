import type { Micronutrients, ProposalIngredient } from './assistant.ts';

export type MacroTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

const MICRO_KEYS = [
  'fiber_g', 'sugar_g', 'saturated_fat_g', 'sodium_mg', 'potassium_mg',
  'calcium_mg', 'iron_mg', 'vitamin_c_mg',
] as const satisfies readonly (keyof Micronutrients)[];

const round1 = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;

export function scaleIngredient<T extends ProposalIngredient>(ingredient: T, quantity_g: number): T {
  return { ...ingredient, quantity_g: Math.max(0, round1(quantity_g)) };
}

export function ingredientTotals(ingredients: readonly ProposalIngredient[]): MacroTotals {
  const totals = ingredients.reduce((sum, ingredient) => {
    const factor = ingredient.quantity_g / 100;
    sum.calories += ingredient.calories_per_100g * factor;
    sum.protein_g += ingredient.protein_per_100g * factor;
    sum.carbs_g += ingredient.carbs_per_100g * factor;
    sum.fat_g += ingredient.fat_per_100g * factor;
    return sum;
  }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  return {
    calories: round1(totals.calories), protein_g: round1(totals.protein_g),
    carbs_g: round1(totals.carbs_g), fat_g: round1(totals.fat_g),
  };
}

export function ingredientMicronutrientTotals(ingredients: readonly ProposalIngredient[]): {
  values: Micronutrients;
  partial: Record<keyof Micronutrients, boolean>;
  approximate: boolean;
} {
  const values = {} as Micronutrients;
  const partial = {} as Record<keyof Micronutrients, boolean>;
  for (const key of MICRO_KEYS) {
    const known = ingredients.filter((ingredient) => ingredient.micronutrients_per_100g?.[key] != null);
    values[key] = known.length
      ? round1(known.reduce((sum, ingredient) => sum + Number(ingredient.micronutrients_per_100g?.[key]) * ingredient.quantity_g / 100, 0))
      : null;
    partial[key] = known.length !== ingredients.length;
  }
  return { values, partial, approximate: ingredients.some((ingredient) => ingredient.source === 'estimated') };
}
