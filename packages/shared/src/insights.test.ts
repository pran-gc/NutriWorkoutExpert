import { describe, expect, it } from 'vitest';

import { hasEnoughDataForCouncil, validateWeeklyReview, weeklySummary } from './insights.ts';

const user_id = '00000000-0000-0000-0000-000000000001';

function food(logged_on: string, calories: number) {
  return {
    id: crypto.randomUUID(),
    user_id,
    food_name: 'Meal',
    brand: null,
    meal_type: 'lunch' as const,
    quantity_g: 100,
    calories,
    protein_g: 30,
    carbs_g: 40,
    fat_g: 20,
    source: 'manual' as const,
    source_id: null,
    logged_on,
  };
}

describe('weeklySummary', () => {
  it('summarizes nutrition, training, weight, and water for a full week', () => {
    const summary = weeklySummary(
      {
        foodLogs: [food('2026-07-06', 2000), food('2026-07-07', 2200)],
        waterLogs: [
          { logged_on: '2026-07-06', ml: 1500 },
          { logged_on: '2026-07-07', ml: 2000 },
        ],
        workouts: [
          {
            id: crypto.randomUUID(),
            user_id,
            title: 'Lift',
            notes: null,
            duration_min: 45,
            logged_on: '2026-07-07',
            workout_sets: [
              {
                id: crypto.randomUUID(),
                session_id: crypto.randomUUID(),
                user_id,
                exercise: 'Squat',
                exercise_id: '11111111-1111-4111-8111-111111111111',
                set_number: 1,
                reps: 5,
                weight_kg: 100,
                duration_min: null,
              },
            ],
          },
        ],
        exerciseMeta: {
          '11111111-1111-4111-8111-111111111111': { name: 'Squat', muscle_group: 'legs', kind: 'strength' },
        },
        weights: [
          { id: crypto.randomUUID(), user_id, logged_on: '2026-07-06', weight_kg: 80 },
          { id: crypto.randomUUID(), user_id, logged_on: '2026-07-12', weight_kg: 79.4 },
        ],
        profile: {
          calorie_target: 2100,
          protein_target_g: 140,
          carbs_target_g: 240,
          fat_target_g: 70,
          water_target_ml: 2000,
        },
      },
      '2026-07-08'
    );
    expect(summary.weekStart).toBe('2026-07-06');
    expect(summary.nutrition.avgDailyCalories).toBe(2100);
    expect(summary.nutrition.adherencePct).toBe(100);
    expect(summary.training.sessions).toBe(1);
    expect(summary.training.volumeByMuscleGroup.legs).toBe(500);
    expect(summary.weightTrend.deltaKg).toBe(-0.6);
    expect(summary.water.avgMl).toBe(500);
  });

  it('handles sparse or empty data without inventing targets', () => {
    const summary = weeklySummary(
      { foodLogs: [], waterLogs: [], workouts: [], weights: [], profile: null },
      '2026-07-06'
    );
    expect(summary.nutrition.daysLogged).toBe(0);
    expect(summary.nutrition.adherencePct).toBeNull();
    expect(summary.weightTrend.deltaKg).toBeNull();
  });
});

describe('validateWeeklyReview', () => {
  it('requires summary, 2-3 recommendations, and encouragement', () => {
    expect(() => validateWeeklyReview({ summary: 'Nice', recommendations: ['One'], encouragement: 'Go' })).toThrow();
    expect(
      validateWeeklyReview({
        summary: 'Steady week.',
        recommendations: ['Keep protein consistent.', 'Plan one workout.'],
        encouragement: 'Small repeatable steps count.',
      }).recommendations
    ).toHaveLength(2);
  });
});

describe('hasEnoughDataForCouncil', () => {
  it('keeps brand-new users on the weekly-review fallback', () => {
    const summary = weeklySummary(
      { foodLogs: [], waterLogs: [], workouts: [], weights: [], profile: null },
      '2026-07-06'
    );
    expect(hasEnoughDataForCouncil(summary)).toBe(false);
  });

  it('allows council once nutrition plus training or weight evidence exists', () => {
    const summary = weeklySummary(
      {
        foodLogs: [food('2026-07-06', 2000), food('2026-07-07', 2100), food('2026-07-08', 2050)],
        waterLogs: [],
        workouts: [
          {
            id: crypto.randomUUID(),
            user_id,
            title: 'Lift',
            notes: null,
            duration_min: null,
            logged_on: '2026-07-08',
            workout_sets: [],
          },
        ],
        weights: [],
        profile: null,
      },
      '2026-07-06'
    );
    expect(hasEnoughDataForCouncil(summary)).toBe(true);
  });
});
