import { act, fireEvent, render } from '@testing-library/react-native';
import { ProposalCard } from './ProposalCard';
import { richFoodProposalState } from './ProposalCard.fixtures';

jest.mock('@/lib/hooks', () => ({
  useApplyAssistantProposal: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useSaveAssistantProposalRecipe: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useResolveFood: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false }),
  useExercises: () => ({ data: [] }), useProfile: () => ({ data: null }),
}));

test('closing and reopening the review sheet discards local edits', async () => {
  const screen = await render(<ProposalCard state={richFoodProposalState} />);
  await act(async () => { fireEvent.press(screen.getByLabelText('Review proposal: Log chicken')); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Edit proposal')); });
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Chicken breast quantity in grams'), '200'); });
  expect(screen.getByText('330 kcal')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('Close')); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Review proposal: Log chicken')); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Edit proposal')); });
  expect(screen.getByLabelText('Chicken breast quantity in grams').props.value).toBe('150');
});
