import { fireEvent, render, waitFor, within } from '@testing-library/react-native';

import { ExercisePicker, SessionForm, type DraftSet } from './workouts';

const mockCreateRoutine = { mutateAsync: jest.fn(), isPending: false };
const mockUpdateRoutine = { mutateAsync: jest.fn(), isPending: false };
jest.mock('@/lib/hooks', () => ({
  useCreateRoutine: () => mockCreateRoutine,
  useUpdateRoutine: () => mockUpdateRoutine,
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
  recent_at: null,
};
const recentCurl = {
  id: 'curl',
  user_id: 'user-1',
  name: 'Cable Curl',
  muscle_group: 'chest',
  kind: 'strength',
  recent_at: '2026-07-11T10:00:00Z',
};
const run = {
  id: 'run',
  user_id: null,
  name: 'Run',
  muscle_group: 'full_body',
  kind: 'cardio',
  recent_at: null,
};

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

describe('workout components', () => {
  afterEach(() => jest.clearAllMocks());

  it('filters picker rows, shows the custom tag, creates missing exercises, and sorts recent first', async () => {
    const onCreate = jest.fn();
    const picker = await render(
      <ExercisePicker
        query="z press"
        setQuery={jest.fn()}
        exercises={[bench, recentCurl] as any}
        onChoose={jest.fn()}
        onCreate={onCreate}
        loading={false}
      />
    );
    expect(picker.queryByText('Bench Press')).toBeNull();
    expect(picker.getByText('+ Create "z press"')).toBeTruthy();
    fireEvent.press(picker.getByText('+ Create "z press"'));
    expect(onCreate).toHaveBeenCalled();
    picker.unmount();

    const ordered = await render(
      <ExercisePicker
        query=""
        setQuery={jest.fn()}
        exercises={[bench, recentCurl] as any}
        onChoose={jest.fn()}
        onCreate={jest.fn()}
        loading={false}
      />
    );
    expect(within(ordered.getByTestId('exercise-picker-row-0')).getByText('Cable Curl')).toBeTruthy();
    expect(ordered.getByText('custom · strength')).toBeTruthy();
    ordered.unmount();
  });

  it('swaps cardio rows to distance/duration and displays inline pace', async () => {
    const form = await render(
      <SessionForm
        {...baseForm({
          exercise: 'Run',
          exerciseId: 'run',
          kind: 'cardio',
          reps: '',
          weight: '',
          duration: '27',
          distance: '5',
        })}
      />
    );
    await waitFor(() => expect(form.getByLabelText('Set 1 distance km')).toBeTruthy());
    expect(form.getByLabelText('Set 1 duration min')).toBeTruthy();
    expect(form.queryByLabelText('Set 1 reps')).toBeNull();
    expect(form.getByText('5:24 /km')).toBeTruthy();
  });

});
