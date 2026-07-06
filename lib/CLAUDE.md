# lib/ — app-side clients & helpers

What belongs here: thin app-side glue (API client, supabase auth client, device helpers).
What does NOT: domain logic and contracts — those live in `packages/shared` (from NWE-110/112)
so the API can use them too. If a function is pure and both sides could need it, it goes to
shared, with unit tests.

## Files

- `supabase.ts` — Supabase client. **Auth only** (sign in/up, session persistence via
  AsyncStorage, token refresh). Exposes `isSupabaseConfigured` for the missing-env warning.
  Do not use it for data access in new code.
- `api.ts` — (NWE-114) the typed API client: wraps Hono RPC `hc<AppType>`, attaches the
  current session's JWT, unwraps the `{ data } / { error }` envelope, throws typed errors the
  error-banner layer (NWE-105) understands. **All data reads/writes go through this.**
- `types.ts`, `nutrition.ts` — domain types + nutrition math. ⚠️ Scheduled to MOVE to
  `packages/shared` in NWE-112; until then they are the source of truth — don't duplicate.
- `food-api.ts` — Open Food Facts search from the client. ⚠️ Legacy: NWE-114 moves this
  behind the API (`GET /foods/search`); delete the client-side version then.

## Rules

- Env vars: only `EXPO_PUBLIC_*` may be read here; fail loudly (console.warn + UI notice)
  when missing, never crash at import time.
- Keep this folder small — if it's growing, something probably belongs in `packages/shared`
  or in an API service instead.
