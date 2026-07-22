import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import type { WeeklySummary } from '../../_shared/index.ts';
import { generateWeeklyReview, resolveIngredients } from './gemini.ts';

const summary: WeeklySummary = {
  weekStart: '2026-07-06',
  weekEnd: '2026-07-12',
  nutrition: {
    daysLogged: 5,
    avgDailyCalories: 2100,
    calorieTarget: 2200,
    adherencePct: 95,
    avgMacros: { protein_g: 135, carbs_g: 240, fat_g: 70 },
    macroGaps: { protein_g: -5, carbs_g: 10, fat_g: 3 },
  },
  consistency: { foodDaysLogged: 5, workoutDaysLogged: 3, waterDaysLogged: 4 },
  training: { sessions: 3, volumeByMuscleGroup: { legs: 4200 }, cardioMinutes: 20 },
  weightTrend: { firstKg: 80, lastKg: 79.8, deltaKg: -0.2, movingAverageDeltaKg: -0.1 },
  water: { avgMl: 1900, targetMl: 2200 },
};

Deno.test('generateWeeklyReview retries once after malformed model JSON', async () => {
  Deno.env.set('GEMINI_MOCK_RESPONSE_SEQUENCE', JSON.stringify([
    { summary: 'too short', recommendations: ['one'], encouragement: '' },
    {
      summary: 'Food and training were steady enough to review.',
      recommendations: ['Keep protein anchored.', 'Plan one session early.'],
      encouragement: 'The useful pattern is the one you can repeat.',
    },
  ]));
  try {
    const review = await generateWeeklyReview(summary);
    assertEquals(review.model, 'mock-gemini');
    assertEquals(review.content.recommendations.length, 2);
    assertEquals(review.content.encouragement, 'The useful pattern is the one you can repeat.');
  } finally {
    Deno.env.delete('GEMINI_MOCK_RESPONSE_SEQUENCE');
  }
});

Deno.test('resolveIngredients prefers USDA FoodData Central fixture when configured', async () => {
  const originalFetch = globalThis.fetch;
  Deno.env.set('USDA_FDC_API_KEY', 'test-key');
  globalThis.fetch = ((_url, _init) =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          foods: [
            {
              foodNutrients: [
                { nutrientName: 'Energy', value: 130 },
                { nutrientName: 'Protein', value: 2.7 },
                { nutrientName: 'Carbohydrate, by difference', value: 28 },
                { nutrientName: 'Total lipid (fat)', value: 0.3 },
                { nutrientName: 'Fiber, total dietary', value: 1.2 },
                { nutrientName: 'Sodium, Na', value: 7 },
                { nutrientName: 'Vitamin C, total ascorbic acid', value: 2.5 },
              ],
              fdcId: 12345,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )) as typeof fetch;
  try {
    const rows = await resolveIngredients([{ name: 'cooked rice', quantity_g: 150 }]);
    assertEquals(rows[0].source, 'usda');
    assertEquals(rows[0].estimated, false);
    assertEquals(rows[0].calories, 195);
    assertEquals(rows[0].calories_per_100g, 130);
    assertEquals(rows[0].fdc_id, 12345);
    assertEquals(rows[0].micronutrients_per_100g.fiber_g, 1.2);
    assertEquals(rows[0].micronutrients_per_100g.sodium_mg, 7);
    assertEquals(rows[0].micronutrients_per_100g.sugar_g, null);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete('USDA_FDC_API_KEY');
  }
});

Deno.test('resolveIngredients uses Open Food Facts fixture for packaged foods without USDA key', async () => {
  const originalFetch = globalThis.fetch;
  Deno.env.delete('USDA_FDC_API_KEY');
  globalThis.fetch = ((_url, _init) =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          products: [
            {
              nutriments: {
                'energy-kcal_100g': 410,
                proteins_100g: 8,
                carbohydrates_100g: 68,
                fat_100g: 12,
                fiber_100g: 6,
                sugars_100g: 18,
                'saturated-fat_100g': 4,
                sodium_100g: 0.24,
              },
              code: 'off-123',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )) as typeof fetch;
  try {
    const rows = await resolveIngredients([{ name: 'granola bar', quantity_g: 50 }]);
    assertEquals(rows[0].source, 'openfoodfacts');
    assertEquals(rows[0].estimated, false);
    assertEquals(rows[0].calories, 205);
    assertEquals(rows[0].source_id, 'off-123');
    assertEquals(rows[0].micronutrients_per_100g.fiber_g, 6);
    assertEquals(rows[0].micronutrients_per_100g.sodium_mg, 240);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('resolveIngredients prefers deterministic sources and estimates only unresolved rows', async () => {
  const originalFetch = globalThis.fetch;
  Deno.env.set('USDA_FDC_API_KEY', 'test-key');
  Deno.env.set('GEMINI_MOCK_NUTRIENT_RESPONSE', JSON.stringify({ mystery: {
    calories_per_100g: 90, protein_per_100g: 3, carbs_per_100g: 12, fat_per_100g: 2,
    micronutrients_per_100g: { fiber_g: null, sugar_g: null, saturated_fat_g: null, sodium_mg: null, potassium_mg: null, calcium_mg: null, iron_mg: null, vitamin_c_mg: null },
  } }));
  globalThis.fetch = ((url) => {
    const value = String(url);
    if (value.includes('query=rice')) return Promise.resolve(new Response(JSON.stringify({ foods: [{ fdcId: 1, foodNutrients: [
      { nutrientName: 'Energy', value: 130 }, { nutrientName: 'Protein', value: 2.7 }, { nutrientName: 'Carbohydrate, by difference', value: 28 }, { nutrientName: 'Total lipid (fat)', value: 0.3 },
    ] }] }), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify(value.includes('nal.usda') ? { foods: [] } : { products: [] }), { status: 200 }));
  }) as typeof fetch;
  try {
    const rows = await resolveIngredients([{ name: 'rice', quantity_g: 100 }, { name: 'mystery', quantity_g: 100 }]);
    assertEquals(rows.map((row) => row.source), ['usda', 'estimated']);
    assertEquals(rows[1].calories_per_100g, 90);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete('USDA_FDC_API_KEY'); Deno.env.delete('GEMINI_MOCK_NUTRIENT_RESPONSE');
  }
});
