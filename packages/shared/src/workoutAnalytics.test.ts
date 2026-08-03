import { describe, expect, it } from 'vitest';

import {
  buildMacroRings,
  estimateOneRepMax,
  exerciseSessionHistory,
  formatPace,
  foodAnalytics,
  goalProjection,
  isoWeekKey,
  movingAverage7,
  strengthSetVolume,
  trainingAnalytics,
} from './workoutAnalytics.ts';
import type { FoodLog, WorkoutSession } from './types.ts';

describe('workout and analytics math', () => {
  it('orders macro rings by largest target and marks overshoot laps', () => {
    const rings = buildMacroRings([
      { key: 'protein', value: 150, target: 100 },
      { key: 'carbs', value: 90, target: 200 },
      { key: 'fat', value: 0, target: null },
    ]);
    expect(rings.map((r) => r.key)).toEqual(['carbs', 'protein', 'fat']);
    expect(rings[1].fraction).toBe(1.5);
    expect(rings[1].lapFraction).toBe(0.5);
    expect(rings[2].hasTarget).toBe(false);
  });

  it('handles explicit zero and exactly-complete macro ring states', () => {
    const rings = buildMacroRings([
      { key: 'protein', value: 0, target: 100 },
      { key: 'carbs', value: 100, target: 100 },
      { key: 'fat', value: 0, target: null },
    ]);
    expect(rings.find((r) => r.key === 'protein')?.fraction).toBe(0);
    expect(rings.find((r) => r.key === 'protein')?.lapFraction).toBe(0);
    expect(rings.find((r) => r.key === 'carbs')?.fraction).toBe(1);
    expect(rings.find((r) => r.key === 'carbs')?.lapFraction).toBe(0);
  });

  it('computes Epley e1RM and volume defensively', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(60, 10)).toBe(80);
    expect(estimateOneRepMax(0, 10)).toBe(0);
    expect(strengthSetVolume({ weight_kg: 50, reps: 8 })).toBe(400);
  });

  it('formats cardio pace only when distance and duration are present', () => {
    expect(formatPace(5, 27)).toBe('5:24 /km');
    expect(formatPace(1, 5.9934)).toBe('6:00 /km');
    expect(formatPace(0, 27)).toBeNull();
    expect(formatPace(5, 0)).toBeNull();
  });

  it('keeps bodyweight sets in exercise history while charting unloaded e1RM as zero', () => {
    const bodyweightSession = session('2026-07-11', 0, 12);
    const result = exerciseSessionHistory(
      [
        {
          ...bodyweightSession,
          workout_sets: [
            {
              ...bodyweightSession.workout_sets![0]!,
              weight_kg: null,
            },
          ],
        },
      ],
      'ex1'
    );
    expect(result).toEqual([
      {
        logged_on: '2026-07-11',
        best_e1rm: 0,
        volume: 0,
        summary: '12 bodyweight',
      },
    ]);
  });

  it('uses leading windows for seven day moving averages', () => {
    const avg = movingAverage7([
      { logged_on: '2026-01-01', value: 80 },
      { logged_on: '2026-01-02', value: 82 },
    ]);
    expect(avg).toEqual([
      { logged_on: '2026-01-01', value: 80 },
      { logged_on: '2026-01-02', value: 81 },
    ]);
  });

  it('excludes points outside the seven calendar day moving-average window', () => {
    const avg = movingAverage7([
      { logged_on: '2026-01-01', value: 80 },
      { logged_on: '2026-01-20', value: 90 },
    ]);
    expect(avg).toEqual([
      { logged_on: '2026-01-01', value: 80 },
      { logged_on: '2026-01-20', value: 90 },
    ]);
  });

  it('computes stable ISO week keys across month and year boundaries', () => {
    expect(isoWeekKey('2026-07-31')).toBe(isoWeekKey('2026-08-01'));
    expect(isoWeekKey('2026-12-31')).toBe('2026-W53');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(isoWeekKey('2026-07-15')).toBe('2026-W29');
  });

  it('aggregates training by ISO week, streak, and deterministic PRs', () => {
    const sessions: WorkoutSession[] = [
      session('2026-07-31', 60, 8),
      session('2026-08-01', 70, 8),
      session('2026-08-14', 65, 8),
    ];
    const result = trainingAnalytics(sessions, {
      ex1: { name: 'Bench Press', muscle_group: 'chest', kind: 'strength' },
    });
    expect(result.weeklyVolume).toHaveLength(2);
    expect(result.weeklyVolume[0].week).toBe('2026-W31');
    expect(result.weeklyVolume[0].groups.chest).toBe(1040);
    expect(result.consistency.currentWeekStreak).toBe(1);
    expect(result.consistency.longestWeekStreak).toBe(1);
    expect(result.prs.map((pr) => pr.e1rm)).toEqual([88.7, 76]);
  });

  it('summarizes food analytics for empty, single, and no-target ranges', () => {
    expect(foodAnalytics([], { calories: 2000, protein_g: 120, carbs_g: 200, fat_g: 70 }).daily).toEqual([]);
    const result = foodAnalytics(
      [
        food('2026-07-11', 'breakfast', 500),
        food('2026-07-11', 'snack', 250),
      ],
      { calories: null, protein_g: null, carbs_g: null, fat_g: null }
    );
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].calories).toBe(750);
    expect(result.daily[0].closeness).toBeNull();
    expect(result.byMeal.find((row) => row.meal_type === 'breakfast')?.calories).toBe(500);
  });

  it('labels sparse and projected goal states', () => {
    expect(goalProjection([], 75).state).toBe('sparse');
    expect(
      goalProjection(
        [
          { id: '00000000-0000-0000-0000-000000000001', user_id: '00000000-0000-0000-0000-000000000002', logged_on: '2026-01-01', weight_kg: 90 },
          { id: '00000000-0000-0000-0000-000000000003', user_id: '00000000-0000-0000-0000-000000000002', logged_on: '2026-01-15', weight_kg: 88 },
        ],
        84
      ).state
    ).toBe('projected');
  });

  it('labels moving-away and at-goal projection states', () => {
    expect(
      goalProjection(
        [
          weight('2026-01-01', 80),
          weight('2026-01-15', 82),
        ],
        75
      ).state
    ).toBe('moving-away');
    expect(
      goalProjection(
        [
          weight('2026-01-01', 80),
          weight('2026-01-15', 79.9),
        ],
        80
      ).state
    ).toBe('at-goal');
  });
});

