import type { WorkoutProgramQuestionnaire } from '../../_shared/index.ts';

export const PROGRAM_GEN_PROMPT_VERSION = 'program-gen.v1';

export function programGenPrompt(input: WorkoutProgramQuestionnaire): string {
  return [
    'Create a safe, editable workout program as strict JSON.',
    'Respect user goal, experience, days per week, equipment, and constraints. Avoid medical claims.',
    'Return { title, days:[{ name, rationale, exercises:[{ name, sets, reps, rationale }] }], notes }.',
    'Use common exercise names that can map to a strength/cardio library.',
    JSON.stringify(input),
  ].join('\n');
}
