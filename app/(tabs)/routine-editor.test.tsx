import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { RoutineEditor } from './workouts';

jest.mock('@/lib/hooks', () => ({
  useCreateRoutine: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateRoutine: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const bench = {
  id: 'bench',
  user_id: null,
  name: 'Bench Press',
  muscle_group: 'chest',
  kind: 'strength',
};
const run = {
  id: 'run',
  user_id: null,
  name: 'Run',
  muscle_group: 'full_body',
  kind: 'cardio',
};

describe('RoutineEditor', () => {
  it('adds exercises', async () => {
    const editor = await render(
      <RoutineEditor routine="new" exercises={[bench, run] as any} onClose={jest.fn()} onPickQuery={jest.fn()} />
    );
    fireEvent.changeText(editor.getByLabelText('Routine name'), 'Review Routine');
    fireEvent.press(editor.getByText('Bench Press'));
    await waitFor(() => expect(editor.getByPlaceholderText('Sets')).toBeTruthy());
    expect(editor.getByLabelText('Remove Bench Press')).toBeTruthy();
  });

});
