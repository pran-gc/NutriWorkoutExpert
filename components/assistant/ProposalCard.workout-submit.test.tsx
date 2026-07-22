import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { AssistantProposalState } from '@shared';
import { ProposalCard } from './ProposalCard';

const mockApply = jest.fn(async () => ({ result: { message: 'Workout logged' } }));
jest.mock('@/lib/hooks', () => ({
  useApplyAssistantProposal: () => ({ mutateAsync: mockApply, isPending: false, isSuccess: false, isError: false }),
  useSaveAssistantProposalRecipe: () => ({ mutateAsync: jest.fn(), isPending: false, isSuccess: false, isError: false }),
  useResolveFood: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false }),
  useExercises: () => ({ data: [] }), useProfile: () => ({ data: null }),
}));

test('an unmatched workout is read-only by default and logs without user matching', async () => {
  const state: AssistantProposalState = { id: '00000000-0000-4000-8000-000000000021', applied_at: null, dismissed_at: null, proposal: {
    kind: 'workout_log', title: 'Push day', logged_on: '2026-07-22', duration_min: 48,
    exercises: [{ name: 'Bench', kind: 'strength', sets: [{ reps: 8, weight_kg: 80 }] }],
  } };
  const screen = await render(<ProposalCard state={state} />);
  await act(async () => { fireEvent.press(screen.getByLabelText('Review proposal: Push day')); });
  expect(screen.getByText('Set')).toBeTruthy();
  expect(screen.getByText('Reps')).toBeTruthy();
  expect(screen.getByText('kg')).toBeTruthy();
  expect(screen.queryByText('Needs match')).toBeNull();
  expect(screen.queryByLabelText('Bench set 1 reps')).toBeNull();
  await act(async () => { fireEvent.press(screen.getByLabelText('Log')); });
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ proposal: state.proposal }))); 
});
