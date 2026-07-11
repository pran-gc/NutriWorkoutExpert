import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import OnboardingWizard from './index';

const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));
const replaceMock = mockRouter.replace;

// SessionProvider context — the wizard only reads refreshProfile.
jest.mock('@/components/SessionProvider', () => ({
  useSession: () => ({ refreshProfile: jest.fn(async () => {}) }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('OnboardingWizard', () => {
  afterEach(() => jest.clearAllMocks());

  it('starts on the welcome page with the privacy promise', async () => {
    const { getByText } = await render(wrap(<OnboardingWizard />));
    expect(getByText('Welcome to NutriWorkoutExpert')).toBeTruthy();
    expect(getByText(/photos are never stored/i)).toBeTruthy();
  });

  it('advances through pages via the footer button', async () => {
    const { getByText, findByText } = await render(wrap(<OnboardingWizard />));
    fireEvent.press(getByText('Get started'));
    expect(await findByText('About you')).toBeTruthy();
    fireEvent.press(getByText('Continue'));
    expect(await findByText('How active are you?')).toBeTruthy();
  });

  it('Skip jumps straight to the tabs', async () => {
    const { getByText } = await render(wrap(<OnboardingWizard />));
    fireEvent.press(getByText('Skip'));
    expect(replaceMock).toHaveBeenCalledWith('/(tabs)');
  });
});
