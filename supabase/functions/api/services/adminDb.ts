// Service-role Supabase client — the explicitly-named escape hatch (supabase/CLAUDE.md).
// Used ONLY where user-scoped RLS genuinely cannot work: deleting the auth user
// (NWE-117). Never exposed to routes that don't need it.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function adminDb(): SupabaseClient {
  if (!cached) {
    // Fail fast: an admin client built with empty URL/key would surface as
    // confusing auth/network errors deep in a request. Require both explicitly.
    const url = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceRoleKey) {
      throw new Error(
        'adminDb: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (service-role client).'
      );
    }
    cached = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
