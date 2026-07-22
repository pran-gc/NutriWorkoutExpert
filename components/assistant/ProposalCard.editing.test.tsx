import { act, fireEvent, render } from '@testing-library/react-native';
import { ProposalCard } from './ProposalCard';
import { richFoodProposalState } from './ProposalCard.fixtures';

const mockApply = jest.fn(); const mockResolve = jest.fn();
jest.mock('@/lib/hooks', () => ({
  useApplyAssistantProposal: () => ({ mutateAsync: mockApply, isPending: false, isSuccess: false, isError: false }),
  useSaveAssistantProposalRecipe: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useResolveFood: () => ({ mutateAsync: mockResolve, isPending: false, isError: false }),
  useExercises: () => ({ data: [] }), useProfile: () => ({ data: { calorie_target: 2200 } }),
}));

test('quantity and deletion edits stay local, recalculate, and block an empty proposal', async () => {
  const screen = await render(<ProposalCard state={richFoodProposalState} />);
  await act(async () => { fireEvent.press(screen.getByLabelText('Review proposal: Log chicken')); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Edit proposal')); });
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Chicken breast quantity in grams'), '200'); });
  expect(screen.getByText('330 kcal')).toBeTruthy();
  expect(mockResolve).not.toHaveBeenCalled(); expect(mockApply).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByLabelText('Delete Chicken breast')); });
  expect(screen.getByText('Add at least one ingredient.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Log', disabled: true })).toBeTruthy();
  expect(mockResolve).not.toHaveBeenCalled(); expect(mockApply).not.toHaveBeenCalled();
});
