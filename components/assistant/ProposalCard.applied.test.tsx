import { render } from '@testing-library/react-native';

import type { AssistantProposalState } from '@shared';
import { ProposalCard } from './ProposalCard';

jest.mock('@/lib/hooks', () => ({
  useApplyAssistantProposal: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useSaveAssistantProposalRecipe: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useResolveFood: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false }),
  useExercises: () => ({ data: [] }),
  useProfile: () => ({ data: null }),
}));

test('already-applied proposals render a confirmed state and cannot apply twice', async () => {
  const state: AssistantProposalState = {
    id: '00000000-0000-4000-8000-000000000001', applied_at: '2026-07-21T12:00:00Z', dismissed_at: null,
    apply_result: { message: 'Added to your food log' },
    proposal: { kind: 'food_logs', title: 'Log lunch', entries: [{ food_name: 'Rice bowl', meal_type: 'lunch', quantity_g: 350, calories: 510, protein_g: 28, carbs_g: 72, fat_g: 11, source: 'manual', logged_on: '2026-07-21' }] },
  };
  const screen = await render(<ProposalCard state={state} />);
  expect(screen.getAllByText('Added to your food log').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Review proposal: Log lunch', disabled: true })).toBeTruthy();
});
