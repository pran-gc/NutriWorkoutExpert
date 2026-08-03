import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { supabase } from '@/lib/supabase';
import { SessionProvider, useSession } from './SessionProvider';

// A consumer that reveals whether the session is still loading — proving screens
// can gate on `loading` and never flash wrong content (NWE-101 AC#3).
function Probe() {
  const { loading, session } = useSession();
  if (loading) return <Text>LOADING</Text>;
  return <Text>{session ? 'SIGNED_IN' : 'SIGNED_OUT'}</Text>;
}

describe('SessionProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports loading until a delayed getSession resolves (no flash of wrong content)', async () => {
    // Hold getSession pending until we release it — deterministically proving the
    // provider shows loading first, never a flash of the signed-out state.
    let releaseSession!: (v: { data: { session: null } }) => void;
    (supabase.auth.getSession as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        releaseSession = resolve;
      })
    );

    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    // Before the session resolves, the consumer sees LOADING — not SIGNED_OUT.
    expect(screen.getByText('LOADING')).toBeTruthy();
    expect(screen.queryByText('SIGNED_OUT')).toBeNull();

    // Once it resolves, loading clears to the real (signed-out) state.
    releaseSession({ data: { session: null } });
    await waitFor(() => expect(screen.getByText('SIGNED_OUT')).toBeTruthy());
  });
});
