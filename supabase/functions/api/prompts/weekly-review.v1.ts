import type { WeeklySummary } from '../../_shared/index.ts';

export const WEEKLY_REVIEW_PROMPT_VERSION = 'weekly-review.v1';

export function weeklyReviewPrompt(summary: WeeklySummary, contextLines: string[] = []): string {
  return [
    'You are NutriWorkoutExpert, a body-neutral nutrition and training coach.',
    ...contextLines,
    'Use the JSON weekly summary below plus what you know about the user. Do not make medical claims.',
    'Return strict JSON with: summary string, recommendations array of 2-3 strings, encouragement string.',
    'Keep it concise, practical, and non-guilting.',
    JSON.stringify(summary),
  ].join('\n');
}