function session(logged_on: string, weight_kg: number, reps: number): WorkoutSession {
  return {
    id: `10000000-0000-0000-0000-${logged_on.replace(/\D/g, '').padEnd(12, '0')}`,
    user_id: '00000000-0000-0000-0000-000000000001',
    title: 'Workout',
    notes: null,
    duration_min: null,
    logged_on,
    workout_sets: [
      {
        id: `20000000-0000-0000-0000-${logged_on.replace(/\D/g, '').padEnd(12, '0')}`,
        session_id: `10000000-0000-0000-0000-${logged_on.replace(/\D/g, '').padEnd(12, '0')}`,
        user_id: '00000000-0000-0000-0000-000000000001',
        exercise_id: 'ex1',
        exercise: 'Bench Press',
        set_number: 1,
        reps,
        weight_kg,
        duration_min: null,
        distance_km: null,
      },
    ],
  };
}

function food(logged_on: string, meal_type: FoodLog['meal_type'], calories: number): FoodLog {
  return {
    id: `30000000-0000-0000-0000-${String(calories).padStart(12, '0')}`,
    user_id: '00000000-0000-0000-0000-000000000001',
    food_name: 'Food',
    brand: null,
    meal_type,
    quantity_g: 100,
    calories,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 5,
    source: 'manual',
    source_id: null,
    logged_on,
  };
}

function weight(logged_on: string, weight_kg: number) {
  return {
    id: `40000000-0000-0000-0000-${logged_on.replace(/\D/g, '').padEnd(12, '0')}`,
    user_id: '00000000-0000-0000-0000-000000000001',
    logged_on,
    weight_kg,
  };
}
