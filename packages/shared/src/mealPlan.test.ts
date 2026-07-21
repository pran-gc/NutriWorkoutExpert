import { describe, expect, it } from 'vitest';

import {
  coachingProfileSchema,
  mealPlanSchema,
  refineMealPlanResponseSchema,
} from './contracts.ts';
import { macrosVsTarget, mealPlanTotals } from './mealPlanMath.ts';

const meal = (cal: number, p: number, c: number, f: number, meal_type = 'lunch') => ({
  name: 'Meal',
  meal_type,
  macros: { calories: cal, protein_g: p, carbs_g: c, fat_g: f },
  recipe: { ingredients: ['x'], steps: ['y'] },
});

describe('dietary fields on coachingProfileSchema (NWE-121)', () => {
  it('accepts allergies + dietary style + meals per day', () => {
    const parsed = coachingProfileSchema.parse({
      dietary_style: 'vegetarian',
      allergies: ['peanuts', 'shellfish'],
      disliked_foods: ['mushrooms'],
      meals_per_day: 3,
      cook_time_pref: 'quick',
    });
    expect(parsed.allergies).toEqual(['peanuts', 'shellfish']);
    expect(parsed.meals_per_day).toBe(3);
  });
  it('rejects an unknown dietary style and out-of-range meals', () => {
    expect(coachingProfileSchema.safeParse({ dietary_style: 'carnivore-only' }).success).toBe(false);
    expect(coachingProfileSchema.safeParse({ meals_per_day: 9 }).success).toBe(false);
  });
});

describe('mealPlanSchema', () => {
  it('accepts a plan with recipes and defaults empty recipe fields', () => {
    const plan = mealPlanSchema.parse({
      title: 'Tuesday plan',
      meals: [{ name: 'Oats', meal_type: 'breakfast', macros: { calories: 400, protein_g: 20, carbs_g: 50, fat_g: 10 } }],
    });
    expect(plan.meals[0].recipe.ingredients).toEqual([]);
    expect(plan.notes).toEqual([]);
  });
  it('requires at least one meal', () => {
    expect(mealPlanSchema.safeParse({ title: 'x', meals: [] }).success).toBe(false);
  });
});

describe('refineMealPlanResponseSchema (two-channel)', () => {
  it('accepts reply-only', () => {
    expect(refineMealPlanResponseSchema.parse({ reply: 'Because it hits your protein.' }).updated_plan ?? null).toBeNull();
  });
  it('rejects a turn without a reply', () => {
    expect(refineMealPlanResponseSchema.safeParse({ updated_plan: { title: 'x', meals: [meal(1, 1, 1, 1)] } }).success).toBe(false);
  });
});

describe('mealPlanTotals + macrosVsTarget', () => {
  it('sums meal macros', () => {
    const t = mealPlanTotals([meal(400, 30, 40, 10), meal(600, 40, 60, 20)]);
    expect(t).toEqual({ calories: 1000, protein_g: 70, carbs_g: 100, fat_g: 30 });
  });
  it('computes deltas vs targets and null-safes missing targets', () => {
    const t = mealPlanTotals([meal(2000, 150, 200, 60)]);
    const d = macrosVsTarget(t, { calories: 2100, protein_g: 140, carbs_g: null, fat_g: 70 });
    expect(d.calories).toBe(-100);
    expect(d.protein_g).toBe(10);
    expect(d.carbs_g).toBeNull();
    expect(d.fat_g).toBe(-10);
  });
});
