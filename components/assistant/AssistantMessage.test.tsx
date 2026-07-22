import { act, fireEvent, render } from '@testing-library/react-native';

import type { AssistantMessage } from '@shared';
import { AssistantMessageBubble } from './AssistantMessage';

function message(patch: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id: 'message-1', role: 'assistant', content: 'Keep your progression steady.', failed: false,
    proposal_insight_id: null, tool_trace: null, created_at: '2026-07-21T12:00:00Z', ...patch,
  };
}

test('tool transparency is absent without a trace and expands real trace data', async () => {
  const screen = await render(<AssistantMessageBubble message={message()} />);
  expect(screen.queryByText(/What I looked at/)).toBeNull();
  await screen.rerender(<AssistantMessageBubble message={message({ tool_trace: [{ name: 'get_workout_trends', args_preview: { days: 90 }, ms: 18, ok: true }] })} />);
  await act(async () => { fireEvent.press(screen.getByText(/What I looked at/)); });
  expect(screen.getByText('Workout trends')).toBeTruthy();
  expect(screen.getByText(/18 ms/)).toBeTruthy();
});

test('failed advice is visibly replaced with a retry affordance', async () => {
  const retry = jest.fn();
  const screen = await render(<AssistantMessageBubble message={message({ failed: true })} failureReason="The assistant model is misconfigured." onRetry={retry} />);
  expect(screen.queryByText('Keep your progression steady.')).toBeNull();
  expect(screen.getByText('I hit a snag before I could finish. Try that again?')).toBeTruthy();
  expect(screen.queryByText(/misconfigured|Invalid arguments|Reason:/i)).toBeNull();
  fireEvent.press(screen.getByText('Retry'));
  expect(retry).toHaveBeenCalledTimes(1);
});
