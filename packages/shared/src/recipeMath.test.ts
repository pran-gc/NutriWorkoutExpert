import { describe, expect, it } from 'vitest';

import { recipeLoggedMacros, recipePerServing, recipeTotals } from './recipeMath.ts';

const shake = [
  // 200 g banana-ish: 89 kcal/100g
  { quantity_g: 200, calories_per_100g: 89, protein_per_100g: 1.1, carbs_per_100g: 23, fat_per_100g: 0.3 },
  // 30 g whey: 400 kcal/100g
  { quantity_g: 30, calories_per_100g: 400, protein_per_100g: 80, carbs_per_100g: 8, fat_per_100g: 6 },
];

describe('recipeTotals', () => {
  it('sums ingredient macros scaled by quantity', () => {
    const t = recipeTotals(shake);
    // banana: 178 kcal, whey: 120 kcal → 298
    expect(t.calories).toBe(298);
    // protein: 2.2 + 24 = 26.2
    expect(t.protein_g).toBe(26.2);
  });

  it('returns zeros for an empty recipe', () => {
    expect(recipeTotals([])).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe('recipePerServing', () => {
  it('divides totals by servings', () => {
    const per = recipePerServing(shake, 2);
    expect(per.calories).toBe(149); // 298 / 2
  });

  it('guards zero servings (treats as 1)', () => {
    expect(recipePerServing(shake, 0)).toEqual(recipeTotals(shake));
  });

  it('guards negative servings (treats as 1)', () => {
    expect(recipePerServing(shake, -3)).toEqual(recipeTotals(shake));
  });
});

describe('recipeLoggedMacros', () => {
  it('applies a serving multiplier to per-serving macros', () => {
    // per serving (2) = 149 kcal; 0.5× = 74.5
    expect(recipeLoggedMacros(shake, 2, 0.5).calories).toBe(74.5);
    expect(recipeLoggedMacros(shake, 2, 2).calories).toBe(298);
  });
});
