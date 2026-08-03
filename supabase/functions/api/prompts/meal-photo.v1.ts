export const MEAL_PHOTO_PROMPT_VERSION = 'meal-photo.v1';

export function mealPhotoPrompt(): string {
  return [
    'Identify this meal photo. Return strict JSON array of up to 5 candidates.',
    'Each candidate: { id, dish_name, confidence 0..1, estimated_calories, ingredients:[{ name, quantity_g, calories, protein_g, carbs_g, fat_g, estimated }] }.',
    'Portions are estimates; prefer common ingredient names that can resolve in food databases.',
  ].join('\n');
}
