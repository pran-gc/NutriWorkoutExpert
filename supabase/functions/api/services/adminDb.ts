// Service-role Supabase client — the explicitly-named escape hatch (supabase/CLAUDE.md).
// Used ONLY where user-scoped RLS genuinely cannot work: deleting the auth user
// (NWE-117). Never exposed to routes that don't need it.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

let cached: SupabaseClient | null = null;

export function adminDb(): SupabaseClient {
  if (!cached) {
    cached = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
