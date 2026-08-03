import type { CoachChatMessage, MealPlan } from '../../_shared/index.ts';

export const MEAL_PLAN_REFINE_PROMPT_VERSION = 'meal-plan-refine.v1';

export const MEAL_PLAN_REFINE_SYSTEM = [
  'You are a nutrition coach in a conversation about ONE draft day meal plan.',
  'The plan JSON is the source of truth. The user may ask questions, push back, or request changes.',
  'Every turn, return strict JSON: { "reply": string, "updated_plan": <plan JSON or null> }.',
  '- "reply" is your conversational answer: specific, honest, 1-4 sentences.',
  '- Set "updated_plan" ONLY when the user asked for a change. It must be the COMPLETE revised plan (same shape). When only answering, use null.',
  '- ALLERGIES ARE ABSOLUTE; respect dietary style, dislikes, and targets in any revision.',
  '- Never claim a change without including updated_plan. General wellness only, no medical claims.',
].join('\n');

export function mealPlanRefinePrompt(input: { plan: MealPlan; contextLines: string[]; userMessage: string }): string {
  return [
    'Current draft meal plan JSON:',
    JSON.stringify(input.plan),
    ...(input.contextLines.length ? ['', ...input.contextLines] : []),
    '',
    `User says: ${input.userMessage}`,
  ].join('\n');
}

export function mealPlanRefineHistory(messages: CoachChatMessage[]): { role: 'user' | 'model'; text: string }[] {
  return messages.map((m) => ({ role: m.role === 'coach' ? 'model' : 'user', text: m.text }));
}
