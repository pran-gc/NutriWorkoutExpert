import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProfileScreen from './profile';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const baseProfile = {
  id: 'profile-1',
  user_id: 'user-1',
  display_name: 'Test',
  sex: 'male',
  birth_year: 1994,
  height_cm: 180,
  activity_level: 'moderate',
  goal_type: 'maintain',
  target_weight_kg: 80,
  water_target_ml: 2000,
  calorie_target: 2400,
  protein_target_g: 144,
  carbs_target_g: 280,
  fat_target_g: 67,
  targets_locked: false,
};

let mockProfile = baseProfile;
jest.mock('@/components/SessionProvider', () => ({
  useSession: () => ({ profile: mockProfile, refreshProfile: jest.fn(async () => {}) }),
}));
jest.mock('@/lib/hooks', () => ({
  useLatestWeight: () => ({ latest: null }),
  useUpsertWeight: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateProfile: () => ({ mutateAsync: jest.fn(async (input) => ({ ...mockProfile, ...input })), isPending: false }),
  useExportData: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useChangePassword: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

describe('ProfileScreen target lock UI', () => {
  afterEach(() => {
    mockProfile = baseProfile;
    jest.clearAllMocks();
  });

  it('shows read-only auto targets with the Mifflin-St Jeor hint when unlocked', async () => {
    const screen = await render(<ProfileScreen />);
    expect(screen.getByText('Auto targets')).toBeTruthy();
    expect(screen.getByText('auto')).toBeTruthy();
    expect(screen.getByText('Auto · Mifflin-St Jeor')).toBeTruthy();
    expect(screen.getByDisplayValue('2400 kcal')).toBeTruthy();
    expect(screen.getByDisplayValue('144 g')).toBeTruthy();
  });

  it('toggles to editable custom target fields with the custom pill', async () => {
    const screen = await render(<ProfileScreen />);
    fireEvent.press(screen.getByLabelText('Target lock toggle'));
    await waitFor(() => expect(screen.getByText('Custom targets')).toBeTruthy());
    expect(screen.getByText('custom')).toBeTruthy();
    expect(screen.getByPlaceholderText('Calories')).toBeTruthy();
    expect(screen.getByPlaceholderText('Protein g')).toBeTruthy();
  });
});
