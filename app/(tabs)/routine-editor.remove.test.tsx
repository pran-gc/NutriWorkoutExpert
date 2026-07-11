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

describe('RoutineEditor removal', () => {
  it('removes existing exercises', async () => {
    const editor = await render(
      <RoutineEditor
        routine={{
          id: 'routine-1',
          user_id: 'user-1',
          name: 'Existing',
          notes: null,
          created_at: '2026-07-11T00:00:00Z',
          updated_at: '2026-07-11T00:00:00Z',
          routine_exercises: [
            {
              id: 'item-1',
              routine_id: 'routine-1',
              user_id: 'user-1',
              exercise_id: 'bench',
              position: 0,
              target_sets: 3,
              target_reps: 8,
              exercise: bench,
            },
          ],
        } as any}
        exercises={[bench] as any}
        onClose={jest.fn()}
        onPickQuery={jest.fn()}
      />
    );
    expect(editor.getByLabelText('Remove Bench Press')).toBeTruthy();
    fireEvent.press(editor.getByLabelText('Remove Bench Press'));
    await waitFor(() => expect(editor.queryByLabelText('Remove Bench Press')).toBeNull());
  });
});
