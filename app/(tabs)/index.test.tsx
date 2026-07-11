import { render, waitFor } from '@testing-library/react-native';

import DashboardScreen from './index';

const mockCelebrate = jest.fn(async (_kind: string) => ({ animated: true }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/components/SessionProvider', () => ({
  useSession: () => ({
    profile: {
      display_name: 'Test',
      calorie_target: 2200,
      protein_target_g: 150,
      carbs_target_g: 250,
      fat_target_g: 70,
      water_target_ml: 2200,
      target_weight_kg: 80,
    },
  }),
}));
jest.mock('@/components/analytics', () => ({
  MacroRings: () => null,
  LineChart: () => null,
}));
jest.mock('@/components/WaterCard', () => ({
  WaterCard: () => null,
}));
jest.mock('@/lib/celebrations', () => ({
  celebrate: (kind: string) => mockCelebrate(kind),
}));
jest.mock('@/lib/hooks', () => ({
  useDayTotals: () => ({ data: { calories: 1200, protein_g: 80, carbs_g: 130, fat_g: 40 }, isRefetching: false, refetch: jest.fn() }),
  useLatestWeight: () => ({ latest: null, refetch: jest.fn() }),
  useWeights: () => ({ data: [], refetch: jest.fn() }),
  useWorkouts: () => ({ data: [], isRefetching: false, refetch: jest.fn() }),
  useStreaks: () => ({ data: { food: { current: 7, longest: 12 } }, refetch: jest.fn() }),
  useQuests: () => ({
    data: [
      { id: 'food', title: 'Log food', target: 1, progress: 1, complete: true },
      { id: 'water', title: 'Drink water', target: 2200, progress: 800, complete: false },
    ],
    refetch: jest.fn(),
  }),
}));

describe('DashboardScreen gamification states', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders quest completion states and triggers the quest celebration path', async () => {
    const screen = await render(<DashboardScreen />);
    expect(screen.getByText('7 day food streak')).toBeTruthy();
    expect(screen.getByText('Done · Log food')).toBeTruthy();
    expect(screen.getByText('Next · Drink water')).toBeTruthy();
    await waitFor(() => expect(mockCelebrate).toHaveBeenCalledWith('quest'));
  });
});
