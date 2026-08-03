import { render } from '@testing-library/react-native';
import { ProposalCard } from './ProposalCard';
import { richFoodProposalState } from './ProposalCard.fixtures';

jest.mock('@/lib/hooks', () => ({
  useApplyAssistantProposal: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useSaveAssistantProposalRecipe: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useResolveFood: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false }),
  useExercises: () => ({ data: [] }), useProfile: () => ({ data: null }),
}));

test('superseded proposals collapse and cannot be reviewed', async () => {
  const screen = await render(<ProposalCard state={{ ...richFoodProposalState, superseded: true, dismissed_at: '2026-07-22T00:00:00Z' }} />);
  expect(screen.getByText('Updated below')).toBeTruthy();
  expect(screen.queryByLabelText('Review proposal: Log chicken')).toBeNull();
});
