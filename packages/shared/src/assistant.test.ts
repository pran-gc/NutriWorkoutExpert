import { describe, expect, it } from 'vitest';

import {
  assistantProposalSchema,
  assistantProposalApplySchema,
  assistantChatSchema,
  assistantSseEventSchema,
  createAssistantSseParser,
  getFoodLogsArgsSchema,
  getWorkoutsArgsSchema,
  parseAssistantSse,
  proposalIngredientSchema,
  workoutLogProposalSchema,
} from './assistant.ts';
import { ingredientMicronutrientTotals, ingredientTotals, scaleIngredient } from './proposalNutrition.ts';

const chicken = {
  name: 'Chicken breast', quantity_g: 150, calories_per_100g: 165,
  protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6,
  source: 'usda' as const, fdc_id: 171077,
  micronutrients_per_100g: {
    fiber_g: null, sugar_g: 0, saturated_fat_g: 1, sodium_mg: 74,
    potassium_mg: 256, calcium_mg: 15, iron_mg: 1, vitamin_c_mg: null,
  },
};

describe('assistant contracts', () => {
  it('accepts a new or resumed chat and caps message size', () => {
    expect(assistantChatSchema.parse({ message: 'How is my training going?' })).toEqual({
      message: 'How is my training going?',
    });
    expect(() => assistantChatSchema.parse({ message: '', thread_id: 'nope' })).toThrow();
    expect(() => assistantChatSchema.parse({ message: 'x'.repeat(2001) })).toThrow();
  });

  it('enforces row and date-range inputs at the schema boundary', () => {
    expect(getWorkoutsArgsSchema.parse({ from: '2026-01-01', to: '2026-02-01' }).limit).toBe(100);
    expect(() => getWorkoutsArgsSchema.parse({ from: '2026-01-01', to: '2027-01-02' })).toThrow();
    expect(() => getWorkoutsArgsSchema.parse({ from: '2026-02-01', to: '2026-01-01' })).toThrow();
    expect(() => getWorkoutsArgsSchema.parse({ from: '2026-01-01', to: '2026-02-01', limit: 201 })).toThrow();
    expect(getFoodLogsArgsSchema.safeParse({ date: '2026-07-21' }).success).toBe(true);
    expect(getFoodLogsArgsSchema.safeParse({ date: '2026-07-21', from: '2026-07-01', to: '2026-07-21' }).success).toBe(false);
  });

  it('parses split SSE chunks, skips unknown events, and keeps a mid-stream error', () => {
    const chunks = [
      'event: thought\ndata: {"type":"thought","message":"Thinking…"}\n\n' +
        'event: future_event\ndata: {"type":"future_event","value":1}\n',
      '\nevent: text\ndata: {"type":"text","delta":"Steady "}\n\n' +
        'event: error\ndata: {"type":"error","code":"UPSTREAM_ERROR","message":"Try later."}\n\n',
    ];
    expect(parseAssistantSse(chunks)).toEqual([
      { type: 'thought', message: 'Thinking…' },
      { type: 'text', delta: 'Steady ' },
      { type: 'error', code: 'UPSTREAM_ERROR', message: 'Try later.' },
    ]);
    expect(assistantSseEventSchema.safeParse({ type: 'unknown' }).success).toBe(false);
  });

  it('emits complete events incrementally without losing hostile split boundaries', () => {
    const parser = createAssistantSseParser();
    expect(parser.push('data: {"type":"text","delta":"hel')).toEqual([]);
    expect(parser.push('lo"}\r')).toEqual([]);
    expect(parser.push('\n\r\ndata: {broken}\n\ndata: {"type":"text","delta":"!"}\n\n')).toEqual([
      { type: 'text', delta: 'hello' },
      { type: 'text', delta: '!' },
    ]);
    expect(parser.finish()).toEqual([]);
  });

  it('validates all four proposal artifacts at the shared boundary', () => {
    const day = { name: 'Pull', exercises: [{ name: 'Row', sets: 3, reps: 10 }] };
    const meal = {
      name: 'Tofu bowl', meal_type: 'lunch',
      macros: { calories: 520, protein_g: 32, carbs_g: 58, fat_g: 18 },
    };
    const proposals = [
      { kind: 'program_revision', title: 'Updated pull day', routine_id: crypto.randomUUID(), days: [day] },
      { kind: 'meal_plan', title: 'Balanced day', date: '2026-07-21', meals: [meal] },
      { kind: 'food_logs', title: 'Log lunch', entries: [{
        food_name: 'Tofu bowl', meal_type: 'lunch', quantity_g: 400, calories: 520,
        protein_g: 32, carbs_g: 58, fat_g: 18, logged_on: '2026-07-21',
      }] },
      { kind: 'target_change', title: 'Small target update', current: { calorie_target: 2100 }, changes: { calorie_target: 2200 }, rationale: 'Match your current goal.' },
    ];
    for (const proposal of proposals) expect(assistantProposalSchema.safeParse(proposal).success).toBe(true);
    expect(assistantProposalSchema.safeParse({ kind: 'target_change', title: 'Nothing', changes: {}, rationale: 'x' }).success).toBe(false);
  });

  it('validates rich food proposals and rejects inconsistent denormalized totals', () => {
    expect(proposalIngredientSchema.safeParse(chicken).success).toBe(true);
    const totals = ingredientTotals([chicken]);
    const proposal = {
      kind: 'food_logs', title: 'Log chicken', entries: [{
        food_name: 'Chicken breast', meal_type: 'dinner', quantity_g: 150,
        ...totals, source: 'manual', logged_on: '2026-07-22', ingredients: [chicken],
      }],
    };
    expect(assistantProposalSchema.safeParse(proposal).success).toBe(true);
    expect(assistantProposalSchema.safeParse({
      ...proposal, entries: [{ ...proposal.entries[0], calories: totals.calories + 10 }],
    }).success).toBe(false);
    // Stored NWE-124 proposals remain readable/applicable.
    expect(assistantProposalSchema.safeParse({
      kind: 'food_logs', title: 'Legacy', entries: [{ food_name: 'Oats', meal_type: 'breakfast', quantity_g: 80, calories: 300, protein_g: 10, carbs_g: 50, fat_g: 7, logged_on: '2026-07-21' }],
    }).success).toBe(true);
  });

  it('validates edited proposal payloads at the apply boundary', () => {
    expect(assistantProposalApplySchema.safeParse({ proposal: {
      kind: 'food_logs', title: 'Legacy', entries: [{ food_name: 'Oats', meal_type: 'breakfast', quantity_g: 80, calories: 300, protein_g: 10, carbs_g: 50, fat_g: 7, logged_on: '2026-07-21' }],
    } }).success).toBe(true);
    expect(assistantProposalApplySchema.safeParse({ proposal: { kind: 'food_logs' } }).success).toBe(false);
  });

  it('enforces workout set shapes for strength and cardio proposals', () => {
    const strength = { kind: 'workout_log', title: 'Push day', logged_on: '2026-07-22', exercises: [{ name: 'Bench press', exercise_id: crypto.randomUUID(), kind: 'strength', sets: [{ reps: 8, weight_kg: 80 }] }] };
    const cardio = { kind: 'workout_log', title: 'Run', logged_on: '2026-07-22', exercises: [{ name: 'Outdoor run', exercise_id: crypto.randomUUID(), kind: 'cardio', sets: [{ duration_min: 30, distance_km: 5 }] }] };
    expect(workoutLogProposalSchema.safeParse(strength).success).toBe(true);
    expect(workoutLogProposalSchema.safeParse(cardio).success).toBe(true);
    expect(workoutLogProposalSchema.safeParse({ ...strength, exercises: [{ ...strength.exercises[0], sets: [{ distance_km: 2 }] }] }).success).toBe(false);
    expect(workoutLogProposalSchema.safeParse({ ...cardio, exercises: [{ ...cardio.exercises[0], sets: [{ reps: 10, duration_min: 20 }] }] }).success).toBe(false);
  });
});

