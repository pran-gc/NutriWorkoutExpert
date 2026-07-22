import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import type { AssistantProposalState } from '@shared';
import { ProposalCard } from './ProposalCard';

const mockApply = jest.fn(async () => ({ result: { message: 'Added to your food log' } }));
const mockResolve = jest.fn();
const mockSaveRecipe = jest.fn(async () => ({ result: { message: 'Recipe saved' } }));
const mockHook = jest.fn();
jest.mock('@/lib/hooks', () => ({
  useApplyAssistantProposal: () => mockHook(),
  useSaveAssistantProposalRecipe: () => ({ mutateAsync: mockSaveRecipe, isPending: false, isSuccess: false, isError: false }),
  useResolveFood: () => ({ mutateAsync: mockResolve, isPending: false, isError: false }),
  useExercises: () => ({ data: [] }),
  useProfile: () => ({ data: { calorie_target: 2200 } }),
}));

const state: AssistantProposalState = {
  id: '00000000-0000-4000-8000-000000000001', applied_at: null, dismissed_at: null,
  proposal: {
    kind: 'food_logs', title: 'Log your lunch', entries: [{ food_name: 'Rice bowl', meal_type: 'lunch', quantity_g: 350, calories: 510, protein_g: 28, carbs_g: 72, fat_g: 11, source: 'manual', logged_on: '2026-07-21' }],
  },
};

beforeEach(() => mockHook.mockReturnValue({ mutateAsync: mockApply, isPending: false, isSuccess: false, isError: false }));

test('reviewing keeps the proposal and approval applies it once', async () => {
  const screen = await render(<ProposalCard state={state} />);
  await act(async () => { fireEvent.press(screen.getByLabelText('Review proposal: Log your lunch')); });
  expect(screen.getByText('Rice bowl')).toBeTruthy();
  expect(screen.getByText('Review')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('Log')); });
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith({ id: state.id, proposal: state.proposal }));
});
