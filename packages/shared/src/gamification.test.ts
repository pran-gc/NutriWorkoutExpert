import { describe, expect, it } from 'vitest';

import { computeDailyStreak, evaluateBadges, generateDailyQuests } from './gamification.ts';

describe('computeDailyStreak', () => {
  it('counts current streak when the last logged day is today or yesterday', () => {
    expect(computeDailyStreak(['2026-07-08', '2026-07-09', '2026-07-10'], '2026-07-11')).toEqual({
      current: 3,
      longest: 3,
      lastLoggedOn: '2026-07-10',
    });
  });

  it('breaks the current streak after a missed buffer day', () => {
    expect(computeDailyStreak(['2026-07-07', '2026-07-08'], '2026-07-11').current).toBe(0);
  });
});

describe('generateDailyQuests', () => {
  it('creates real-action quests from logs', () => {
    const quests = generateDailyQuests({
      date: '2026-07-11',
      foodLogs: [{ logged_on: '2026-07-11' }, { logged_on: '2026-07-11' }],
      waterMl: 1200,
      workouts: [],
      waterTargetMl: 2000,
    });
    expect(quests[0].complete).toBe(true);
    expect(quests[1].progress).toBe(1200);
    expect(quests[2].complete).toBe(false);
  });
});

describe('evaluateBadges', () => {
  it('awards only derived badge ids', () => {
    expect(
      evaluateBadges({
        foodDays: ['2026-07-09', '2026-07-10', '2026-07-11'],
        workoutCount: 1,
        waterDaysThisWeek: 5,
        weeklyReviews: 1,
        aiPhotoLogs: 1,
        prCount: 1,
        goalProgressPct: 50,
        today: '2026-07-11',
      })
    ).toEqual(['first_meal', 'three_day_streak', 'first_workout', 'first_snap_to_log', 'first_pr', 'hydration_week', 'weekly_review', 'goal_25', 'goal_50']);
  });
});
