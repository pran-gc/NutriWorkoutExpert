# NutriWorkoutExpert

A mobile application that tracks nutrition, workouts, weight, and health goals, and uses that data to recommend improvements.

The project is built as a strictly layered, type-safe full stack: an Expo (React Native + TypeScript) client, a Hono API running on Supabase Edge Functions (Deno), and Postgres with row-level security. Domain logic and API contracts live in a shared package that is imported by both runtimes, which keeps the client and server contracts from drifting apart.

## Engineering highlights

- **A single, enforced boundary.** The application communicates only with the API and never queries the database directly. `supabase-js` on the client is used for authentication only, and a CI check (`npm run check:no-supabase-from`) fails the build if that rule is violated.
- **Cross-runtime shared code.** `packages/shared` (Zod contracts, pure domain logic, and nutrition math) is imported by the app through Metro (the `@shared` alias) and by the Deno API through a re-export shim, so the same validated contract runs on both sides.
- **Row-level security.** Postgres RLS enforces per-user data isolation at the database layer, not only at the API.
- **Typed and tested end to end.** Zod validates the API envelope, `tsc --noEmit` typechecks the codebase, and tests run with Jest (client) and `deno test` (API), alongside Maestro end-to-end flows.

## Technology

| Layer | Technology |
|-------|------------|
| Client | Expo Router, React Native 0.86, React 19, TypeScript |
| Server state | TanStack Query |
| API | Hono on Supabase Edge Functions (Deno) |
| Database | Postgres (Supabase) with row-level security |
| Shared | TypeScript and Zod contracts (`packages/shared`) |
| Authentication | Supabase Auth (client-side, authentication only) |
| Testing | Jest (client), deno test (API), Maestro (end-to-end) |

## Repository layout

```
app/                 Expo Router screens (Today, Food, Workouts, Profile)
components/          shared UI and SessionProvider (auth context)
lib/                 typed API client, TanStack Query hooks, supabase (auth only)
packages/shared/     Zod contracts, domain types, nutrition math; imported by app and API
supabase/
  migrations/        ordered SQL (0001_init.sql is the full schema)
  functions/api/     the Hono backend (middleware, routes, services)
docs/                design and engineering documentation
```

## Documentation

- [Architecture](docs/architecture.md)
- [API](docs/api.md)
- [Data model](docs/data-model.md)
- [Testing](docs/testing.md)
- [AI features](docs/ai.md)

## Getting started

Prerequisites: Node 22 or later, Docker Desktop, the Supabase CLI, and Deno (`brew install supabase/tap/supabase deno`). Xcode is required for iOS builds.

```bash
npm install                 # installs app and packages/shared (npm workspaces)
supabase start              # local Postgres, auth, and edge functions in Docker
npm start                   # Expo development server
```

Supabase keys are provided locally by `supabase status` and the local `.env`; none are committed to the repository.

## License

See [LICENSE](LICENSE).

Built by Pranav Gupta Chummun.
