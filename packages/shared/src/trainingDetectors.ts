import type { WorkoutSession } from './types.ts';
import { estimateOneRepMax, isoWeekKey, strengthSetVolume } from './workoutAnalytics.ts';

export type TrainingDetectorKind = 'plateau' | 'missed_sessions' | 'volume_drop' | 'rapid_progress';

export interface TrainingDetectorFinding {
  kind: TrainingDetectorKind;
  detector: string;
  message: string;
  severity: 'info' | 'watch' | 'positive';
  context: Record<string, unknown>;
}

// Thresholds: plateau = 4 consecutive exposures without >=2.5% e1RM improvement.
// Missed sessions = completed sessions are below 60% of planned weekly sessions.
// Volume drop = current week volume falls by >=30% vs previous week.
// Rapid progress = latest e1RM improves by >=7.5% vs prior best.
export function detectTrainingSignals(input: {
  sessions: WorkoutSession[];
  plannedSessionsPerWeek?: number;
  today: string;
}): TrainingDetectorFinding[] {
  const sessions = [...input.sessions].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  return [
    ...detectPlateaus(sessions),
    ...detectMissedSessions(sessions, input.plannedSessionsPerWeek ?? 3, input.today),
    ...detectVolumeDrop(sessions),
    ...detectRapidProgress(sessions),
  ];
}

function strengthSeries(sessions: WorkoutSession[]) {
  const byExercise = new Map<string, { name: string; date: string; e1rm: number }[]>();
  for (const session of sessions) {
    for (const set of session.workout_sets ?? []) {
      const e1rm = estimateOneRepMax(set.weight_kg, set.reps);
      if (e1rm <= 0) continue;
      const key = set.exercise_id ?? set.exercise;
      byExercise.set(key, [...(byExercise.get(key) ?? []), { name: set.exercise, date: session.logged_on, e1rm }]);
    }
  }
  return byExercise;
}

export function detectPlateaus(sessions: WorkoutSession[]): TrainingDetectorFinding[] {
  const findings: TrainingDetectorFinding[] = [];
  for (const rows of strengthSeries(sessions).values()) {
    if (rows.length < 4) continue;
    const last4 = rows.slice(-4);
    const first = last4[0].e1rm;
    const best = Math.max(...last4.map((row) => row.e1rm));
    if (best < first * 1.025) {
      findings.push({
        kind: 'plateau',
        detector: `plateau:${last4[0].name}`,
        message: `${last4[0].name} has been flat across 4 exposures.`,
        severity: 'watch',
        context: { exercise: last4[0].name, exposures: last4 },
      });
    }
  }
  return findings;
}

export function detectMissedSessions(sessions: WorkoutSession[], plannedPerWeek: number, today: string): TrainingDetectorFinding[] {
  const week = isoWeekKey(today);
  const completed = sessions.filter((session) => isoWeekKey(session.logged_on) === week).length;
  if (completed >= Math.ceil(plannedPerWeek * 0.6)) return [];
  return [{
    kind: 'missed_sessions',
    detector: `missed_sessions:${week}`,
    message: `This week has ${completed}/${plannedPerWeek} planned sessions logged.`,
    severity: 'watch',
    context: { week, completed, plannedPerWeek },
  }];
}

export function detectVolumeDrop(sessions: WorkoutSession[]): TrainingDetectorFinding[] {
  const byWeek = new Map<string, number>();
  for (const session of sessions) {
    const volume = (session.workout_sets ?? []).reduce((sum, set) => sum + strengthSetVolume(set), 0);
    byWeek.set(isoWeekKey(session.logged_on), (byWeek.get(isoWeekKey(session.logged_on)) ?? 0) + volume);
  }
  const weeks = [...byWeek.keys()].sort();
  if (weeks.length < 2) return [];
  const prev = byWeek.get(weeks[weeks.length - 2]) ?? 0;
  const current = byWeek.get(weeks[weeks.length - 1]) ?? 0;
  if (prev <= 0 || current > prev * 0.7) return [];
  return [{
    kind: 'volume_drop',
    detector: `volume_drop:${weeks[weeks.length - 1]}`,
    message: `Training volume dropped ${Math.round((1 - current / prev) * 100)}% week over week.`,
    severity: 'watch',
    context: { previousWeek: weeks[weeks.length - 2], currentWeek: weeks[weeks.length - 1], prev, current },
  }];
}

export function detectRapidProgress(sessions: WorkoutSession[]): TrainingDetectorFinding[] {
  const findings: TrainingDetectorFinding[] = [];
  for (const rows of strengthSeries(sessions).values()) {
    if (rows.length < 2) continue;
    const priorBest = Math.max(...rows.slice(0, -1).map((row) => row.e1rm));
    const latest = rows[rows.length - 1];
    if (latest.e1rm >= priorBest * 1.075) {
      findings.push({
        kind: 'rapid_progress',
        detector: `rapid_progress:${latest.name}`,
        message: `${latest.name} jumped ${Math.round((latest.e1rm / priorBest - 1) * 100)}%.`,
        severity: 'positive',
        context: { exercise: latest.name, priorBest, latest },
      });
    }
  }
  return findings;
}
