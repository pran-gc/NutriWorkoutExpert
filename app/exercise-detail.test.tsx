import { render } from '@testing-library/react-native';

import ExerciseDetailScreen from './exercise-detail';

const mockUseExerciseHistory = jest.fn();
jest.mock('@/lib/hooks', () => ({
  useExerciseHistory: (id: string | null, range: string) => mockUseExerciseHistory(id, range),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'exercise-1', name: 'Bench Press' }),
}));

describe('ExerciseDetailScreen', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders error and empty states', async () => {
    mockUseExerciseHistory.mockReturnValueOnce({ isLoading: false, isError: true, data: undefined });
    const error = await render(<ExerciseDetailScreen />);
    expect(error.getByText(/Couldn't load exercise history/i)).toBeTruthy();

    mockUseExerciseHistory.mockReturnValueOnce({ isLoading: false, isError: false, data: [] });
    const empty = await render(<ExerciseDetailScreen />);
    expect(empty.getByText('Log this exercise a few times to see progress.')).toBeTruthy();
  });

  it('renders history rows for chart data', async () => {
    mockUseExerciseHistory.mockReturnValueOnce({
      isLoading: false,
      isError: false,
      data: [{ logged_on: '2026-07-11', best_e1rm: 80, volume: 480, summary: '8 @ 60 kg' }],
    });
    const screen = await render(<ExerciseDetailScreen />);
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByText('2026-07-11 · 8 @ 60 kg')).toBeTruthy();
  });
});
