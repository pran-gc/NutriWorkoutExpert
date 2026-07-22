import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ProposalCard } from './ProposalCard';
import { richFoodProposalState } from './ProposalCard.fixtures';

const mockApply = jest.fn(async () => ({ result: { message: 'Added' } }));
jest.mock('@/lib/hooks', () => ({
  useApplyAssistantProposal: () => ({ mutateAsync: mockApply, isPending: false, isSuccess: false, isError: false }),
  useSaveAssistantProposalRecipe: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useResolveFood: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false }),
  useExercises: () => ({ data: [] }), useProfile: () => ({ data: null }),
}));

test('approve submits exactly the edited and revalidated food snapshot', async () => {
  const screen = await render(<ProposalCard state={richFoodProposalState} />);
  await act(async () => { fireEvent.press(screen.getByLabelText('Review proposal: Log chicken')); });
  expect(screen.queryByLabelText('Chicken breast quantity in grams')).toBeNull();
  await act(async () => { fireEvent.press(screen.getByLabelText('Edit proposal')); });
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Chicken breast quantity in grams'), '200'); });
  await waitFor(() => expect(screen.getByText('330 kcal')).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByText('Log')); });
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ id: richFoodProposalState.id, proposal: expect.objectContaining({ entries: [expect.objectContaining({ calories: 330, protein_g: 62 })] }) })));
});
