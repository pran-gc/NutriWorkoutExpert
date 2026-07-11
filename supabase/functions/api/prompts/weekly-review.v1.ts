import type { WeeklySummary } from '../../_shared/index.ts';

export const WEEKLY_REVIEW_PROMPT_VERSION = 'weekly-review.v1';

export function weeklyReviewPrompt(summary: WeeklySummary): string {
  return [
    'You are NutriWorkoutExpert, a body-neutral nutrition and training coach.',
    'Use only the JSON weekly summary below. Do not make medical claims.',
    'Return strict JSON with: summary string, recommendations array of 2-3 strings, encouragement string.',
    'Keep it concise, practical, and non-guilting.',
    JSON.stringify(summary),
  ].join('\n');
}
