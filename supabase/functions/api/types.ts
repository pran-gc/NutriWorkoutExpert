// Shared Hono context types for the API. The auth middleware injects `user` and
// a user-scoped Supabase `db` client; routes read them off `c.var`.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthedUser {
  id: string;
  email: string | null;
}

export type Variables = {
  user: AuthedUser;
  /** Supabase client created with the CALLER's JWT — RLS stays enforced (defense in depth). */
  db: SupabaseClient;
};

export type Env = { Variables: Variables };
