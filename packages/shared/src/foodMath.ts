// Pure food-logging math (NWE-205). Rescaling a logged entry's macros when its
// quantity changes: searched/AI entries store macros for a specific quantity, so
// a new quantity scales them linearly from that baseline. Manual entries edit
// macros directly (no rescale). Runtime-agnostic; unit-tested in foodMath.test.ts.

export interface Macros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Round to one decimal (matches how entries are stored). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Rescale macros from an old quantity to a new quantity, linearly.
 * Guards against a zero/negative old quantity (returns the macros unchanged).
 */
export function rescaleMacros(macros: Macros, fromQuantityG: number, toQuantityG: number): Macros {
  if (fromQuantityG <= 0) return { ...macros };
  const factor = toQuantityG / fromQuantityG;
  return {
    calories: round1(macros.calories * factor),
    protein_g: round1(macros.protein_g * factor),
    carbs_g: round1(macros.carbs_g * factor),
    fat_g: round1(macros.fat_g * factor),
  };
}

/** Macros per 100 g, derived from a logged entry (for favorites, previews). */
export function macrosPer100g(macros: Macros, quantityG: number): Macros {
  return rescaleMacros(macros, quantityG, 100);
}
