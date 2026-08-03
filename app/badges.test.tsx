import { render, waitFor } from '@testing-library/react-native';

import BadgesScreen from './badges';

const mockUseBadges = jest.fn();
const mockCelebrate = jest.fn(async (_kind: string) => ({ animated: true }));

jest.mock('@/lib/hooks', () => ({
  useBadges: () => mockUseBadges(),
}));
jest.mock('@/lib/celebrations', () => ({
  celebrate: (kind: string) => mockCelebrate(kind),
}));

describe('BadgesScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders earned, locked, and unseen badge states and celebrates unseen unlocks', async () => {
    mockUseBadges.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        catalog: [
          { id: 'first_meal', title: 'First meal', description: 'Logged a meal.' },
          { id: 'seven_day_streak', title: 'Seven steady days', description: 'Logged for seven days.' },
        ],
        earned: [
          {
            id: 'earned-1',
            user_id: 'user-1',
            badge_id: 'first_meal',
            earned_at: '2026-07-11T00:00:00Z',
            seen_at: null,
          },
        ],
      },
    });

    const screen = await render(<BadgesScreen />);
    expect(screen.getByText('Newly earned')).toBeTruthy();
    expect(screen.getByText('Locked')).toBeTruthy();
    await waitFor(() => expect(mockCelebrate).toHaveBeenCalledWith('badge'));
  });

  it('shows loading and error states', async () => {
    mockUseBadges.mockReturnValue({ isLoading: true, isError: false });
    const loading = await render(<BadgesScreen />);
    expect(loading.getByText('Loading badges…')).toBeTruthy();

    mockUseBadges.mockReturnValue({ isLoading: false, isError: true });
    const error = await render(<BadgesScreen />);
    expect(error.getByText('Could not load badges.')).toBeTruthy();
  });
});
