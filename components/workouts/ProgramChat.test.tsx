import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ProgramChat } from './ProgramChat';

const mockMutateAsync = jest.fn(async () => ({ reply: 'Rows balance your pressing volume.', updated_program: null }));
jest.mock('@/lib/hooks', () => ({
  useRefineProgram: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

describe('ProgramChat — reply-only turn (NWE-120)', () => {
  it('sends a message and renders the coach reply without a revision card', async () => {
    const onApply = jest.fn();
    const { getByPlaceholderText, getByText, queryByText } = await render(
      <ProgramChat insightId="00000000-0000-0000-0000-000000000001" onApplyRevision={onApply} />
    );

    const input = getByPlaceholderText(/day 2 is too long/i);
    fireEvent.changeText(input, 'why rows?');
    // Concurrent render: wait for the controlled input to flush before pressing
    // Send (otherwise send() reads stale empty state) — see sign-in tests.
    await waitFor(() => expect(input.props.value).toBe('why rows?'));
    fireEvent.press(getByText('Send'));

    await waitFor(() => expect(getByText('Rows balance your pressing volume.')).toBeTruthy());
    expect(getByText('why rows?')).toBeTruthy(); // user bubble rendered
    expect(queryByText('Coach proposed a revision')).toBeNull(); // no revision channel
    expect(onApply).not.toHaveBeenCalled();
    expect(mockMutateAsync).toHaveBeenCalledWith({
      insight_id: '00000000-0000-0000-0000-000000000001',
      message: 'why rows?',
    });
  });
});
