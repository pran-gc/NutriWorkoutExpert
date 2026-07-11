import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { SessionForm, type DraftSet } from './workouts';

jest.mock('@/lib/hooks', () => ({
  useCreateRoutine: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateRoutine: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function baseForm(set: DraftSet) {
  return {
    title: 'Workout',
    setTitle: jest.fn(),
    duration: '',
    setDuration: jest.fn(),
    notes: '',
    setNotes: jest.fn(),
    sets: [set],
    updateSet: jest.fn(),
    onPick: jest.fn(),
    onAddSet: jest.fn(),
    onRemoveSet: jest.fn(),
    onCancel: jest.fn(),
    onSave: jest.fn(),
    saving: false,
    editing: false,
  };
}

describe('SessionForm routine/edit flows', () => {
  it('renders routine placeholders and supports adding/removing sets', async () => {
    const onAddSet = jest.fn();
    const onRemoveSet = jest.fn();
    const form = await render(
      <SessionForm
        {...baseForm({
          exercise: 'Bench Press',
          exerciseId: 'bench',
          kind: 'strength',
          reps: '',
          weight: '',
          duration: '',
          distance: '',
          placeholder: '8 reps target',
        })}
        sets={[
          {
            exercise: 'Bench Press',
            exerciseId: 'bench',
            kind: 'strength',
            reps: '',
            weight: '',
            duration: '',
            distance: '',
            placeholder: '8 reps target',
          },
          {
            exercise: 'Squat',
            exerciseId: 'squat',
            kind: 'strength',
            reps: '5',
            weight: '100',
            duration: '',
            distance: '',
          },
        ]}
        onAddSet={onAddSet}
        onRemoveSet={onRemoveSet}
      />
    );
    await waitFor(() => expect(form.getByText('8 reps target')).toBeTruthy());
    fireEvent.press(form.getByText('+ Add set'));
    expect(onAddSet).toHaveBeenCalled();
    fireEvent.press(form.getByLabelText('Remove set 2'));
    expect(onRemoveSet).toHaveBeenCalledWith(1);
  });
});
