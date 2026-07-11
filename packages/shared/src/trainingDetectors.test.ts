import { describe, expect, it } from 'vitest';

import { detectMissedSessions, detectPlateaus, detectRapidProgress, detectTrainingSignals, detectVolumeDrop } from './trainingDetectors.ts';
import type { WorkoutSession } from './types.ts';

const user_id = '00000000-0000-0000-0000-000000000001';

function session(date: string, weight: number, reps = 5): WorkoutSession {
  return {
    id: crypto.randomUUID(),
    user_id,
    title: 'Lift',
    notes: null,
    duration_min: 45,
    logged_on: date,
    workout_sets: [{
      id: crypto.randomUUID(),
      session_id: crypto.randomUUID(),
      user_id,
      exercise_id: '11111111-1111-4111-8111-111111111111',
      exercise: 'Bench Press',
      set_number: 1,
      reps,
      weight_kg: weight,
      duration_min: null,
    }],
  };
}

describe('training detectors', () => {
  it('detects plateaus across four exposures', () => {
    expect(detectPlateaus([session('2026-06-01', 80), session('2026-06-08', 80), session('2026-06-15', 81), session('2026-06-22', 80)]).at(0)?.kind).toBe('plateau');
  });

  it('detects missed sessions against a plan', () => {
    expect(detectMissedSessions([session('2026-07-06', 80)], 4, '2026-07-11').at(0)?.kind).toBe('missed_sessions');
  });

  it('detects week-over-week volume drops', () => {
    expect(detectVolumeDrop([session('2026-06-30', 100, 10), session('2026-07-07', 50, 5)]).at(0)?.kind).toBe('volume_drop');
  });

  it('detects rapid progress', () => {
    expect(detectRapidProgress([session('2026-07-01', 80), session('2026-07-08', 90)]).at(0)?.kind).toBe('rapid_progress');
  });

  it('combines signals for adaptive training context', () => {
    const signals = detectTrainingSignals({ sessions: [session('2026-07-06', 80)], plannedSessionsPerWeek: 4, today: '2026-07-11' });
    expect(signals.some((signal) => signal.kind === 'missed_sessions')).toBe(true);
  });
});
