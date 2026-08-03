import { fireEvent, render } from '@testing-library/react-native';

import InsightsScreen from './insights';

const mockGenerate = jest.fn();
const mockGenerateCouncil = jest.fn();
const mockApplyCouncilProposal = jest.fn();
const mockPush = jest.fn();
const mockUseInsights = jest.fn();
const mockUseWeeklySummary = jest.fn();
const mockUseGenerateWeeklyInsight = jest.fn();
const mockUseGenerateCouncilInsight = jest.fn();
const mockUseApplyCouncilProposal = jest.fn();

jest.mock('@/lib/hooks', () => ({
  useInsights: () => mockUseInsights(),
  useWeeklySummary: () => mockUseWeeklySummary(),
  useGenerateWeeklyInsight: () => mockUseGenerateWeeklyInsight(),
  useGenerateCouncilInsight: () => mockUseGenerateCouncilInsight(),
  useApplyCouncilProposal: () => mockUseApplyCouncilProposal(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('InsightsScreen', () => {
  beforeEach(() => {
    mockGenerate.mockResolvedValue({});
    mockGenerateCouncil.mockResolvedValue({});
    mockApplyCouncilProposal.mockResolvedValue({});
    mockUseGenerateWeeklyInsight.mockReturnValue({ mutateAsync: mockGenerate, isPending: false, isError: false });
    mockUseGenerateCouncilInsight.mockReturnValue({ mutateAsync: mockGenerateCouncil, isPending: false, isError: false });
    mockUseApplyCouncilProposal.mockReturnValue({ mutateAsync: mockApplyCouncilProposal, isPending: false });
    mockUseWeeklySummary.mockReturnValue({
      data: { nutrition: { daysLogged: 3 }, training: { sessions: 2 } },
      isError: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('renders the weekly summary entry state and generates a review', async () => {
    mockUseInsights.mockReturnValue({ data: [], isRefetching: false, refetch: jest.fn() });
    const screen = await render(<InsightsScreen />);
    expect(screen.getByText('3 food days · 2 training sessions this week.')).toBeTruthy();
    fireEvent.press(screen.getByText('Generate review'));
    expect(mockGenerate).toHaveBeenCalledWith({});
  });

  it('renders existing weekly review content and past reviews', async () => {
    mockUseInsights.mockReturnValue({
      data: [
        {
          id: '1',
          kind: 'weekly',
          content: 'Steady week.\n\n- Keep protein steady.\n- Plan one workout.\n\nNice work.',
          week_start: '2026-07-06',
          created_at: '2026-07-11T00:00:00Z',
        },
      ],
      isRefetching: false,
      refetch: jest.fn(),
    });
    const screen = await render(<InsightsScreen />);
    expect(screen.getAllByText('Weekly review').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Steady week/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Keep protein steady.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Plan one workout.').length).toBeGreaterThan(0);
  });

  it('shows a friendly quota/error state when generation fails', async () => {
    mockUseGenerateWeeklyInsight.mockReturnValue({ mutateAsync: mockGenerate, isPending: false, isError: true });
    mockUseInsights.mockReturnValue({ data: [], isRefetching: false, refetch: jest.fn() });
    const screen = await render(<InsightsScreen />);
    expect(screen.getByText('Could not generate right now. Try again in a bit.')).toBeTruthy();
  });

  it('renders council proposal chips and applies target diffs with target lock', async () => {
    mockUseInsights.mockReturnValue({
      data: [
        {
          id: '1',
          kind: 'council',
          content: 'Coach council plan',
          week_start: '2026-07-06',
          created_at: '2026-07-11T00:00:00Z',
          payload: {
            plan: {
              headline: 'Steady week ahead',
              coaches: {
                goal: {
                  summary: 'Small calorie adjustment could help.',
                  proposals: [
                    {
                      type: 'target_diff',
                      target: 'calorie_target',
                      label: 'Calorie target',
                      current: 2150,
                      proposed: 2050,
                      unit: 'kcal',
                    },
                  ],
                },
                nutrition: { summary: 'Protein dipped on weekends.', proposals: [{ type: 'diet_suggestion', label: 'Protein anchor', detail: 'Keep one easy protein option ready.' }] },
                training: { summary: 'Volume is steady.', proposals: [{ type: 'training_focus', label: 'Lower focus', detail: 'Keep legs early in the week.' }] },
              },
              checkins: [{ detector: 'logging_lapse', message: 'Three days without logs. Today can be simple.' }],
            },
          },
        },
      ],
      isRefetching: false,
      refetch: jest.fn(),
    });
    const screen = await render(<InsightsScreen />);
    expect(screen.getByText('Goal coach')).toBeTruthy();
    expect(screen.getByText('Calorie target: 2150 → 2050 kcal')).toBeTruthy();
    fireEvent.press(screen.getByText('Apply'));
    expect(mockApplyCouncilProposal).toHaveBeenCalledWith({
      id: '1',
      input: {
        proposal: {
          type: 'target_diff',
          target: 'calorie_target',
          label: 'Calorie target',
          current: 2150,
          proposed: 2050,
          unit: 'kcal',
        },
      },
    });
  });
});
