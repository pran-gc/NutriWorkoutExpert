import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_LABELS,
  CALORIE_FLOOR,
  GOAL_LABELS,
  bmr,
  computeTargets,
  tdee,
  todayISO,
} from './nutrition.ts';
import type { ActivityLevel, GoalType } from './types.ts';

const baseProfile = {
  sex: 'male' as const,
  birth_year: 1994,
  height_cm: 180,
  activity_level: 'moderate' as ActivityLevel,
  goal_type: 'maintain' as GoalType,
};

describe('bmr (Mifflin-St Jeor)', () => {
  it('adds 5 for male, subtracts 161 for female', () => {
    const male = bmr('male', 80, 180, 30);
    const female = bmr('female', 80, 180, 30);
    expect(male - female).toBe(166); // +5 − (−161)
  });

  it('matches the known formula for a reference person', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(bmr('male', 80, 180, 30)).toBe(1780);
  });
});

describe('tdee', () => {
  it('scales BMR by the activity multiplier', () => {
    expect(tdee(1000, 'sedentary')).toBeCloseTo(1200);
    expect(tdee(1000, 'very_active')).toBeCloseTo(1900);
  });
});

describe('computeTargets — missing data', () => {
  it('returns null when sex is missing', () => {
    expect(computeTargets({ ...baseProfile, sex: null }, 80)).toBeNull();
  });
  it('returns null when birth_year is missing', () => {
    expect(computeTargets({ ...baseProfile, birth_year: null }, 80)).toBeNull();
  });
  it('returns null when height is missing', () => {
    expect(computeTargets({ ...baseProfile, height_cm: null }, 80)).toBeNull();
  });
  it('returns null when weight is zero/missing', () => {
    expect(computeTargets(baseProfile, 0)).toBeNull();
  });
});

describe('computeTargets — the 1200 kcal floor', () => {
  it('never recommends below the floor even for a tiny cutting profile', () => {
    const tiny = {
      sex: 'female' as const,
      birth_year: 1950,
      height_cm: 150,
      activity_level: 'sedentary' as ActivityLevel,
      goal_type: 'lose' as GoalType,
    };
    const targets = computeTargets(tiny, 45);
    expect(targets).not.toBeNull();
    expect(targets!.calories).toBe(CALORIE_FLOOR);
  });
});

describe('computeTargets — both sexes, all activity levels, all goals', () => {
  const activities: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
  const goals: GoalType[] = ['lose', 'maintain', 'gain'];

  for (const sex of ['male', 'female'] as const) {
    for (const activity of activities) {
      for (const goal of goals) {
        it(`produces sane targets for ${sex}/${activity}/${goal}`, () => {
          const t = computeTargets(
            { sex, birth_year: 1990, height_cm: 175, activity_level: activity, goal_type: goal },
            75
          );
          expect(t).not.toBeNull();
          expect(t!.calories).toBeGreaterThanOrEqual(CALORIE_FLOOR);
          expect(t!.proteinG).toBeGreaterThan(0);
          expect(t!.carbsG).toBeGreaterThanOrEqual(0);
          expect(t!.fatG).toBeGreaterThan(0);
        });
      }
    }
  }

  it('uses 2.0 g/kg protein when building muscle, 1.8 otherwise', () => {
    const gain = computeTargets({ ...baseProfile, goal_type: 'gain' }, 80);
    const maintain = computeTargets({ ...baseProfile, goal_type: 'maintain' }, 80);
    expect(gain!.proteinG).toBe(160); // 80 * 2.0
    expect(maintain!.proteinG).toBe(144); // 80 * 1.8
  });

  it('applies the goal calorie adjustment (lose < maintain < gain)', () => {
    const lose = computeTargets({ ...baseProfile, goal_type: 'lose' }, 80)!;
    const maintain = computeTargets({ ...baseProfile, goal_type: 'maintain' }, 80)!;
    const gain = computeTargets({ ...baseProfile, goal_type: 'gain' }, 80)!;
    expect(lose.calories).toBeLessThan(maintain.calories);
    expect(gain.calories).toBeGreaterThan(maintain.calories);
  });
});

describe('computeTargets — extreme values do not throw', () => {
  it('handles a very large athlete', () => {
    const t = computeTargets(
      { sex: 'male', birth_year: 2000, height_cm: 210, activity_level: 'very_active', goal_type: 'gain' },
      150
    );
    expect(t).not.toBeNull();
    expect(Number.isFinite(t!.calories)).toBe(true);
  });
});

describe('labels', () => {
  it('has a label for every activity level and goal', () => {
    expect(Object.keys(ACTIVITY_LABELS)).toHaveLength(5);
    expect(Object.keys(GOAL_LABELS)).toHaveLength(3);
  });
});

describe('todayISO', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
