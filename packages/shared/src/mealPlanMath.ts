// Pure meal-plan math (NWE-121). Sum a plan's meals into day totals, and compare
// against the user's macro targets. Runtime-agnostic; unit-tested.
import type { PlannedMeal } from './contracts.ts';
import type { Macros } from './foodMath.ts';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Sum meal macros into a day total. */
export function mealPlanTotals(meals: Pick<PlannedMeal, 'macros'>[]): Macros {
  return meals.reduce<Macros>(
    (acc, m) => ({
      calories: round1(acc.calories + Number(m.macros.calories || 0)),
      protein_g: round1(acc.protein_g + Number(m.macros.protein_g || 0)),
      carbs_g: round1(acc.carbs_g + Number(m.macros.carbs_g || 0)),
      fat_g: round1(acc.fat_g + Number(m.macros.fat_g || 0)),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

/** Difference vs target (positive = over). Null targets → null deltas. */
export function macrosVsTarget(
  totals: Macros,
  targets: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }
): { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } {
  const diff = (v: number, t: number | null) => (t == null ? null : round1(v - t));
  return {
    calories: diff(totals.calories, targets.calories),
    protein_g: diff(totals.protein_g, targets.protein_g),
    carbs_g: diff(totals.carbs_g, targets.carbs_g),
    fat_g: diff(totals.fat_g, targets.fat_g),
  };
}
