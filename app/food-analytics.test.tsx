import { fireEvent, render, waitFor } from '@testing-library/react-native';

import FoodAnalyticsScreen from './food-analytics';

const mockUseFoodAnalytics = jest.fn();
jest.mock('@/lib/hooks', () => ({
  useFoodAnalytics: (params: unknown) => mockUseFoodAnalytics(params),
}));

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const foodData = {
  daily: [{ date: isoDaysAgo(0), calories: 1800, protein_g: 120, carbs_g: 180, fat_g: 60, closeness: 0.8 }],
  avg: { calories: 1800, protein_g: 120, carbs_g: 180, fat_g: 60 },
  byMeal: [{ meal_type: 'breakfast', calories: 500 }],
  topFoods: [{ name: 'Oats', count: 2, calories: 600 }],
};

describe('FoodAnalyticsScreen', () => {
  afterEach(() => jest.clearAllMocks());

  it('shows a loading skeleton instead of a bare spinner', async () => {
    mockUseFoodAnalytics.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    const { getAllByText } = await render(<FoodAnalyticsScreen />);
    expect(getAllByText('Food analytics')).toHaveLength(1);
  });

  it('renders error and empty states', async () => {
    mockUseFoodAnalytics.mockReturnValueOnce({ isLoading: false, isError: true, data: undefined });
    const error = await render(<FoodAnalyticsScreen />);
    expect(error.getByText(/Couldn't load food analytics/i)).toBeTruthy();

    mockUseFoodAnalytics.mockReturnValueOnce({ isLoading: false, isError: false, data: { ...foodData, daily: [] } });
    const empty = await render(<FoodAnalyticsScreen />);
    expect(empty.getByText('Log a few meals to see food patterns.')).toBeTruthy();
  });

  it('distinguishes logged heatmap days from missing days and toggles 7/30 ranges', async () => {
    mockUseFoodAnalytics.mockReturnValue({ isLoading: false, isError: false, data: foodData });
    const screen = await render(<FoodAnalyticsScreen />);
    expect(screen.getAllByTestId(/food-heatmap-empty-/).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId(/food-heatmap-logged-/).length).toBe(1);

    fireEvent.press(screen.getByText('30d'));
    await waitFor(() =>
      expect(mockUseFoodAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ from: isoDaysAgo(30), to: isoDaysAgo(0) }))
    );
  });
});
