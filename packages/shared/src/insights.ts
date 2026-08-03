import type { ExerciseKind, ExerciseMuscleGroup, FoodLog, Profile, WeightLog, WorkoutSession } from './types.ts';
import { movingAverage7, strengthSetVolume } from './workoutAnalytics.ts';

export interface WeeklySummaryInput {
  foodLogs: FoodLog[];
  waterLogs: { ml: number; logged_on: string }[];
  workouts: WorkoutSession[];
  weights: WeightLog[];
  exerciseMeta?: Record<string, { muscle_group: ExerciseMuscleGroup; kind: ExerciseKind; name?: string }>;
  profile: Pick<
    Profile,
    'calorie_target' | 'protein_target_g' | 'carbs_target_g' | 'fat_target_g' | 'water_target_ml'
  > | null;
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  nutrition: {
    daysLogged: number;
    avgDailyCalories: number;
    calorieTarget: number | null;
    adherencePct: number | null;
    avgMacros: { protein_g: number; carbs_g: number; fat_g: number };
    macroGaps: { protein_g: number | null; carbs_g: number | null; fat_g: number | null };
  };
  consistency: {
    foodDaysLogged: number;
    workoutDaysLogged: number;
    waterDaysLogged: number;
  };
  training: {
    sessions: number;
    volumeByMuscleGroup: Record<string, number>;
    cardioMinutes: number;
  };
  weightTrend: {
    firstKg: number | null;
    lastKg: number | null;
    deltaKg: number | null;
    movingAverageDeltaKg: number | null;
  };
  water: {
    avgMl: number;
    targetMl: number | null;
  };
}

const MS_PER_DAY = 86400000;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayForDateISO(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function daysInRange(start: string, length = 7): string[] {
  return Array.from({ length }, (_, i) => addDaysISO(start, i));
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function uniqueDays(rows: { logged_on: string }[]): number {
  return new Set(rows.map((row) => row.logged_on)).size;
}

function macroGap(avg: number, target: number | null | undefined): number | null {
  return target && target > 0 ? round1(avg - target) : null;
}

export function weeklySummary(input: WeeklySummaryInput, weekStart: string): WeeklySummary {
  const start = mondayForDateISO(weekStart);
  const end = addDaysISO(start, 6);
  const foods = input.foodLogs.filter((row) => inRange(row.logged_on, start, end));
  const waters = input.waterLogs.filter((row) => inRange(row.logged_on, start, end));
  const workouts = input.workouts.filter((row) => inRange(row.logged_on, start, end));
  const weights = input.weights
    .filter((row) => inRange(row.logged_on, start, end))
    .sort((a, b) => a.logged_on.localeCompare(b.logged_on));

  const foodDays = Math.max(1, uniqueDays(foods));
  const totals = foods.reduce(
    (sum, row) => ({
      calories: sum.calories + Number(row.calories),
      protein_g: sum.protein_g + Number(row.protein_g),
      carbs_g: sum.carbs_g + Number(row.carbs_g),
      fat_g: sum.fat_g + Number(row.fat_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
  const avgCalories = round1(totals.calories / foodDays);
  const calorieTarget = input.profile?.calorie_target ?? null;
  const adherencePct =
    calorieTarget && calorieTarget > 0 && foods.length > 0
      ? Math.round(Math.max(0, 1 - Math.abs(avgCalories - calorieTarget) / calorieTarget) * 100)
      : null;
  const avgMacros = {
    protein_g: round1(totals.protein_g / foodDays),
    carbs_g: round1(totals.carbs_g / foodDays),
    fat_g: round1(totals.fat_g / foodDays),
  };

  const volumeByMuscleGroup: Record<string, number> = {};
  let cardioMinutes = 0;
  for (const session of workouts) {
    for (const set of session.workout_sets ?? []) {
      const meta = set.exercise_id ? input.exerciseMeta?.[set.exercise_id] : undefined;
      if (meta?.kind === 'cardio' || (set.duration_min != null && (set.distance_km != null || set.weight_kg == null))) {
        cardioMinutes += Number(set.duration_min);
        continue;
      }
      const group = meta?.muscle_group ?? 'full_body';
      volumeByMuscleGroup[group] = round1((volumeByMuscleGroup[group] ?? 0) + strengthSetVolume(set));
    }
  }

  const ma = movingAverage7(weights.map((w) => ({ logged_on: w.logged_on, value: Number(w.weight_kg) })));
  const first = weights[0] ?? null;
  const last = weights[weights.length - 1] ?? null;
  const waterByDay = new Map<string, number>();
  for (const row of waters) waterByDay.set(row.logged_on, (waterByDay.get(row.logged_on) ?? 0) + Number(row.ml));
  const waterAvg = round1([...waterByDay.values()].reduce((sum, ml) => sum + ml, 0) / 7);

  return {
    weekStart: start,
    weekEnd: end,
    nutrition: {
      daysLogged: uniqueDays(foods),
      avgDailyCalories: avgCalories,
      calorieTarget,
      adherencePct,
      avgMacros,
      macroGaps: {
        protein_g: macroGap(avgMacros.protein_g, input.profile?.protein_target_g),
        carbs_g: macroGap(avgMacros.carbs_g, input.profile?.carbs_target_g),
        fat_g: macroGap(avgMacros.fat_g, input.profile?.fat_target_g),
      },
    },
    consistency: {
      foodDaysLogged: uniqueDays(foods),
      workoutDaysLogged: uniqueDays(workouts),
      waterDaysLogged: waterByDay.size,
    },
    training: {
      sessions: workouts.length,
      volumeByMuscleGroup,
      cardioMinutes: round1(cardioMinutes),
    },
    weightTrend: {
      firstKg: first ? Number(first.weight_kg) : null,
      lastKg: last ? Number(last.weight_kg) : null,
      deltaKg: first && last ? round1(Number(last.weight_kg) - Number(first.weight_kg)) : null,
      movingAverageDeltaKg:
        ma.length >= 2 ? round1(ma[ma.length - 1].value - ma[0].value) : null,
    },
    water: {
      avgMl: waterAvg,
      targetMl: input.profile?.water_target_ml ?? null,
    },
  };
}

export interface WeeklyReviewContent {
  summary: string;
  recommendations: string[];
  encouragement: string;
}

export function validateWeeklyReview(value: unknown): WeeklyReviewContent {
  if (typeof value !== 'object' || value === null) throw new Error('Weekly review must be an object.');
  const row = value as Record<string, unknown>;
  const summary = typeof row.summary === 'string' ? row.summary.trim() : '';
  const encouragement = typeof row.encouragement === 'string' ? row.encouragement.trim() : '';
  const recommendations = Array.isArray(row.recommendations)
    ? row.recommendations.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
  if (!summary || !encouragement || recommendations.length < 2 || recommendations.length > 3) {
    throw new Error('Weekly review must include a summary, 2-3 recommendations, and encouragement.');
  }
  return { summary, recommendations, encouragement };
}

export function formatWeeklyReview(content: WeeklyReviewContent): string {
  return [
    content.summary,
    '',
    ...content.recommendations.map((rec) => `- ${rec}`),
    '',
    content.encouragement,
  ].join('\n');
}

export function hasEnoughDataForCouncil(summary: WeeklySummary): boolean {
  const hasNutritionSignal = summary.consistency.foodDaysLogged >= 3;
  const hasTrainingSignal = summary.training.sessions >= 1;
  const hasWeightSignal =
    summary.weightTrend.deltaKg != null || summary.weightTrend.movingAverageDeltaKg != null;
  return hasNutritionSignal && (hasTrainingSignal || hasWeightSignal);
}
