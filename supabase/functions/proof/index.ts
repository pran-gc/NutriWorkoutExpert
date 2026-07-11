// NWE-110 scratch edge function: proves packages/shared executes under Deno.
// Deployed only to demonstrate the cross-runtime import; superseded by the real
// Hono API (NWE-113). Run locally: `supabase functions serve proof --no-verify-jwt`
// then `curl http://localhost:54321/functions/v1/proof`.
import { sharedGreeting } from '../_shared/index.ts';

Deno.serve(() => {
  return new Response(JSON.stringify({ message: sharedGreeting('Deno (edge function)') }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
