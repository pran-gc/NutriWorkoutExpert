import { fireEvent, render, waitFor } from '@testing-library/react-native';

import MealPlanScreen from './meal-plan';

const mockGenerateMutate = jest.fn();
const mockRefineMutate = jest.fn();
const mockLogMealMutate = jest.fn();
const mockCreateRecipeMutate = jest.fn();

jest.mock('@/components/SessionProvider', () => ({
  useSession: () => ({
    profile: { calorie_target: 2200, protein_target_g: 160, carbs_target_g: 220, fat_target_g: 70 },
  }),
}));

jest.mock('@/lib/hooks', () => ({
  useGenerateMealPlan: () => ({ mutateAsync: mockGenerateMutate, isPending: false }),
  useRefineMealPlan: () => ({ mutateAsync: mockRefineMutate, isPending: false }),
  useLogPlannedMeal: () => ({ mutateAsync: mockLogMealMutate, isPending: false }),
  useCreateRecipe: () => ({ mutateAsync: mockCreateRecipeMutate, isPending: false }),
}));

const PLAN = {
  title: 'Tuesday training-day plan',
  meals: [
    {
      name: 'Chickpea bowl',
      meal_type: 'lunch',
      macros: { calories: 780, protein_g: 50, carbs_g: 95, fat_g: 20 },
      recipe: { ingredients: ['chickpeas', 'rice'], steps: ['cook'] },
    },
  ],
  notes: [],
};

describe('MealPlanScreen (NWE-121)', () => {
  afterEach(() => jest.clearAllMocks());

  it('generates a plan and shows meals + day totals against targets', async () => {
    mockGenerateMutate.mockResolvedValue({ plan: PLAN, insight_id: 'insight-1' });
    const screen = await render(<MealPlanScreen />);

    fireEvent.press(screen.getByText(/^Plan meals for/));
    await waitFor(() => expect(screen.getByText('Tuesday training-day plan')).toBeTruthy());

    expect(screen.getByText('Chickpea bowl', { exact: false })).toBeTruthy();
    expect(screen.getByText(/Day total: 780 kcal/)).toBeTruthy();
    expect(screen.getByText(/Target: 2200 kcal/)).toBeTruthy();
  });

  it('surfaces "Review changes" only after a refinement returns an updated plan', async () => {
    mockGenerateMutate.mockResolvedValue({ plan: PLAN, insight_id: 'insight-1' });
    const screen = await render(<MealPlanScreen />);
    fireEvent.press(screen.getByText(/^Plan meals for/));
    await waitFor(() => expect(screen.getByText('Tuesday training-day plan')).toBeTruthy());

    // Reply-only turn → no review button.
    mockRefineMutate.mockResolvedValueOnce({ reply: 'Chickpeas hit your fiber and protein.', updated_plan: null });
    const input = screen.getByPlaceholderText(/no dairy/i);
    fireEvent.changeText(input, 'why chickpeas?');
    // Concurrent render: wait until the controlled input reflects the value before send.
    await waitFor(() => expect(input.props.value).toBe('why chickpeas?'));
    fireEvent.press(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByText('Chickpeas hit your fiber and protein.')).toBeTruthy());
    expect(screen.queryByText('Review changes')).toBeNull();

    // Change turn → review button appears.
    const revised = { ...PLAN, title: 'Tuesday plan v2' };
    mockRefineMutate.mockResolvedValueOnce({ reply: 'Swapped for a higher-protein lunch.', updated_plan: revised });
    fireEvent.changeText(input, 'more protein');
    await waitFor(() => expect(input.props.value).toBe('more protein'));
    fireEvent.press(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByText('Review changes')).toBeTruthy());
  });

  it('"I had this" logs the meal via the log hook', async () => {
    mockGenerateMutate.mockResolvedValue({ plan: PLAN, insight_id: 'insight-1' });
    mockLogMealMutate.mockResolvedValue({ food_name: 'Chickpea bowl' });
    const screen = await render(<MealPlanScreen />);
    fireEvent.press(screen.getByText(/^Plan meals for/));
    await waitFor(() => expect(screen.getByText('Tuesday training-day plan')).toBeTruthy());

    fireEvent.press(screen.getByText('I had this'));
    await waitFor(() =>
      expect(mockLogMealMutate).toHaveBeenCalledWith(expect.objectContaining({ insight_id: 'insight-1', meal_index: 0 }))
    );
  });
});
