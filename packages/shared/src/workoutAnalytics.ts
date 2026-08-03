import type { ExerciseKind, ExerciseMuscleGroup, FoodLog, WeightLog, WorkoutSession, WorkoutSet } from './types.ts';

export type MacroKey = 'protein' | 'carbs' | 'fat';

export interface MacroRingInput {
  key: MacroKey;
  value: number;
  target: number | null | undefined;
}

export interface MacroRingDatum extends MacroRingInput {
  fraction: number;
  lapFraction: number;
  hasTarget: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildMacroRings(rings: MacroRingInput[]): MacroRingDatum[] {
  return rings
    .map((ring) => {
      const target = ring.target ?? 0;
      const hasTarget = target > 0;
      const raw = hasTarget ? ring.value / target : 0;
      return {
        ...ring,
        target: ring.target ?? null,
        hasTarget,
        fraction: hasTarget ? Math.max(0, raw) : 0,
        lapFraction: hasTarget && raw > 1 ? raw % 1 || 1 : 0,
      };
    })
    .sort((a, b) => (b.target ?? 0) - (a.target ?? 0));
}

export function estimateOneRepMax(weightKg: number | null | undefined, reps: number | null | undefined): number {
  const weight = Number(weightKg ?? 0);
  const count = Number(reps ?? 0);
  if (weight <= 0 || count <= 0) return 0;
  // A 1-rep set is a measured 1RM; return the weight directly rather than Epley's estimate.
  if (count === 1) return round1(weight);
  return round1(weight * (1 + count / 30));
}

export function strengthSetVolume(set: Pick<WorkoutSet, 'weight_kg' | 'reps'>): number {
  return round1(Number(set.weight_kg ?? 0) * Number(set.reps ?? 0));
}

export function formatPace(distanceKm: number | null | undefined, durationMin: number | null | undefined): string | null {
  const distance = Number(distanceKm ?? 0);
  const duration = Number(durationMin ?? 0);
  if (distance <= 0 || duration <= 0) return null;
  const totalSeconds = Math.round((duration * 60) / distance);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} /km`;
}

export function movingAverage7(points: { logged_on: string; value: number }[]) {
  return points.map((point) => {
    const end = Date.parse(`${point.logged_on}T00:00:00Z`);
    const start = end - 6 * 86400000;
    const window = points.filter((p) => {
      const t = Date.parse(`${p.logged_on}T00:00:00Z`);
      return t >= start && t <= end;
    });
    const avg = window.reduce((sum, p) => sum + p.value, 0) / window.length;
    return { logged_on: point.logged_on, value: round1(avg) };
  });
}

export function isoWeekKey(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  const week =
    1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + firstDay) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function mondayForIsoWeek(key: string): number {
  const [yearPart, weekPart] = key.split('-W');
  const year = Number(yearPart);
  const week = Number(weekPart);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4Day + (week - 1) * 7);
  return jan4.getTime();
}

export function isNextIsoWeek(a: string, b: string): boolean {
  return mondayForIsoWeek(b) - mondayForIsoWeek(a) === 7 * 86400000;
}

export function exerciseSessionHistory(
  sessions: WorkoutSession[],
  exerciseId: string
): { logged_on: string; best_e1rm: number; volume: number; summary: string }[] {
  return sessions
    .map((session) => {
      const sets = (session.workout_sets ?? []).filter((set) => set.exercise_id === exerciseId);
      if (sets.length === 0) return null;
      const best = Math.max(...sets.map((set) => estimateOneRepMax(set.weight_kg, set.reps)));
      const volume = sets.reduce((sum, set) => sum + strengthSetVolume(set), 0);
      const summary = sets
        .map((set) =>
          set.reps != null && set.weight_kg != null
            ? `${set.reps} @ ${Number(set.weight_kg)} kg`
            : set.reps != null
              ? `${set.reps} bodyweight`
            : set.duration_min != null
              ? `${Number(set.duration_min)} min`
              : 'set'
        )
        .join(', ');
      return { logged_on: session.logged_on, best_e1rm: round1(best), volume: round1(volume), summary };
    })
    .filter((row): row is { logged_on: string; best_e1rm: number; volume: number; summary: string } => row !== null)
    .sort((a, b) => a.logged_on.localeCompare(b.logged_on));
}

export function foodAnalytics(
  logs: FoodLog[],
  targets: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  }
) {
  const byDay = new Map<string, FoodLog[]>();
  for (const log of logs) byDay.set(log.logged_on, [...(byDay.get(log.logged_on) ?? []), log]);
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const daily = days.map(([date, rows]) => {
    const totals = rows.reduce(
      (a, l) => ({
        calories: a.calories + Number(l.calories),
        protein_g: a.protein_g + Number(l.protein_g),
        carbs_g: a.carbs_g + Number(l.carbs_g),
        fat_g: a.fat_g + Number(l.fat_g),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    const closeness =
      targets.calories && targets.calories > 0
        ? Math.max(0, 1 - Math.abs(totals.calories - targets.calories) / targets.calories)
        : null;
    return { date, ...totals, closeness };
  });
  const divisor = daily.length || 1;
  const avg = daily.reduce(
    (a, d) => ({
      calories: a.calories + d.calories / divisor,
      protein_g: a.protein_g + d.protein_g / divisor,
      carbs_g: a.carbs_g + d.carbs_g / divisor,
      fat_g: a.fat_g + d.fat_g / divisor,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
  const byMeal = mealTypes.map((meal_type) => ({
    meal_type,
    calories: round1(logs.filter((l) => l.meal_type === meal_type).reduce((s, l) => s + Number(l.calories), 0)),
  }));
  const byFood = new Map<string, { name: string; count: number; calories: number }>();
  for (const log of logs) {
    const key = `${log.food_name.toLowerCase()}|${log.brand ?? ''}`;
    const current = byFood.get(key) ?? { name: log.brand ? `${log.food_name} · ${log.brand}` : log.food_name, count: 0, calories: 0 };
    current.count += 1;
    current.calories += Number(log.calories);
    byFood.set(key, current);
  }
  return {
    daily,
    avg: {
      calories: round1(avg.calories),
      protein_g: round1(avg.protein_g),
      carbs_g: round1(avg.carbs_g),
      fat_g: round1(avg.fat_g),
      targets,
    },
    byMeal,
    topFoods: [...byFood.values()]
      .map((f) => ({ ...f, calories: round1(f.calories) }))
      .sort((a, b) => b.calories - a.calories)
      .slice(0, 8),
  };
}

export function trainingAnalytics(
  sessions: WorkoutSession[],
  exerciseMeta: Record<string, { muscle_group: ExerciseMuscleGroup; kind: ExerciseKind; name: string }>
) {
  const weeks = new Map<string, Record<string, number>>();
  const prs: { exercise: string; e1rm: number; date: string }[] = [];
  const bestByExercise = new Map<string, number>();
  const cardio = new Map<string, { minutes: number; distance_km: number }>();
  for (const session of sessions) {
    const week = isoWeekKey(session.logged_on);
    const bucket = weeks.get(week) ?? {};
    for (const set of session.workout_sets ?? []) {
      const meta = set.exercise_id ? exerciseMeta[set.exercise_id] : undefined;
      if (meta?.kind === 'cardio' || set.distance_km != null) {
        const row = cardio.get(session.logged_on) ?? { minutes: 0, distance_km: 0 };
        row.minutes += Number(set.duration_min ?? 0);
        row.distance_km += Number(set.distance_km ?? 0);
        cardio.set(session.logged_on, row);
        continue;
      }
      const group = meta?.muscle_group ?? 'full_body';
      bucket[group] = (bucket[group] ?? 0) + strengthSetVolume(set);
      const e1rm = estimateOneRepMax(set.weight_kg, set.reps);
      const key = set.exercise_id ?? set.exercise;
      if (e1rm > 0 && e1rm > (bestByExercise.get(key) ?? 0)) {
        bestByExercise.set(key, e1rm);
        prs.push({ exercise: meta?.name ?? set.exercise, e1rm, date: session.logged_on });
      }
    }
    weeks.set(week, bucket);
  }
  const weekKeys = [...weeks.keys()].sort();
  let currentWeekStreak = 0;
  let longestWeekStreak = 0;
  for (let i = 0; i < weekKeys.length; i++) {
    currentWeekStreak = i > 0 && isNextIsoWeek(weekKeys[i - 1], weekKeys[i])
      ? currentWeekStreak + 1
      : 1;
    longestWeekStreak = Math.max(longestWeekStreak, currentWeekStreak);
  }
  return {
    weeklyVolume: [...weeks.entries()].map(([week, groups]) => ({ week, groups })),
    consistency: {
      sessions: sessions.length,
      sessionsPerWeek: round1(sessions.length / Math.max(1, weeks.size || 1)),
      currentWeekStreak,
      longestWeekStreak,
    },
    prs: prs.slice(-8).reverse(),
    cardio: [...cardio.entries()].map(([date, row]) => ({
      date,
      minutes: round1(row.minutes),
      distance_km: round1(row.distance_km),
    })),
  };
}

export function goalProjection(weights: WeightLog[], targetWeightKg: number | null | undefined) {
  if (!targetWeightKg) return { state: 'no-target' as const };
  if (weights.length < 2) return { state: 'sparse' as const };
  const sorted = [...weights].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = Math.max(1, (Date.parse(last.logged_on) - Date.parse(first.logged_on)) / 86400000);
  const kgPerWeek = round1(((last.weight_kg - first.weight_kg) / days) * 7);
  const remaining = targetWeightKg - last.weight_kg;
  if (Math.abs(remaining) < 0.2) return { state: 'at-goal' as const, kgPerWeek };
  if (kgPerWeek === 0 || Math.sign(remaining) !== Math.sign(kgPerWeek)) {
    return { state: 'moving-away' as const, kgPerWeek, remaining: round1(remaining) };
  }
  const weeks = Math.abs(remaining / kgPerWeek);
  const eta = new Date(Date.parse(last.logged_on) + weeks * 7 * 86400000);
  return { state: 'projected' as const, kgPerWeek, remaining: round1(remaining), eta: eta.toISOString().slice(0, 10) };
}
