import { render } from '@testing-library/react-native';

import GymAnalyticsScreen from './gym-analytics';

const mockUseTrainingAnalytics = jest.fn();
jest.mock('@/lib/hooks', () => ({
  useTrainingAnalytics: (params: unknown) => mockUseTrainingAnalytics(params),
}));

describe('GymAnalyticsScreen', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders empty and error states', async () => {
    mockUseTrainingAnalytics.mockReturnValueOnce({
      isLoading: false,
      isError: true,
      data: undefined,
    });
    const error = await render(<GymAnalyticsScreen />);
    expect(error.getByText(/Couldn't load gym analytics/i)).toBeTruthy();

    mockUseTrainingAnalytics.mockReturnValueOnce({
      isLoading: false,
      isError: false,
      data: { weeklyVolume: [], consistency: { sessions: 0, sessionsPerWeek: 0, longestWeekStreak: 0 }, prs: [], cardio: [] },
    });
    const empty = await render(<GymAnalyticsScreen />);
    expect(empty.getByText('Log workouts to see training trends.')).toBeTruthy();
  });

  it('renders strength PRs and cardio-only data without crashing', async () => {
    mockUseTrainingAnalytics.mockReturnValueOnce({
      isLoading: false,
      isError: false,
      data: {
        weeklyVolume: [{ week: '2026-W28', groups: { chest: 1200 } }],
        consistency: { sessions: 2, sessionsPerWeek: 2, longestWeekStreak: 1 },
        prs: [{ exercise: 'Bench Press', e1rm: 80, date: '2026-07-11' }],
        cardio: [],
      },
    });
    const strength = await render(<GymAnalyticsScreen />);
    expect(strength.getByText('🎉 Bench Press')).toBeTruthy();
    expect(strength.getByText('80 kg · 2026-07-11')).toBeTruthy();

    mockUseTrainingAnalytics.mockReturnValueOnce({
      isLoading: false,
      isError: false,
      data: {
        weeklyVolume: [],
        consistency: { sessions: 1, sessionsPerWeek: 1, longestWeekStreak: 1 },
        prs: [],
        cardio: [{ date: '2026-07-11', minutes: 28, distance_km: 5.2 }],
      },
    });
    const cardio = await render(<GymAnalyticsScreen />);
    expect(cardio.getByText('No strength volume in this range.')).toBeTruthy();
  });
});
