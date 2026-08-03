import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { supabase } from '@/lib/supabase';
import SignInScreen from './sign-in';

// RNTL 14 renders concurrently (React 19): render() is async. Note: an async
// SUBMIT (the happy path that awaits Supabase) wedges test-renderer@1.2.0 for
// later tests in the same file — a known bug in this RN 0.86/React 19 matrix —
// so that assertion lives in its own file (sign-in.submit.test.tsx) which gets a
// fresh renderer. Here we cover the synchronous behaviors.
describe('SignInScreen validation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('blocks submit and warns when email/password are empty', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText } = await render(<SignInScreen />);

    fireEvent.press(getByText('Sign in'));

    expect(alert).toHaveBeenCalledWith('Missing info', expect.stringContaining('email'));
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('toggles to sign-up mode', async () => {
    const { findByText } = await render(<SignInScreen />);
    fireEvent.press(await findByText(/Don't have an account/i));
    expect(await findByText('Create account')).toBeTruthy();
  });
});
