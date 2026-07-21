export const MEAL_PLAN_PROMPT_VERSION = 'meal-plan.v1';

// The nutritionist role. Safety rails are first-class: allergies are NEVER
// violated, and this is general wellness, not medical advice.
export const MEAL_PLAN_SYSTEM = [
  'You are an expert registered-dietitian-style nutrition coach planning ONE day of meals for a specific person.',
  'You have their body stats, goal, macro targets, training schedule, dietary needs, and what they actually eat.',
  'Principles you always apply:',
  '- Hit the daily macro targets as closely as is realistic across the meals; distribute protein across the day.',
  '- ALLERGIES ARE ABSOLUTE: never include an allergen or anything that commonly contains it. If unsure, choose a safe alternative.',
  '- Respect dietary style (vegetarian/vegan/halal/etc.) and disliked foods without exception.',
  '- Be TRAINING-AWARE: on a training day, favor more carbohydrate around the session and adequate protein for recovery; on a rest day, moderate carbs.',
  '- Build on foods the user already logs (familiar, repeatable meals beat exotic ones). Respect their cook-time preference.',
  '- Give each meal realistic macros and a simple recipe (ingredients + short steps). Keep the day’s totals close to target.',
  'This is general wellness guidance, not medical advice. No diagnoses, no claims to treat conditions. Body-neutral tone.',
  'Return ONLY valid JSON in the requested shape. No markdown, no prose outside the JSON.',
].join('\n');

export interface MealPlanContext {
  date: string;
  isTrainingDay: boolean;
  targets: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };
  bodyLine: string; // "34yo male, 180cm, ~80kg, goal: build muscle"
  mealsPerDay: number;
  recentFoods: string[];
  contextLines: string[]; // dietary + coaching profile + memory (from coachContextLines)
}

export function mealPlanPrompt(ctx: MealPlanContext): string {
  const t = ctx.targets;
  return [
    `Plan meals for ${ctx.date}. This is a ${ctx.isTrainingDay ? 'TRAINING day' : 'rest day'}.`,
    `The person: ${ctx.bodyLine}.`,
    t.calories != null
      ? `Daily targets: ${t.calories} kcal · protein ${t.protein_g ?? '?'} g · carbs ${t.carbs_g ?? '?'} g · fat ${t.fat_g ?? '?'} g.`
      : 'No calorie targets set yet — plan a balanced day appropriate to their goal.',
    `Plan ${ctx.mealsPerDay} meals for the day.`,
    ctx.recentFoods.length ? `Foods they actually eat (bias toward these): ${ctx.recentFoods.slice(0, 20).join(', ')}.` : '',
    ...ctx.contextLines,
    '',
    'Output JSON exactly:',
    '{ "title": string, "meals": [ { "name": string, "meal_type": "breakfast"|"lunch"|"dinner"|"snack", "macros": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }, "recipe": { "ingredients": string[], "steps": string[] }, "note": string } ], "day_totals": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }, "notes": string[] }',
  ]
    .filter(Boolean)
    .join('\n');
}
