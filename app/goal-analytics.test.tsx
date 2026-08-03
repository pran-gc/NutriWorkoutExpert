import { render } from '@testing-library/react-native';

import GoalAnalyticsScreen from './goal-analytics';

const mockUseGoalAnalytics = jest.fn();
jest.mock('@/lib/hooks', () => ({
  useGoalAnalytics: () => mockUseGoalAnalytics(),
}));

describe('GoalAnalyticsScreen', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders error and sparse/no-data affordances', async () => {
    mockUseGoalAnalytics.mockReturnValueOnce({ isLoading: false, isError: true, data: undefined });
    const error = await render(<GoalAnalyticsScreen />);
    expect(error.getByText(/Couldn't load goal analytics/i)).toBeTruthy();

    mockUseGoalAnalytics.mockReturnValueOnce({ isLoading: false, isError: false, data: { projection: { state: 'sparse' }, weights: [] } });
    const sparse = await render(<GoalAnalyticsScreen />);
    expect(sparse.getByText('Log more to see this.')).toBeTruthy();
  });

  it('renders projected, moving-away, and at-goal copy', async () => {
    mockUseGoalAnalytics.mockReturnValueOnce({
      isLoading: false,
      isError: false,
      data: { projection: { state: 'projected', eta: '2026-09-01', kgPerWeek: -0.5 }, weights: [] },
    });
    const projected = await render(<GoalAnalyticsScreen />);
    expect(projected.getByText('~2026-09-01')).toBeTruthy();

    mockUseGoalAnalytics.mockReturnValueOnce({
      isLoading: false,
      isError: false,
      data: { projection: { state: 'moving-away', kgPerWeek: 0.4 }, weights: [] },
    });
    const movingAway = await render(<GoalAnalyticsScreen />);
    expect(movingAway.getByText(/moving away from the target/i)).toBeTruthy();

    mockUseGoalAnalytics.mockReturnValueOnce({
      isLoading: false,
      isError: false,
      data: { projection: { state: 'at-goal', kgPerWeek: 0 }, weights: [] },
    });
    const atGoal = await render(<GoalAnalyticsScreen />);
    expect(atGoal.getByText('At goal')).toBeTruthy();
  });
});
