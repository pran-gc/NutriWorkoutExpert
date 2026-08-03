import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ProgramChat } from './ProgramChat';

const revision = {
  title: 'Plan v2',
  days: [{ name: 'Day 1', rationale: '', exercises: [{ name: 'Leg Press', sets: 3, reps: '10-12', rationale: '' }] }],
  notes: [],
};
const mockMutateAsync = jest.fn(async () => ({ reply: 'Swapped squats for leg press.', updated_program: revision }));
jest.mock('@/lib/hooks', () => ({
  useRefineProgram: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

// Isolated file: async happy-path turns wedge test-renderer for later tests in the
// same file (RN 0.86/React 19 quirk) — see sign-in.submit.test.tsx.
describe('ProgramChat — revision turn (NWE-120)', () => {
  it('shows the revision card and applies it only on tap (nothing auto-applies)', async () => {
    const onApply = jest.fn();
    const { getByPlaceholderText, getByText, findByText } = await render(
      <ProgramChat insightId="00000000-0000-0000-0000-000000000002" onApplyRevision={onApply} />
    );

    const input = getByPlaceholderText(/day 2 is too long/i);
    fireEvent.changeText(input, 'no squat rack, swap squats');
    await waitFor(() => expect(input.props.value).toBe('no squat rack, swap squats'));
    fireEvent.press(getByText('Send'));

    expect(await findByText('Coach proposed a revision')).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled(); // proposal alone must not change the draft

    fireEvent.press(getByText('Apply this revision'));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(revision));
  });
});
