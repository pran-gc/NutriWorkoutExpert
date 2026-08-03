import type { AssistantProposalState } from '@shared';

export const richFoodProposalState: AssistantProposalState = {
  id: '00000000-0000-4000-8000-000000000002', applied_at: null, dismissed_at: null,
  proposal: { kind: 'food_logs', title: 'Log chicken', entries: [{
    food_name: 'Chicken', meal_type: 'dinner', quantity_g: 150, calories: 247.5, protein_g: 46.5, carbs_g: 0, fat_g: 5.4, source: 'manual', logged_on: '2026-07-22',
    ingredients: [{ name: 'Chicken breast', quantity_g: 150, calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6, source: 'usda', micronutrients_per_100g: { fiber_g: null, sugar_g: 0, saturated_fat_g: 1, sodium_mg: 74, potassium_mg: 256, calcium_mg: 15, iron_mg: 1, vitamin_c_mg: null } }],
  }] },
};
