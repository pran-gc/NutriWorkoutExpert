export interface LoggedDay {
  logged_on: string;
}

export interface StreakSummary {
  current: number;
  longest: number;
  lastLoggedOn: string | null;
}

export interface Quest {
  id: string;
  title: string;
  metric: 'food' | 'water' | 'workout';
  target: number;
  progress: number;
  complete: boolean;
}

export interface BadgeCatalogItem {
  id: string;
  title: string;
  description: string;
}

export const BADGE_CATALOG: BadgeCatalogItem[] = [
  { id: 'first_meal', title: 'First plate', description: 'Logged your first meal.' },
  { id: 'three_day_streak', title: 'Three steady days', description: 'Logged food three days in a row.' },
  { id: 'seven_day_streak', title: 'Seven steady days', description: 'Logged food seven days in a row.' },
  { id: 'thirty_day_streak', title: 'Thirty day rhythm', description: 'Logged food thirty days in a row.' },
  { id: 'first_workout', title: 'First session', description: 'Logged your first workout.' },
  { id: 'ten_workouts', title: 'Ten sessions', description: 'Logged ten workouts.' },
  { id: 'fifty_workouts', title: 'Fifty sessions', description: 'Logged fifty workouts.' },
  { id: 'first_snap_to_log', title: 'First snap', description: 'Logged your first AI photo meal.' },
  { id: 'first_pr', title: 'First PR', description: 'Set your first strength PR.' },
  { id: 'hydration_week', title: 'Hydration rhythm', description: 'Logged water on five days in a week.' },
  { id: 'weekly_review', title: 'Review reader', description: 'Generated a weekly review.' },
  { id: 'goal_25', title: 'Quarter way', description: 'Reached 25% of your goal-weight path.' },
  { id: 'goal_50', title: 'Halfway there', description: 'Reached 50% of your goal-weight path.' },
  { id: 'goal_100', title: 'Goal reached', description: 'Reached your goal weight.' },
];

const MS_PER_DAY = 86400000;

function toDayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
}

function todayNumber(today: string): number {
  return toDayNumber(today);
}

export function computeDailyStreak(days: string[], today: string): StreakSummary {
  const unique = [...new Set(days)].sort();
  if (unique.length === 0) return { current: 0, longest: 0, lastLoggedOn: null };
  const nums = unique.map(toDayNumber);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < nums.length; i++) {
    run = nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const last = nums[nums.length - 1];
  let current = 0;
  if (last === todayNumber(today) || last === todayNumber(today) - 1) {
    current = 1;
    for (let i = nums.length - 2; i >= 0; i--) {
      if (nums[i] === nums[i + 1] - 1) current += 1;
      else break;
    }
  }
  return { current, longest, lastLoggedOn: unique[unique.length - 1] };
}

export function generateDailyQuests(input: {
  date: string;
  foodLogs: LoggedDay[];
  waterMl: number;
  workouts: LoggedDay[];
  waterTargetMl?: number | null;
}): Quest[] {
  const meals = input.foodLogs.filter((row) => row.logged_on === input.date).length;
  const workouts = input.workouts.filter((row) => row.logged_on === input.date).length;
  const waterTarget = Math.max(1000, input.waterTargetMl ?? 2000);
  return [
    {
      id: 'log_two_meals',
      title: 'Log two meals',
      metric: 'food',
      target: 2,
      progress: Math.min(2, meals),
      complete: meals >= 2,
    },
    {
      id: 'drink_water',
      title: 'Hit your water rhythm',
      metric: 'water',
      target: waterTarget,
      progress: Math.min(waterTarget, input.waterMl),
      complete: input.waterMl >= waterTarget,
    },
    {
      id: 'move_or_recover',
      title: 'Train or protect recovery',
      metric: 'workout',
      target: 1,
      progress: Math.min(1, workouts),
      complete: workouts >= 1,
    },
  ];
}

export function evaluateBadges(input: {
  foodDays: string[];
  workoutCount: number;
  waterDaysThisWeek: number;
  weeklyReviews: number;
  aiPhotoLogs?: number;
  prCount?: number;
  goalProgressPct?: number;
  today: string;
}): string[] {
  const earned = new Set<string>();
  const streak = computeDailyStreak(input.foodDays, input.today).longest;
  if (input.foodDays.length > 0) earned.add('first_meal');
  if (streak >= 3) earned.add('three_day_streak');
  if (streak >= 7) earned.add('seven_day_streak');
  if (streak >= 30) earned.add('thirty_day_streak');
  if (input.workoutCount > 0) earned.add('first_workout');
  if (input.workoutCount >= 10) earned.add('ten_workouts');
  if (input.workoutCount >= 50) earned.add('fifty_workouts');
  if ((input.aiPhotoLogs ?? 0) > 0) earned.add('first_snap_to_log');
  if ((input.prCount ?? 0) > 0) earned.add('first_pr');
  if (input.waterDaysThisWeek >= 5) earned.add('hydration_week');
  if (input.weeklyReviews > 0) earned.add('weekly_review');
  if ((input.goalProgressPct ?? 0) >= 25) earned.add('goal_25');
  if ((input.goalProgressPct ?? 0) >= 50) earned.add('goal_50');
  if ((input.goalProgressPct ?? 0) >= 100) earned.add('goal_100');
  return [...earned];
}
