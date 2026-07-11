import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';

import { rpc, unwrap } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@shared';

interface SessionContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load the profile through the API (GET /me) — the app never queries the DB
  // directly. SessionProvider stays auth-only otherwise (data lives in hooks).
  const loadProfile = async () => {
    try {
      const profile = await unwrap<Profile>(rpc.api.me.$get());
      setProfile(profile);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadProfile().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadProfile();
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (session) await loadProfile();
  };

  return (
    <SessionContext.Provider value={{ session, profile, loading, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}