describe('proposal ingredient math', () => {
  it('scales one ingredient and rounds to one decimal place', () => {
    expect(scaleIngredient(chicken, 200).quantity_g).toBe(200);
    expect(ingredientTotals([scaleIngredient(chicken, 200)])).toEqual({ calories: 330, protein_g: 62, carbs_g: 0, fat_g: 7.2 });
  });

  it('handles zero quantity and ingredient removal', () => {
    expect(ingredientTotals([scaleIngredient(chicken, 0)])).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(ingredientTotals([])).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });

  it('changes only chicken contribution in a four-ingredient curry regression', () => {
    const ingredients = [chicken,
      { ...chicken, name: 'Rice', quantity_g: 180, calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 },
      { ...chicken, name: 'Cream', quantity_g: 30, calories_per_100g: 340, protein_per_100g: 2, carbs_per_100g: 3, fat_per_100g: 36 },
      { ...chicken, name: 'Tomato', quantity_g: 100, calories_per_100g: 18, protein_per_100g: 0.9, carbs_per_100g: 3.9, fat_per_100g: 0.2 },
    ];
    const before = ingredientTotals(ingredients);
    const after = ingredientTotals([scaleIngredient(chicken, 200), ...ingredients.slice(1)]);
    expect(after.calories - before.calories).toBe(82.5);
    expect(after.carbs_g - before.carbs_g).toBe(0);
  });

  it('aggregates nullable micros and marks incomplete totals as partial', () => {
    const totals = ingredientMicronutrientTotals([chicken]);
    expect(totals.values.sodium_mg).toBe(111);
    expect(totals.values.fiber_g).toBeNull();
    expect(totals.partial.fiber_g).toBe(true);
    expect(totals.partial.sodium_mg).toBe(false);
    expect(totals.approximate).toBe(false);
    expect(ingredientMicronutrientTotals([{ ...chicken, source: 'estimated' }]).approximate).toBe(true);
  });
});
