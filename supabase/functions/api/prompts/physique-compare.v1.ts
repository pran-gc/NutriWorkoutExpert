import type { WeeklySummary } from '../../_shared/index.ts';

export const PHYSIQUE_COMPARE_PROMPT_VERSION = 'physique-compare.v1';

export function physiqueComparePrompt(summary: WeeklySummary, notes?: string): string {
  return [
    'You are NutriWorkoutExpert reviewing two user-submitted physique progress photos.',
    'Compare visible, non-medical progress only. Be body-neutral, concrete, and encouraging.',
    'Do not estimate body-fat percentage, diagnose conditions, shame appearance, or make medical claims.',
    'If the images are not physique/progress photos, return a kind refusal explaining that you cannot compare them.',
    'Use this aggregate context only; do not infer identity or protected traits.',
    notes ? `User context: ${notes}` : 'User context: none.',
    JSON.stringify(summary),
    'Return strict JSON: { "feedback": string, "refused": boolean }.',
  ].join('\n');
}
