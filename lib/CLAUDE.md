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
- `hooks.ts` — TanStack Query hooks (the app's data layer). Every read/write is a hook here
  over `api.ts`; screens never call the client directly. Query keys `[resource, ...params]`.
- `queryClient.ts` — the shared QueryClient: retry policy (network/5xx retry, 4xx surface) and
  the global error-banner wiring (NWE-105).
- `errorBanner.ts` — pub/sub store + error→message mapping feeding `components/ErrorBanner`.
- `photos.ts` — on-device photo helpers (wipe-on-delete now; NWE-204 builds the full util).
- Domain types + nutrition math + Zod contracts now live in **`packages/shared`** (imported as
  `@shared`), not here. `food-api.ts` was deleted — Open Food Facts is proxied by the API
  (`GET /foods/search`).

## Rules

- Env vars: only `EXPO_PUBLIC_*` may be read here; fail loudly (console.warn + UI notice)
  when missing, never crash at import time.
- Keep this folder small — if it's growing, something probably belongs in `packages/shared`
  or in an API service instead.
