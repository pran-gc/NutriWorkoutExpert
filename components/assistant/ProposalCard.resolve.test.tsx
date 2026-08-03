import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ProposalCard } from './ProposalCard';
import { richFoodProposalState } from './ProposalCard.fixtures';

const mockResolve = jest.fn(async () => ({ dish_name: 'Rice', totals: {}, ingredients: [{
  name: 'Rice', quantity_g: 100, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3,
  calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3,
  estimated: false, source: 'openfoodfacts', source_id: 'rice-1', micronutrients_per_100g: { fiber_g: 1, sugar_g: 0, saturated_fat_g: 0, sodium_mg: 1, potassium_mg: null, calcium_mg: null, iron_mg: null, vitamin_c_mg: null },
}] }));
jest.mock('@/lib/hooks', () => ({
  useApplyAssistantProposal: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useSaveAssistantProposalRecipe: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useResolveFood: () => ({ mutateAsync: mockResolve, isPending: false, isError: false }),
  useExercises: () => ({ data: [] }), useProfile: () => ({ data: null }),
}));

test('adding an ingredient makes exactly one direct resolution call and shows provenance', async () => {
  const screen = await render(<ProposalCard state={richFoodProposalState} />);
  await act(async () => { fireEvent.press(screen.getByLabelText('Review proposal: Log chicken')); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Edit proposal')); });
  await act(async () => { fireEvent.changeText(screen.getByLabelText('New ingredient name'), 'Rice'); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Resolve and add ingredient')); });
  await waitFor(() => expect(mockResolve).toHaveBeenCalledTimes(1));
  expect(mockResolve).toHaveBeenCalledWith({ dish_name: 'Rice', ingredients: [{ name: 'Rice', quantity_g: 100 }] });
  expect(screen.getByLabelText('Nutrition source: Open Food Facts')).toBeTruthy();
});
