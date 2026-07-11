import { describe, expect, it } from 'vitest';

import { macrosPer100g, rescaleMacros } from './foodMath.ts';

const base = { calories: 200, protein_g: 10, carbs_g: 20, fat_g: 5 };

describe('rescaleMacros', () => {
  it('scales linearly when doubling quantity', () => {
    expect(rescaleMacros(base, 100, 200)).toEqual({
      calories: 400,
      protein_g: 20,
      carbs_g: 40,
      fat_g: 10,
    });
  });

  it('scales down and rounds to one decimal', () => {
    expect(rescaleMacros(base, 100, 33)).toEqual({
      calories: 66,
      protein_g: 3.3,
      carbs_g: 6.6,
      fat_g: 1.7, // 5 * 0.33 = 1.65 → 1.7
    });
  });

  it('returns unchanged macros when the source quantity is zero (guard)', () => {
    expect(rescaleMacros(base, 0, 200)).toEqual(base);
  });

  it('handles a zero target quantity → all zero', () => {
    expect(rescaleMacros(base, 100, 0)).toEqual({
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    });
  });
});

describe('macrosPer100g', () => {
  it('derives per-100g values from a logged entry', () => {
    expect(macrosPer100g({ calories: 400, protein_g: 20, carbs_g: 40, fat_g: 10 }, 200)).toEqual({
      calories: 200,
      protein_g: 10,
      carbs_g: 20,
      fat_g: 5,
    });
  });
});
