import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { supabase } from '@/lib/supabase';
import SignInScreen from './sign-in';

// Isolated in its own file: an async happy-path submit wedges test-renderer@1.2.0
// for subsequent tests in the same file (RN 0.86 / React 19 concurrent bug). One
// test per file sidesteps it while keeping the assertion real.
describe('SignInScreen submit', () => {
  it('calls Supabase sign-in with the entered credentials', async () => {
    const { getByText, getByPlaceholderText } = await render(<SignInScreen />);

    const email = getByPlaceholderText('Email');
    const password = getByPlaceholderText('Password');
    fireEvent.changeText(email, 'a@b.com');
    fireEvent.changeText(password, 'secret123');
    // Concurrent render: wait until the controlled inputs reflect the new values
    // before submitting, so submit() doesn't read stale (empty) state.
    await waitFor(() => {
      expect(email.props.value).toBe('a@b.com');
      expect(password.props.value).toBe('secret123');
    });

    fireEvent.press(getByText('Sign in'));

    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'secret123',
      })
    );
  });
});
