# NutriWorkoutExpert 🥗💪

A mobile app that tracks your nutrition, workouts, weight and health goals — and uses that data to propose improvements.

Built with **Expo (React Native + TypeScript)** on the client, a **Hono API on Supabase Edge Functions** (Deno) on the server, and **Postgres** with row-level security. Shared domain code (Zod contracts + pure logic) lives in `packages/shared` and is imported by both runtimes.

> **Architecture rule:** the app talks ONLY to the API — it never queries the database directly. `supabase-js` in the app is for **auth only**. A CI check (`npm run check:no-supabase-from`) enforces this.

## Repository layout

```
app/                     Expo Router screens (Today · Food · Workouts · Profile)
components/              shared UI + SessionProvider (auth context)
lib/                     app-side glue: api.ts (typed client), hooks.ts (TanStack Query),
                         queryClient.ts, errorBanner.ts, supabase.ts (auth only)
packages/shared/        cross-runtime code: Zod contracts, domain types, nutrition math,
                         API envelope. Imported by the app (Metro) AND the API (Deno).
supabase/
  migrations/           ordered SQL migrations (0001_init.sql = the full schema)
  functions/api/        the Hono backend (middleware · routes · services)
  functions/_shared/    Deno entry into packages/shared
  functions/proof/      NWE-110 cross-runtime demo function
.maestro/               E2E flows (Mac-only)
docs/                   architecture / api / data-model / testing / ai
TASKS.md                backlog of record
```

### Cross-runtime shared code (how it works)

`packages/shared` is plain TypeScript + Zod, imported two ways:

- **App (Metro):** via the `@shared` alias — configured in `tsconfig.json` (`paths`) and
  `metro.config.js` (`extraNodeModules` + `watchFolders`).
- **API (Deno):** via `supabase/functions/_shared/index.ts`, which re-exports the package by
  relative path. Supabase's edge bundler follows it when serving and deploying.

The same function runs in both runtimes — see `supabase/functions/proof/` and the
`sharedGreeting` call logged by the dashboard in dev.

## Clone & run on the Mac

Prerequisites: **Node 22+**, **Docker Desktop** (running), the **Supabase CLI**, and **Deno**
(`brew install supabase/tap/supabase deno`, or the standalone installers). For iOS builds, **Xcode**.

```bash
git clone <your-private-repo-url> NutriWorkoutExpert
cd NutriWorkoutExpert
npm install                       # installs app + packages/shared (npm workspaces)

# 1. Bring up the local backend (Postgres + auth + edge functions, in Docker)
supabase start                    # first run pulls images (~a few minutes)
supabase db reset                 # replay migrations from scratch

# 2. Point the app at the local stack
cp .env.example .env              # defaults already target http://127.0.0.1:54321
#   the publishable/anon key printed by `supabase start` goes in EXPO_PUBLIC_SUPABASE_ANON_KEY

# 3. Serve the API and start Metro (two terminals)
supabase functions serve          # the Hono API + proof function
npm start                         # Metro dev server
```

> After editing `.env`, restart Metro — Expo inlines `EXPO_PUBLIC_*` variables at build time.
> Only `EXPO_PUBLIC_*` vars reach the client; service/secret and Gemini keys live only in Edge
> Function secrets (`supabase secrets set`).

## iOS development build (`npx expo run:ios`)

This project uses **development builds** (not Expo Go — native modules require it). Runs on the Mac.

1. **Install Xcode** from the App Store, launch it once to accept the license, and install the
   iOS platform + Command Line Tools (`xcode-select --install`).
2. **First build** (slow — compiles native code):
   ```bash
   npx expo run:ios                       # default simulator
   npx expo run:ios --device              # pick a connected iPhone
   ```
3. **Simulator vs device:**
   - *Simulator* — no Apple account needed; fastest loop.
   - *Physical device* — needs code signing. A **free Apple ID** works for personal devices
     (7-day certs, re-sign weekly); a **paid Apple Developer account** ($99/yr) is required for
     TestFlight/App Store (NWE-802). On device, trust the developer cert under
     **Settings → General → VPN & Device Management** the first time.
4. **Fast iteration:** after the first native build, just run `npm start` (Metro). The dev
   build hot-reloads over Wi-Fi/USB — you rebuild natively only when native deps change.

### Known issues (iOS dev build)

- **Local-network permission prompt** on first launch — accept it, or Metro can't connect.
- **Device provisioning** with a free Apple ID expires every 7 days; re-run `npx expo run:ios`.
- **First build takes several minutes** (CocoaPods + native compile). Subsequent JS-only
  changes are instant via Metro.

## How we test / TDD workflow

Full pyramid; **domain and API logic are written test-first** (red → green → refactor).
UI components may be tested after. All commands:

| Level | Command | What |
|---|---|---|
| Unit (shared) | `npm run test:shared` | Vitest over `packages/shared` — nutrition math, envelope |
| Unit (app) | `npm test` | jest-expo + RN Testing Library — screen/behavior tests |
| Typecheck | `npm run typecheck` | app + shared boundary (`tsc --noEmit`) |
| DB-access guard | `npm run check:no-supabase-from` | fails if the app queries the DB directly |
| Integration (API) | `npm run test:api` | Deno tests: run the Hono app against the local stack |
| E2E | `maestro test .maestro/sign-in.yaml` | **Mac-only** — iOS simulator |

Integration/E2E need `supabase start` running. Example env for the API tests:

```bash
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="$(supabase status -o env | grep '^ANON_KEY' | cut -d'\"' -f2)"
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | grep '^SERVICE_ROLE_KEY' | cut -d'\"' -f2)"
npm run test:api
deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/api/rls.integration.test.ts
```

**CI** (`.github/workflows/ci.yml`): typecheck + unit + the DB-access guard on every push/PR;
integration against a Supabase CLI stack. E2E (Maestro) is run manually on the Mac — macOS CI
runners are costly, so they're kept out of the pipeline by decision.

## Environments, deploy & ops (NWE-115)

- **Local** — the CLI/Docker stack above, for development and tests. Never point tests at the
  hosted project.
- **Hosted** — the real app's Supabase project. `.github/workflows/deploy.yml` pushes
  migrations + deploys the `api` function on every push to `main` (fails loudly on error).
  Secrets required: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
- **Rollback** — revert the offending commit and let the deploy workflow re-run. Migrations are
  forward-only: to undo a schema change, add a NEW migration that reverses it (never edit an
  applied migration).
- **Backups** — the free tier has none, so `.github/workflows/backup.yml` runs a weekly
  `pg_dump` (Sundays) and keeps the dump as a 30-day artifact. Needs `SUPABASE_DB_URL`.
- **Free-tier pause** — projects idle for 7 days are paused; resume from the Supabase dashboard
  (data is retained).
- **Auth email** — signup confirmation + password reset are sent via **Emailit SMTP** from
  `no-reply@omupra.com`, deep-linking back to `nutriworkoutexpert://`. Setup (Emailit domain
  verification, Supabase SMTP + redirect URLs) is dashboard/DNS work — see
  [docs/auth-email-setup.md](docs/auth-email-setup.md).

## Documentation

- [TASKS.md](TASKS.md) — backlog of record
- [AGENTS.md](AGENTS.md) — guide for agent sessions
- [docs/architecture.md](docs/architecture.md) · [docs/api.md](docs/api.md) ·
  [docs/data-model.md](docs/data-model.md) · [docs/testing.md](docs/testing.md) ·
  [docs/ui-flows.md](docs/ui-flows.md) · [docs/ai.md](docs/ai.md)
