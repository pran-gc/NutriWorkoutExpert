# NutriWorkoutExpert — agent guide

Nutrition / workout / health-goal tracking mobile app with an AI insights layer.
Solo project; work is planned in **`TASKS.md`** (the backlog of record) and delegated
story-by-story to agent sessions.

> **Expo has changed** — read the versioned docs at https://docs.expo.dev/versions/v57.0.0/
> before writing Expo-touching code.

## Read this first

| Question | Answer lives in |
|---|---|
| What story am I building, with what acceptance criteria? | [TASKS.md](TASKS.md) |
| How does the system fit together? | [docs/architecture.md](docs/architecture.md) |
| What does each screen/flow do? | [docs/ui-flows.md](docs/ui-flows.md) |
| API conventions + endpoint catalog | [docs/api.md](docs/api.md) |
| Tables, RLS, migrations | [docs/data-model.md](docs/data-model.md) |
| How to test / TDD rules | [docs/testing.md](docs/testing.md) |
| AI pipeline + privacy constraints | [docs/ai.md](docs/ai.md) |

⚠️ **Current vs target state.** The codebase is currently the pre-M1 scaffold: screens query
Supabase directly, there is no API/tests/`packages/shared` yet. Stories NWE-110…116 build the
target architecture. Until NWE-114 lands, the direct-query pattern in existing screens is
*tolerated legacy*; **new work follows the target rules** and M2+ stories must not start
before M1. If any doc conflicts with TASKS.md, **TASKS.md wins**.

## Rules for agent sessions

1. Implement **exactly one story** per session unless told otherwise. Don't expand scope —
   log surprises under "Discovered work" at the bottom of TASKS.md instead of building them.
2. Follow the story's acceptance criteria + the Definition of Done in TASKS.md
   (migration → TDD'd endpoints → UI via typed client → tests → typecheck).
3. When done: set the story's checkbox (`[x]`, or `[~]` + note), list follow-ups discovered.
4. Never commit secrets. `.env` is gitignored; only `EXPO_PUBLIC_*` vars may reach the client.
   Gemini/service-role keys live ONLY in Edge Function secrets.
5. Update the relevant doc in `docs/` when a story changes architecture, endpoints, schema,
   or flows — docs that lie are worse than no docs.
6. Keep `AGENTS.md`/folder `CLAUDE.md` files accurate as structure evolves (NWE-116 does the
   big post-M1 rewrite with the user).

## Locked decisions (do not re-litigate; full rationale in TASKS.md)

- **Client**: Expo SDK 57 + expo-router + TypeScript. iOS first (`npx expo run:ios` on the
  user's Mac mini M4). **No Expo Go** — development builds only. Keep Android working.
- **Backend**: **Hono on Supabase Edge Functions**. The app NEVER queries the DB/PostgREST —
  all data goes through the API with the user's JWT. `supabase-js` in the app is for **auth
  only**.
- **Defense in depth**: API uses per-request user-JWT Supabase clients so RLS stays enforced;
  service-role only where genuinely required.
- **Shared code**: `packages/shared` = Zod contracts + domain types + pure logic, imported by
  app (Metro) and API (Deno). Contracts are defined once, there.
- **Testing**: full pyramid, TDD for domain/API logic (test-first), test-after allowed for UI
  components only. Maestro E2E on the Mac. See docs/testing.md.
- **AI**: free-tier Gemini via the API only. Aggregates in, text out; versioned prompts.
- **Photos: on-device only, never stored server-side** — "your photos are never stored" is a
  product promise. Ephemeral pass-through for opt-in AI analysis only.
- **Units**: metric (kg / cm / g / ml). Dates: `logged_on` = device-local `YYYY-MM-DD`.
- **v1.0 scope**: milestones M0–M9 in TASKS.md — the AI coaches (509/510/511) are the USP and
  ship in 1.0; only coach chat (505) is v1.1.
- **Gamification guardrail**: quests/badges/streaks reflect real logged actions computed
  server-side (never self-reported); copy never guilts or manufactures FOMO; rest days respected.
- **Notifications**: permission requested in-context (first enable), never at launch; user
  controls categories + quiet hours; local channel for reminders, Expo Push for server events.
- `app.json` web output stays `"single"` (static SSR breaks supabase-js under Node 20).

## Repo layout

```
app/                  expo-router screens — see app/CLAUDE.md
components/           shared UI + SessionProvider — see components/CLAUDE.md
lib/                  app-side clients & helpers — see lib/CLAUDE.md
supabase/             schema/migrations + Hono API — see supabase/CLAUDE.md
packages/shared/      (created by NWE-110) contracts + domain logic
docs/                 architecture & flow documentation (keep in sync!)
TASKS.md              backlog of record
.maestro/             (created by NWE-111) E2E flows
```

## Commands

```bash
npm start                 # Metro dev server (Expo)
npx tsc --noEmit          # typecheck — part of Definition of Done
npx expo run:ios          # dev build (Mac only)
supabase start            # local stack: Postgres + auth + functions (Docker; post NWE-110)
supabase functions serve  # run the Hono API locally        (post NWE-110)
npm run test / test:int   # unit / integration               (post NWE-111)
```

## Code conventions

- TypeScript strict; no `any` without a comment explaining why.
- Screens: `app/(tabs)/*.tsx` (expo-router file routing); auth in `app/(auth)/`;
  onboarding in `app/(onboarding)/` (NWE-104).
- Use `Text`/`View` from `@/components/Themed` (light/dark aware). Accent `#16a34a`,
  destructive `#dc2626`. Shared primitives (Card, ProgressBar, SectionTitle) from
  `@/components/ui`.
- Data access (target): TanStack Query + the typed API client in `lib/api.ts`. Query keys
  by resource + params, e.g. `['food-logs', date]`. (Legacy screens still use
  `supabase.from()` until NWE-114 — do not copy that pattern into new code.)
- Every user-facing surface needs empty + loading + error states (docs/ui-flows.md,
  "Cross-cutting UX rules").
- Migrations: new numbered file per change, RLS + indexes mandatory, never edit applied
  migrations (docs/data-model.md).
- API endpoints: Zod-validated with shared schemas, enveloped responses, thin routes
  (docs/api.md).
- Copy tone: encouraging, never guilt-tripping; AI prompts body-neutral, no medical claims.
- UI stories in TASKS.md include a **UI description** (layout, states, look); build to it and
  agree deviations with the user. Celebrations/animations go through the shared motion system
  (NWE-606: tokens, reduced-motion fallbacks, never block input).
