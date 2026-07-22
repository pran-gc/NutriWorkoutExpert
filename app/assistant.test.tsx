import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import AssistantScreen from './assistant';

const mockRefetch = jest.fn(async () => ({}));
const mockStream = jest.fn();
const mockGetThread = jest.fn(async (_id: string) => null);

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/lib/hooks', () => ({
  useAssistantThread: () => ({ data: null, isLoading: false, isError: false, refetch: mockRefetch }),
  useAssistantThreads: () => ({ data: [], isLoading: false, isError: false, refetch: mockRefetch }),
  useApplyAssistantProposal: () => ({ isSuccess: false, isPending: false, mutateAsync: jest.fn() }),
}));
jest.mock('@/lib/api', () => ({
  ApiClientError: class ApiClientError extends Error { code: string; constructor(err: { code: string; message: string }) { super(err.message); this.code = err.code; } },
  streamAssistantChat: (...args: unknown[]) => mockStream(...args),
  getAssistantThread: (id: string) => mockGetThread(id),
}));
jest.mock('@/components/assistant/ProposalCard', () => ({
  ProposalCard: ({ state }: { state: { proposal: { title: string } } }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { accessibilityLabel: `Review proposal: ${state.proposal.title}` }, state.proposal.title);
  },
}));

test('renders progress from real tool events and appends streamed text', async () => {
  mockStream.mockImplementation(async function* () {
    yield { type: 'thought', message: 'Thinking…' };
    yield { type: 'function_call', name: 'get_workout_trends', args: { days: 90 } };
    yield { type: 'text', delta: 'Your rhythm ' };
    yield { type: 'text', delta: 'looks steady.' };
    yield { type: 'done', thread_id: '00000000-0000-4000-8000-000000000001', message_id: '00000000-0000-4000-8000-000000000002', interaction_id: 'mock' };
  });
  const screen = await render(<AssistantScreen />);
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Message the AI assistant'), 'How is training?'); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Send message')); });
  await waitFor(() => expect(screen.getByText('Your rhythm looks steady.')).toBeTruthy());
  expect(mockStream).toHaveBeenCalledWith({ message: 'How is training?' });
});

test('keeps the conversation in the available viewport and dismisses the keyboard while scrolling', async () => {
  const screen = await render(<AssistantScreen />);
  const list = screen.getByTestId('assistant-message-list');

  expect(StyleSheet.flatten(list.props.style)).toMatchObject({ flex: 1 });
  expect(list.props.keyboardDismissMode).toBe('interactive');
  expect(list.props.keyboardShouldPersistTaps).toBe('handled');
});

test('shows a streamed proposal card inline on the turn in a brand-new thread', async () => {
  mockStream.mockImplementation(async function* () {
    yield {
      type: 'proposal', insight_id: '00000000-0000-4000-8000-000000000010', proposal_kind: 'workout_log',
      proposal: { kind: 'workout_log', title: 'Lower body workout', logged_on: '2026-07-22', exercises: [{ name: 'RDL', kind: 'strength', sets: [{ reps: 8, weight_kg: 20 }] }] },
    };
    yield { type: 'text', delta: 'I’ve put the workout together below.' };
    yield { type: 'done', thread_id: '00000000-0000-4000-8000-000000000001', message_id: '00000000-0000-4000-8000-000000000002', interaction_id: 'mock' };
  });
  const screen = await render(<AssistantScreen />);
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Message the AI assistant'), 'Log my workout'); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Send message')); });

  await waitFor(() => expect(screen.getByLabelText('Review proposal: Lower body workout')).toBeTruthy());
  expect(screen.getByText('I’ve put the workout together below.')).toBeTruthy();
  expect(mockGetThread).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
});
