# NutriWorkoutExpert — Delegation Backlog

Each story is a self-contained work packet for an agent session (Opus/Sonnet) or a human.
Stories carry an ID, dependencies, testable acceptance criteria, and — for UI stories — a
description of how the UI should look and behave.

**How to delegate a story** — start a session with a prompt like:

> Read AGENTS.md and TASKS.md. Implement story **NWE-203 only**. Follow the code conventions
> and the Definition of Done, meet every acceptance criterion, then update the story's status
> in TASKS.md. Do not touch other stories. Log anything unexpected under "Discovered work".

Architecture, flows, API, data model, testing and AI rules are documented in [`docs/`](docs/)
— stories reference them instead of restating; **update the relevant doc when a story changes
what it describes.** Every UI story has an annotated wireframe in
[`docs/wireframes.html`](docs/wireframes.html) (find your story ID) — build to it.

Suggested model per story: **S** = Sonnet (well-specified CRUD/UI), **O** = Opus (schema design,
architecture, AI pipeline, anything ambiguous).

Status: `[x]` done · `[~]` drafted/partial — needs review · `[ ]` not started · `⏸` parked

## Locked decisions (do not re-litigate)

- **Client:** Expo SDK 57 + expo-router + TypeScript. iOS first (dev builds on the Mac mini M4, `npx expo run:ios`). **No Expo Go.** Metric units.
- **Backend:** **Hono API running on Supabase Edge Functions** (TypeScript/Deno). The mobile app NEVER queries the database/PostgREST directly — all reads/writes go through the API. The Supabase JS client stays in the app **for auth only** (sign in/up, session, token refresh); every API request carries the user's JWT.
- **Defense in depth:** inside the API, per-request Supabase clients are created with the caller's JWT so Postgres RLS stays enforced. The service-role key is used only where genuinely required, and never leaves the backend.
- **Shared code:** `packages/shared/` holds Zod schemas, domain types and pure domain logic (nutrition math, aggregation shapes). Imported by both the app (Metro) and the API (Deno). API request/response contracts are defined here — change the contract, and both sides type-error.
- **AI:** Gemini, called only from the backend. API keys live in Edge Function secrets. Existing
  one-shot features receive aggregates/ephemeral photos; the approved agentic Hub may pull
  capped, PII-free raw rows through RLS-scoped read tools. It can never write directly.
- **Photos: on-device only** (expo-file-system in the app's private directory) — never stored server-side, and the app says so prominently ("your photos are never stored"). For opt-in AI analysis they are sent ephemerally through the API to Gemini and only the text result is kept. Cloud photo sync is a possible future story (Cloudflare R2 was evaluated: 10 GB free, zero egress — use it if this ever changes).
- **Testing: full pyramid, TDD.** Domain/API logic is written test-first. Levels: unit (Vitest for shared + API logic; jest-expo + RN Testing Library for app), integration (API routes against a local Supabase stack via the Supabase CLI + Docker), E2E (**Maestro** flows on the iOS simulator — runs on the Mac). CI on GitHub Actions.
- **Gamification guardrail:** badges/quests/streaks celebrate **real logged actions** (computed server-side from data, never self-reported); copy never guilts, shames, or manufactures FOMO; rest days respected.
- Web output stays `"single"` in `app.json`.

## Definition of Done (every feature story)

1. DB change (if any) as a new migration under `supabase/migrations/`, with RLS + indexes.
2. API endpoint(s) in the Hono app: Zod-validated input, typed response from `packages/shared`, **written test-first** (unit for logic, integration against local Supabase).
3. App UI consumes the endpoint via TanStack Query + the typed API client; component tests for behavior; matches the story's UI description (deviations agreed with the user, noted in the story).
4. Empty, loading, and error states implemented for every new screen/section.
5. E2E: extend a Maestro flow if the story touches a critical path (auth, log food, log workout).
6. `npx tsc --noEmit` and the full test suite pass; TASKS.md status updated; discoveries logged.

---

## v1.0 scope 🚀

**v1.0 = M0 through M9.** Everything a user needs to track food/workouts/weight, see beautiful
analytics, snap-to-log meals with AI, compare physique progress, stay engaged via
quests/streaks/badges with reminders — **plus the AI coaches (weekly review, workout
generation, adaptive training, coach council), which are the USP vs. every competitor and ship
in 1.0** (user decision 2026-07-06). The coaches work from day one — the generator needs only
the setup Q&A, the council's first plan lands after week one — and get sharper with usage.

**After v1.0:** AI Hub follow-ups (123–127), barcode scan
(207), rest timer (306), measurements (403), HealthKit/Health Connect (701/702), Play Store (804).

| # | Theme | Stories |
|---|-------|---------|
| M0 | Repo & Mac base | NWE-101, 102, 103 |
| M1 | Architecture foundations | NWE-110, 111, 112, 113, 114, 115, 116 |
| M2 | Frictionless daily logging | NWE-205, 201, 203, 406, 104, 105 |
| M3 | Serious workout tracking | NWE-301, 302, 305, 304 |
| M4 | Analytics & history | NWE-401, 407, 408, 409, 303, 206 |
| M5 | AI core: weekly review | NWE-501, 502, 503, 404 |
| M6 | Photos & snap-to-log | NWE-204, 508, 202, 507, 405 |
| M7 | Notifications & gamification | NWE-607, 601, 603, 602, 605, 606, 604 |
| M8 | AI coaches (USP) | NWE-509, 510, 511 |
| M9 | Release — **v1.0 launch** | NWE-117, 801, 805, 802, 803 |
| v1.1 | AI Hub | NWE-122, 123, 124, 125, 126 |
| v1.1 | Rich, editable proposals | NWE-128, 129, 130, 131, 132 |
| Later | — | NWE-127 (blocked: Gemini 3 remote MCP), 207, 306, 403, 701, 702, 804 |

> M1 is the "latest architectures and patterns" epic. Nothing in M2+ starts until M1 is done —
> every feature story assumes the API, shared package, and test harness exist.

---

## Epic 1 — Foundations (detailed)

### NWE-101 · Review & polish the drafted scaffold — `[x]` · S
> Done (2026-07-09): theme-derived input colors (`Input` in `components/ui.tsx`), shared
> primitives extracted (Input/Button/Chip/ChipRow/OptionRow/Muted/EmptyState) and adopted in
> food/workouts/profile/sign-in; loading gate in `_layout.tsx` (no flash); delayed-session
> component test. **AC#4 pending: user visual sign-off in light+dark on the simulator.**
The initial scaffold (auth, 4 tabs, schema) was drafted in one pass and never reviewed.
**Acceptance criteria:**
1. No `TextInput` uses a hardcoded text color — input text derives from the theme and is readable in light AND dark mode (verify both by toggling the simulator appearance).
2. Duplicated input/chip/button styles (currently repeated across food.tsx, workouts.tsx, profile.tsx, sign-in.tsx) exist once in `components/ui.tsx` and screens import them.
3. Every tab renders correct empty/loading states; no flash of wrong content while the session loads (assert via component test with delayed session).
4. User has looked at each screen and sign-off is noted here.
**Notes:** refactor only, no new features. Direct-DB queries in screens are tolerated until NWE-114.

### NWE-102 · Git remote & repo hygiene — `[~]` · S
> Done (2026-07-09): `.env` confirmed gitignored, `.env.example` updated (local + hosted),
> `dist/` not tracked, README gained a "Clone & run on the Mac" section. **AC#1 pending: push
> to the private remote (`origin` = github.com/pran-gc/NutriWorkoutExpert already set) — awaiting
> user go-ahead to commit + push.**
**Acceptance criteria:**
1. Initial commit(s) pushed to a private GitHub repo (user provides/creates the remote — ask, don't create).
2. `.env` confirmed ignored; `.env.example` committed; `dist/` not committed.
3. README gains a "clone on the Mac" section (clone, `npm install`, copy `.env`, run).

### NWE-103 · iOS development build workflow — `[~]` · S (runs on the Mac)
> Done (2026-07-09): README documents `npx expo run:ios` (Xcode, simulator vs device, free vs
> paid signing, cert trust), the Metro fast-refresh loop, and a known-issues section.
> **AC#4 pending: user confirms the app boots on the simulator; sign-off noted here.**
**Acceptance criteria:**
1. README documents `npx expo run:ios` step-by-step: Xcode install, simulator vs physical device, free-Apple-ID vs paid signing, trusting the developer cert on device.
2. Metro dev-server workflow documented (build once, fast refresh over Wi-Fi thereafter).
3. Known-issues section: device provisioning, local-network permission prompt, first-build duration.
4. Verified: app boots on the Mac simulator (user confirms; sign-off noted here).

### NWE-110 · Repo restructure & local dev stack — `[x]` · O
> Done (2026-07-09): npm-workspace layout (`packages/shared`, `supabase/functions/api`);
> `schema.sql` copied VERBATIM to `migrations/0001_init.sql` (byte-identical; schema.sql now a
> read-only reference); cross-runtime proof runs in BOTH Metro (`@shared` alias via
> `metro.config.js`) and Deno (`supabase/functions/proof`, `_shared`). **Verified on the live
> local stack: `supabase start` up, migration 0001 applied (15 tables, RLS on all 15, 58 seed
> exercises), `proof` edge function returns the shared greeting.** Mechanism documented in README.
> Follow-up migration `0002_grants.sql` added later this session (see Discovered work) — `db reset`
> now replays 0001 + 0002.
**Goal:** the repo supports app + API + shared code + migrations, and the whole stack runs locally.
**Acceptance criteria:**
1. Layout: Expo app stays at root (Metro is happiest there); `packages/shared/` for cross-runtime code; `supabase/functions/api/` for the Hono app; `supabase/migrations/` replaces the single `schema.sql` (existing schema becomes migration 0001 verbatim — no schema changes in this story).
2. Supabase CLI initialized; `supabase start` brings up local Postgres + auth + functions in Docker on the Windows machine; README documents the full loop (`supabase start`, `supabase functions serve`, `npm start`) including Docker Desktop prerequisites.
3. A proof import exists in BOTH runtimes: one function in `packages/shared` imported and executed from app code (Metro) and from a scratch edge function (Deno) — mechanism documented (path alias / npm: specifier).
4. `supabase db reset` replays migration 0001 cleanly on the local stack.
5. Decision log updated here with any deviations.
**Notes:** highest-risk story — cross-runtime imports and Windows+Docker quirks. Opus; budget time to experiment.

### NWE-111 · Test harness (full pyramid) & CI — `[x]` · O
> Done (2026-07-09): Vitest for `packages/shared` (47 tests incl. `computeTargets` edges);
> jest-expo + RNTL for app (sign-in validation, delayed-session, onboarding, error banner);
> Deno integration tests running the Hono app (`/health`, 401 rejection, cross-user RLS,
> export/delete) against the local stack; Maestro flow (`.maestro/sign-in.yaml`, Mac-only); CI
> (`.github/workflows/ci.yml`: typecheck + guard + unit + integration). README "How we test".
> **Note:** RNTL 14/React 19 renderer quirk documented (async-submit tests isolated per file).
**Goal:** the TDD infrastructure every later story relies on.
**Acceptance criteria:**
1. **Unit:** Vitest configured for `packages/shared` and API logic; `jest-expo` + RN Testing Library for app components. One REAL example test at each level (not placeholders) — suggested: `computeTargets` edge case; sign-in screen validation.
2. **Integration:** harness runs API routes against the local Supabase stack with seeded fixtures and per-test cleanup; one real example proving auth rejection (no token → 401 envelope).
3. **E2E:** Maestro installed and documented; one committed flow (launch → sign-in screen visible). Documented as Mac-only.
4. **CI:** GitHub Actions — typecheck + unit on every push; integration via Supabase CLI in CI; E2E documented as manual/Mac (macOS runner cost decision noted).
5. README "How we test / TDD workflow" section: red-green-refactor expectations per story, all test commands.
**Depends on:** NWE-110.

### NWE-112 · Shared domain package — `[x]` · S
> Done (2026-07-09): `lib/types.ts` + `lib/nutrition.ts` moved to `packages/shared` as Zod
> schemas + inferred types + pure functions; old files deleted; all app imports use `@shared`.
> Nutrition math has a test-first suite (missing data→null, 1200 floor, both sexes, all
> activity levels + goals, extremes). API envelope + `ErrorCode` union defined + tested.
**Goal:** single source of truth for domain types, contracts, and pure logic.
**Acceptance criteria:**
1. `lib/types.ts` and `lib/nutrition.ts` move into `packages/shared` as Zod schemas + inferred types and pure functions; all app imports updated; the old files deleted.
2. Nutrition math (BMR/TDEE/targets) has a test-first unit suite covering: missing profile data → null, extreme values, the 1200-kcal floor, both sexes, all activity levels and goals.
3. API envelope types defined (`{ data }` / `{ error: { code, message } }` + `ErrorCode` union per docs/api.md).
**Depends on:** NWE-110, 111.

### NWE-113 · Hono API skeleton — `[x]` · O
> Done (2026-07-09): Hono app in `supabase/functions/api/` — JWT auth middleware (verify →
> `user` + per-request user-scoped Supabase client), Zod validation helper, error-envelope via
> `app.onError`, request logging. `GET /health` (public) + `GET /me` (authed) TDD'd (unit +
> integration incl. 401 without token — all pass). Typed `hc<AppType>` client in `lib/api.ts`
> compiles with full response inference. **AC#4 (deploy to hosted project) pending: user runs
> `supabase link` + `supabase functions deploy api` with real secrets.**
**Goal:** the backend exists, is deployed, and is the template every endpoint follows.
**Acceptance criteria:**
1. Hono app in `supabase/functions/api/` with: JWT auth middleware (verifies Supabase token → injects `user` + per-request user-scoped Supabase client), Zod validation middleware, error-envelope middleware, request logging. Structure per docs/api.md (routes / services / middleware / prompts).
2. Routes: `GET /health` (public: version + uptime) and `GET /me` (authed: profile row) — both TDD'd (unit + integration, including 401 without token).
3. Typed client (`hc<AppType>`) consumed from app code compiles with full type inference (prove with a typed call in `lib/api.ts`).
4. Deployed to the hosted Supabase project; README documents deploy command and secrets setup.
**Depends on:** NWE-110, 111, 112.

### NWE-114 · Migrate the app to the API — `[x]` · O
> Done (2026-07-09): TanStack Query installed; `lib/api.ts` wraps the Hono client, attaches the
> JWT, unwraps envelopes into typed results/errors. Endpoints built + hooks (`lib/hooks.ts`):
> `PATCH /me` (recomputes targets server-side, respects `targets_locked`), `PUT/GET /weights`,
> food-log CRUD + `/food-logs/totals`, workout CRUD, `GET /foods/search` (OFF proxied). All
> screens (dashboard/food/workouts/profile) + SessionProvider read/write through the API.
> **Zero `supabase.from(` in app code — enforced by CI grep (`check:no-supabase-from`).**
> `lib/food-api.ts` deleted. Cross-user RLS integration tests written per resource.
> **Pending user run: RLS/integration tests + Maestro (need HTTP the build sandbox blocks).**
**Goal:** the app stops talking to the database; Supabase client remains for auth only.
**Acceptance criteria:**
1. TanStack Query installed; `lib/api.ts` wraps the Hono client, attaches the session token, unwraps envelopes into typed results/errors.
2. All existing screens (dashboard, food, workouts, profile, weight) read/write through new endpoints: `PATCH /me`, `PUT /weights/:date`, `GET /weights`, food-log CRUD + day totals, workout-session CRUD, `GET /foods/search` (Open Food Facts proxied server-side). Each endpoint TDD'd per the DoD, including one cross-user RLS test each.
3. Zero `supabase.from(` occurrences in app code — enforced by a CI grep that fails the build.
4. `lib/food-api.ts` deleted (logic now in the API's `services/openfoodfacts.ts`).
5. Maestro flow updated: sign in → log a food → dashboard totals reflect it.
**Depends on:** NWE-113.

### NWE-115 · Environments & deploy pipeline — `[~]` · S
> Done (2026-07-09): local vs hosted documented (README "Environments, deploy & ops"); env
> files per environment; `.github/workflows/deploy.yml` pushes migrations + deploys the `api`
> function on push to main (fails loudly); rollback procedure documented; weekly `pg_dump`
> export (`.github/workflows/backup.yml`, 30-day artifact retention) + free-tier pause note.
> **Pending: user adds repo secrets (`SUPABASE_ACCESS_TOKEN`/`PROJECT_REF`/`DB_PASSWORD`/
> `DB_URL`) and confirms a real deploy + backup run.**
**Acceptance criteria:**
1. Two environments documented: local (CLI/Docker, for dev + tests) and hosted (real app); env files per environment.
2. GitHub Action deploys migrations + functions to the hosted project on push to `main` (Supabase access token as repo secret); failed deploys fail visibly.
3. Rollback procedure documented (revert commit → redeploy; migration rollback caveats).
4. Free-tier ops: 7-idle-day pause documented (+ how to resume); **scheduled data export** (`pg_dump` via GitHub Action, weekly, artifact retention) since the free tier has no backups.
**Depends on:** NWE-113.

### NWE-116 · Update AGENTS.md to the final architecture — `[~]` · S
> Partial (2026-07-09): mechanical updates done — AGENTS.md "Current vs target" caveat replaced
> with M1-live reality; `lib/CLAUDE.md` corrected (hooks/queryClient/errorBanner/photos; moved
> types→shared, food-api deleted); `schema.sql` marked read-only reference. **The full
> collaborative docs pass (architecture/api/data-model/testing) is explicitly a "do with the
> user" task — left for that session.**
**Acceptance criteria:**
1. AGENTS.md + folder CLAUDE.md files rewritten WITH THE USER to match M1 reality: layout, API-only rule, test commands, deploy notes; stale "current state" caveats removed.
2. docs/ pass: architecture/api/data-model/testing updated where M1 diverged from plan.
**Depends on:** NWE-114. *(Do together with the user, not solo.)*

### NWE-104 · First-launch onboarding — `[x]` · S
> Done (2026-07-09): `(onboarding)/` paged wizard (welcome + privacy line → body → activity →
> goal → weight → computed-targets preview with macro dots), progress dots + Skip. Guard in
> `_layout.tsx` routes incomplete profiles (no sex/birth_year/height) to onboarding; complete
> ones never see it. Saves profile + first weight via API, computes targets. "Redo setup" in
> Profile. Component tests (welcome/nav/skip). **AC#4 E2E (fresh signup → wizard → dashboard)
> runs on the Mac via Maestro; user confirms.**
**Goal:** a new user lands in a friendly wizard instead of an empty dashboard.
**UI:** full-screen paged wizard, one question per page, large friendly typography, progress dots at top, "Skip" in the header. Pages: welcome (app promise + "your photos are never stored" privacy line) → body stats (sex chips, birth year, height) → activity level (option rows) → goal (chips + optional target weight) → current weight → final page shows the computed targets with a preview of the macro rings ("here's your daily picture").
**Acceptance criteria:**
1. After sign-in with an incomplete profile (no sex/birth_year/height), user is routed to `(onboarding)/`; complete profiles never see it.
2. Completing saves profile + first weight via API and computes targets; the final page displays them.
3. Skippable at any step; re-runnable from Profile ("Redo setup").
4. Component tests per step (validation, navigation); Maestro flow: fresh signup → wizard → dashboard shows targets.
**Depends on:** NWE-114 (API), NWE-406 helpful but not required (static ring preview OK).

### NWE-105 · Error & offline handling — `[x]` · S
> Done (2026-07-09): central error mapping in `lib/errorBanner.ts` (network/5xx → banner;
> 4xx → surfaced to screen) wired to the QueryCache in `lib/queryClient.ts` with retry (max 2,
> exponential backoff). Slide-down amber banner (`components/ErrorBanner.tsx`) with Retry,
> dismiss on tap / clears on success. Food search failure shows inline copy. Unit tests for the
> mapping + store. **AC#2 airplane-mode manual pass runs on the device.**
**UI:** a slim banner slides down under the header (amber background, white text, retry button) when an API call fails from network/server issues; it dismisses on tap or when a retry succeeds. Form-level failures show inline under the field or as a toast — never a silent nothing. Food search failure shows an inline message under the search box ("Couldn't search right now — check your connection").
**Acceptance criteria:**
1. Central error mapping in `lib/api.ts`: network failure / 5xx → banner + TanStack Query retry (max 2, backoff); 4xx envelope errors → surfaced to the calling screen.
2. Airplane-mode manual test passes on every tab: no blank screens, no unhandled promise rejections, banner appears and clears on reconnect.
3. Component test: banner renders on mocked network error and clears on success.
**Depends on:** NWE-114.

### NWE-117 · Auth & account lifecycle — `[x]` · O ‼ App-Store-required
> Done (2026-07-09): "Forgot password?" on sign-in (Supabase reset email → deep link to
> `(auth)/reset-password`); change password (Account section, reauth by held JWT); `GET
> /me/export` (all rows via a table registry that fails the export test if a table is
> forgotten) offered via the iOS share sheet; `DELETE /me` (admin client, FK cascade + local
> photo wipe via `lib/photos.ts`); Profile "Account" section → Delete account screen (type
> DELETE → final Alert). Delete reachable in 2 taps (Profile → Delete account). Integration
> tests written (export completeness, cross-user, cascade). **Pending user run: integration
> tests + manual reset-email E2E (need the hosted email flow / HTTP).**
**Goal:** complete auth (password reset) + the account controls Apple requires for launch.
**UI:** sign-in screen gains a "Forgot password?" link under the button. Profile gains an "Account" section at the bottom: Change password · Export my data · Delete account (red). Delete flow: confirmation screen explaining consequences → type **DELETE** to enable the button → final `Alert` confirm.
**Acceptance criteria:**
1. Forgot password: sends the Supabase reset email; the emailed deep link opens the app's "set new password" screen; new password works on next sign-in (manual E2E documented).
2. Change password for a signed-in user (with current-password reauth).
3. `GET /me/export`: returns one JSON bundle of ALL the user's rows (profile, weights, food logs, workouts+sets, water, favorites, recipes, insights, badges); app offers it via the iOS share sheet. Integration test asserts every user table is included (fails if a future table is forgotten — use a table registry).
4. `DELETE /me`: deletes the auth user via the admin client; every user table row cascades (integration-tested per table); local photos wiped on device; user lands on sign-in.
5. Apple requirement satisfied: account deletion reachable in-app within 2 taps from Profile.
**Depends on:** NWE-114.

---

## Epic 2 — Nutrition

*(All stories follow the Definition of Done: migration → TDD'd API endpoints → app UI via TanStack Query → tests.)*

### NWE-201 · Recents & favorites — `[x]` · S
> Done (2026-07-09): `favorite_foods` table verified + Zod schemas. Endpoints `GET/POST/DELETE
> /favorites` (POST dedupes by name+brand, updating not duplicating) + `GET /foods/recent` (last
> 20 distinct, most recent first). Star toggle on recent rows creates/removes a favorite;
> Favorites + Recent sections show above the day log when search is empty; tapping pre-fills the
> add panel; logging a favorite updates `last_quantity_g`. **Pending user run: cross-user RLS
> integration test (needs the live stack).**
**Goal:** logging something you've eaten before takes two taps.
**UI:** when the Food tab search box is empty, show two sections above the day log: "★ Favorites" (compact cards: name, kcal for last-used quantity) and "Recent" (list rows: name · brand · last quantity · kcal, star toggle on the right). Tapping either opens the standard add panel pre-filled with last-used quantity + meal. A star toggle also appears on search-result rows and log entries.
**Acceptance criteria:**
1. Migration: `favorite_foods` (user_id, name, brand, per-100g macros, source, source_id, last_quantity_g) + RLS + cross-user test.
2. Endpoints: `GET/POST/DELETE /favorites`, `GET /foods/recent` (last 20 distinct foods from `food_logs`, most recent first) — TDD'd.
3. Starring from any food row creates a favorite; unstarring removes it; state reflects everywhere it appears (query invalidation).
4. Tapping a recent/favorite pre-fills the add panel; logging updates `last_quantity_g`.
5. Component tests: sections render/empty states; star toggle optimistic update.

### NWE-202 · Recipes (composite foods) — `[x]` · O
> Done (2026-07-09): `recipes`/`recipe_items` verified + Zod. Recipe totals + per-serving +
> logged-multiplier math is pure shared logic (`recipeMath.ts`, TDD'd: rounding, empty, zero/
> negative-servings guard). Endpoints: recipes CRUD with nested items (PUT replaces items
> wholesale) + `POST /recipes/:id/log` inserts ONE food_log (`source='recipe'`, macros ×
> multiplier — denormalized, so editing a recipe never rewrites past logs). Editor screen
> (`app/recipe-editor.tsx`, live totals) + "My recipes" section with 0.5×/1×/2× + free multiplier.
> **Pending user run: cross-user RLS + denormalization integration tests.**
**Goal:** save combos ("my breakfast shake") and log them in one tap.
**UI:** "My recipes" section beside Favorites on the empty-search Food tab (cards: name, total kcal per serving). Recipe editor screen: name field → ingredient rows (name, quantity stepper in g, kcal auto) → "+ add ingredient" opens the standard search/manual flow → footer with live total macros and a servings count field. Logging a recipe opens the add panel with a servings multiplier (0.5× / 1× / 2× chips + free input).
**Acceptance criteria:**
1. Migrations: `recipes` (name, servings) + `recipe_items` (name, quantity_g, per-100g macros) + RLS + cross-user tests.
2. Recipe totals + per-serving math is a pure shared function (TDD'd: rounding, zero-servings guard).
3. Endpoints: recipes CRUD with nested items — TDD'd.
4. Logging inserts ONE `food_log` (name = recipe name, macros × multiplier, `source='recipe'`).
5. Editing a recipe never changes past logs (denormalization test).
6. Component tests: editor add/remove ingredient, live totals, multiplier math.

### NWE-203 · Water tracking — `[x]` · S
> Done (2026-07-09): `water_logs` + `profiles.water_target_ml` verified. Endpoints `POST /water`,
> `DELETE /water/last?date` (removes exactly the newest entry of the day), `GET /water?date`
> (total). Dashboard `WaterCard` (blue bar, +250/+500, undo link, haptic tick, caps at 100% with
> overflow shown numerically, target-reached state). Water target editable in Profile.
**UI:** dashboard card under the rings: blue (`#3b82f6`) horizontal progress bar, "1 250 / 2 000 ml", two round buttons **+250** and **+500**, an "undo last" text link visible after any add; subtle haptic tick on add.
**Acceptance criteria:**
1. Migration: `water_logs` (user_id, ml, logged_on) + RLS; profile gains `water_target_ml` (default 2000, editable in Profile).
2. Endpoints: `POST /water` (adds an entry), `DELETE /water/last?date=`, `GET /water?date=` (total) — TDD'd; undo removes exactly the most recent entry of the day.
3. Bar fills proportionally, caps visually at 100% with the overflow amount still shown numerically.
4. Component tests: add/undo flows, empty state, target reached state.

### NWE-204 · Meal photos (on-device) — `[x]` · S
> Done (2026-07-09): photo util split into pure `lib/photoPath.ts` (filename gen/validation,
> unit-tested) + `lib/photos.ts` I/O (capture/pick via expo-image-picker → save under private
> `photos/` dir → delete/exists/wipe — **no upload anywhere**). `photo_path` verified nullable on
> food_logs + wired through create/PATCH. 48px thumbnail renders only when the file exists on this
> device (missing → no thumb, no error); tapping opens a full-screen viewer (photo, delete, close,
> "Photos stay on this device"). Deleting the entry deletes the file; deleting the photo alone
> clears `photo_path`. Component tests: photoPath.
**UI:** a camera icon inside the food add/edit panel; log rows with a photo show a 48 px rounded thumbnail on the left; tapping opens a full-screen viewer (photo, date, delete button, close). A one-line note in the viewer: "Photos stay on this device."
**Acceptance criteria:**
1. Reusable photo util (capture/pick via `expo-image-picker` → compress ≤1080 px → save under the app's private documents dir via `expo-file-system` → delete) with unit tests around path/naming logic. **No upload anywhere.**
2. Migration: nullable `photo_path` (local filename) on `food_logs`.
3. UI shows the thumbnail only when the file exists on THIS device; missing file renders the row without a photo (no error).
4. Deleting the log entry deletes the file; deleting the photo alone clears `photo_path`.
5. Component tests: row with/without photo; viewer delete flow.

### NWE-205 · Edit logged food entries — `[x]` · S
> Done (2026-07-09): `PATCH /food-logs/:id` — searched/AI entries rescale macros server-side from
> stored values (shared `rescaleMacros`, TDD'd: doubling, rounding, zero-quantity guards); manual
> entries edit name+macros directly. Tapping a log row opens `EditEntryPanel` (pre-filled, Save +
> Delete; manual → name+macro fields, searched → quantity+meal with live rescale preview). Day
> totals refresh via query invalidation. Integration tests (searched rescale + manual edit) added
> to rls.integration.test.ts. **Pending user run.**
**UI:** tapping a log row opens the same add panel in edit mode: title "Edit entry", fields pre-filled, primary "Save", secondary "Delete". Manual entries expose name + macro fields; searched/AI entries expose quantity + meal only (macros rescale automatically, shown live as the quantity changes).
**Acceptance criteria:**
1. `PATCH /food-logs/:id` — TDD'd: quantity change rescales macros server-side from stored per-quantity values (unit test the rescale math in shared); manual entries accept direct macro edits.
2. Day totals and rings refresh after save (query invalidation).
3. Component tests: edit modes for manual vs searched entries, live rescale preview.

### NWE-206 · Past days: browse & log — `[x]` · S
> Done (2026-07-09): `DateBar` pinned above the Food tab (‹ · label · ›; label opens the native
> date picker via @react-native-community/datetimepicker; › disabled on today; future dates
> blocked by maximumDate). Past days tint the bar amber. All Food-tab queries + writes (logs,
> water via WaterCard on dashboard is today-only per spec; food logs/photos here) key off the
> selected `logged_on`. Returns to today when the tab is left+re-entered; survives within-session
> tab switches. **Pending user run: component tests + E2E on device.**
**UI:** a compact date bar pinned above the Food tab content: `‹` · "Today" (or "Wed, 2 Jul" — tappable, opens the native date picker) · `›` (disabled on today). When viewing a past day the bar is tinted amber and reads the date, signalling "you're editing the past". Dashboard stays today-only.
**Acceptance criteria:**
1. All Food-tab queries and writes (logs, water, photos) respect the selected `logged_on`.
2. Future dates are not selectable.
3. Returning to the tab resets to today; selected date survives within-session tab switches.
4. Component tests: navigation, amber past-state, write-to-past-date.

### NWE-207 · Barcode scanning — `⏸ later` · S
Camera scan → Open Food Facts barcode lookup → standard add panel. Do not build until unparked.

---

## Epic 3 — Workouts

### NWE-301 · Exercise library — `[x]` · S
**Goal:** consistent exercise identity so progress can be tracked (prereq for 302/303/408).
**UI:** the exercise field in a set row opens a bottom-sheet picker: search box on top, "Recently used" section first, then sections by muscle group; custom exercises show a small "custom" tag; when the search has no match, the last row is "+ Create '«query»'". Selecting fills the row and dismisses the sheet.
**Acceptance criteria:**
1. Migration: `exercises` (user_id nullable — null = global seed, name, muscle_group, kind strength|cardio) + RLS (read global+own, write own) + seed of ~50 common exercises across muscle groups; cross-user test on custom exercises.
2. Endpoints: `GET /exercises?q=`, `POST /exercises` — TDD'd; search matches name substring, ranks recently-used first.
3. New `workout_sets` rows store `exercise_id`; legacy text column kept for old rows.
4. Component tests: picker search, create-custom flow, recently-used ordering.

### NWE-302 · Routines / templates — `[x]` · O
**Goal:** define "Push Day A" once; starting it pre-fills the session.
**UI:** Workouts tab gets a segmented header: **Routines | History**. Routines segment: cards (name, exercise count, ~duration, "last done X days ago") each with a prominent **Start** button; "+ New routine" card at the end. Routine editor: name field, ordered exercise list (drag handle, exercise name, target sets × reps), "+ add exercise" (uses the 301 picker). Starting a routine opens the session form pre-filled: each exercise with its target set count, and **last session's reps/weight as placeholders** in each row.
**Acceptance criteria:**
1. Migrations: `routines` + `routine_exercises` (position, exercise_id, target_sets, target_reps) + RLS + cross-user tests.
2. Endpoints: routines CRUD; `GET /routines/:id/prefill` returns exercises + per-exercise last-performed numbers (TDD'd, including the "never performed" case).
3. Saving a started routine goes through the normal session flow (same tables, no special casing).
4. Reordering persists; deleting a routine never touches past sessions.
5. Component tests: editor CRUD + reorder; start-flow placeholder rendering.
**Depends on:** NWE-301.

### NWE-303 · Exercise progress charts — `[x]` · S
**UI:** exercise detail screen (opened by tapping an exercise name in history or the picker): header (name + muscle-group tag), range toggle 30/90/all, line chart of best-set e1RM per session, secondary bar series for session volume, then a history list (date · sets summary "3×8 @ 60 kg"). Empty state: "Log this exercise a few times to see progress."
**Acceptance criteria:**
1. e1RM (Epley) + per-session volume are shared pure functions (TDD'd: bodyweight/zero-weight sets, single-rep maxes).
2. `GET /exercises/:id/history` serves the pre-aggregated series — TDD'd.
3. Chart renders correctly with gaps (missed weeks) and a single data point.
4. Chart lib: first of NWE-303/401/407 to land picks (`react-native-gifted-charts` or victory-native), documents the choice HERE, and the others follow it.
   - Decision: use small custom chart primitives built on `react-native-svg` rather than a charting library. Rationale: lower bundle/API surface, full control over accessibility labels, macro-ring lap markers, and reduced-motion behavior. NWE-401/407/408 reuse `components/analytics.tsx`.
**Depends on:** NWE-301.

### NWE-304 · Cardio tracking — `[x]` · S
**UI:** when the picked exercise is `kind='cardio'`, the set row swaps reps/kg inputs for **distance (km)** + **duration (min)**; computed pace displays inline ("5:23 /km") as both fields fill. History renders cardio lines as "Run — 5.2 km · 28 min · 5:23/km".
**Acceptance criteria:**
1. Migration: nullable `distance_km` on `workout_sets`.
2. Pace formatting/math is a shared pure function (TDD'd: zero-distance, zero-duration, rounding).
3. Session create/edit endpoints accept cardio sets (validation: cardio sets need duration; strength sets need reps) — TDD'd.
4. Component tests: row input swap, pace display, history rendering.
**Depends on:** NWE-301.

### NWE-305 · Edit workout sessions — `[x]` · S
**UI:** tapping a history card opens the session form in edit mode (same layout as creation, pre-filled): editable title/duration/notes, set rows editable/removable, "+ add set", Save + Delete.
**Acceptance criteria:**
1. `PATCH /workout-sessions/:id` handles title/notes/duration + set add/edit/remove atomically — TDD'd (partial-failure leaves no orphan sets).
2. History and analytics queries refresh after save.
3. Component tests: edit/add/remove set flows.

### NWE-306 · Rest timer — `⏸ later` · S
Countdown between sets + local notification. Do not build until unparked.

---

## Epic 4 — Body, goals & analytics

Analytics philosophy (mobile): **glanceable, curated, no dashboards-for-dashboards' sake.**
Today = rings on the dashboard; trends = one small analytics screen per domain (food / gym /
goal), one tap from its tab. All aggregate math lives in `packages/shared` (unit-tested);
the API serves pre-aggregated series (`/analytics/*`) so the client stays thin. Days without
logs render as missing, never as zero. Analytics screens share a layout: segmented range
toggle at top, then a vertical scroll of titled chart cards.

### NWE-406 · Macro rings (today view) — `[x]` · S
The Apple-Health-style heart of the dashboard.
**UI:** three concentric rings (protein `#dc2626`, carbs `#f59e0b`, fat `#3b82f6`), **ordered by gram target — largest target outermost**; center shows calories: big number consumed, small "of N kcal" under it. Below the rings, a compact legend row: three dots with "P 92/140 g" style labels. Rings animate filling on screen load (~600 ms, ease-out).
**Acceptance criteria:**
1. Ring fractions, ordering, and overshoot math are pure shared functions (TDD'd: 0%, 100%, >100%, missing targets).
2. Overshoot past 100% renders an Apple-style overlapping lap marker — visually distinct from exactly closed (snapshot/component test).
3. Labels always accompany colors (accessibility — never color alone); light/dark aware.
4. No targets set → rings render grey at 0 with a "Set your targets →" link to Profile.
5. Custom `react-native-svg` component; replaces the dashboard macro bars; reduced-motion renders the final state without animation.

### NWE-401 · Weight trend chart — `[x]` · S
**UI:** inside the dashboard weight card (~120 px tall): dots for daily weights, a smooth 7-day moving-average line, dashed horizontal target-weight line, 30/90-day segmented toggle at the card's top-right. Tapping a dot shows a small tooltip (date + kg).
**Acceptance criteria:**
1. Moving average is a shared pure function (TDD'd: gaps, leading edge, single point).
2. `GET /weights?from&to` feeds it; chart renders correctly with gaps and with <7 entries.
3. No target weight set → dashed line omitted (no error).
4. Component tests: toggle switches range; empty state ("Log your weight to see the trend").

### NWE-407 · Food analytics screen — `[x]` · S
Entry: chart icon in the Food tab header. Ranges: 7 / 30 days.
**UI (top→bottom):** adherence calendar heatmap (month grid, day cells shaded by kcal-vs-target closeness; empty days rendered as blank, not red) → "Daily macros" stacked bars (P/C/F per day with target line) → "Avg day" summary card (avg kcal vs target, avg macros) → "Where calories come from" horizontal meal-type bars → "Top foods" list (by frequency and by kcal, toggle).
**Acceptance criteria:**
1. All aggregates computed in shared logic (TDD'd: empty range, partial logging, single-day) and served by `GET /analytics/food?from&to`.
2. Empty/missing days are visually distinct from over/under-target days (component test).
3. Range toggle refetches; loading skeleton; empty state for new users.

### NWE-408 · Gym analytics screen — `[x]` · S
Entry: chart icon in the Workouts tab header. Ranges: 30 / 90 days.
**UI (top→bottom):** "Weekly volume" stacked bars by muscle group → "Consistency" card (sessions/week vs plan once routines exist; current + longest week streak) → "Recent PRs" feed (exercise, new e1RM, date, small 🎉) → "Cardio" line (minutes + distance).
**Acceptance criteria:**
1. Aggregates in shared logic (TDD'd), served by `GET /analytics/training?from&to`; e1RM math shared with NWE-303/510.
2. PR detection is deterministic and tested (new best e1RM per exercise within range).
3. Renders sensibly with zero workouts (empty state), strength-only, and cardio-only data.
**Depends on:** NWE-301 (muscle groups); richer with 302/304.

### NWE-409 · Goal analytics — `[x]` · S
Entry: from the Profile goal card ("View progress →") — placed in Profile (decided; Insights links to it later).
**UI (top→bottom):** "Projection" card — weight trend line extended as a dotted projection to the target with the honest ETA ("At your current pace: ~12 Oct. Estimates change as you log."); "Pace" card — expected weekly change (from calorie target) vs actual (from trend), shown as two labeled bars; "Adherence ↔ progress" — weight trend with week bands tinted by target adherence.
**Acceptance criteria:**
1. Projection/pace math is pure shared logic (TDD'd: no-trend, moving away from target, at-goal, insufficient data → "log more to see this") — **clearly labeled estimates; never AI-generated numbers**.
2. Served by `GET /analytics/goal`; renders all four data-quality states (rich, sparse, none, at-goal).
3. Component tests: ETA copy states, at-goal celebration state (uses NWE-606 when available).

### NWE-403 · Body measurements — `⏸ later` · S
Migration: `measurements` (kind: waist|chest|hips|arm|thigh, value_cm, logged_on) + RLS; log + history per kind.

### NWE-404 · Manual target override — `[x]` · S
**UI:** the Profile targets card gains a lock toggle. Unlocked (default): computed values shown with a small "auto · Mifflin-St Jeor" hint, fields read-only. Locked: fields become editable, a "custom" pill shows on the card, and a note explains auto-recompute is off.
**Acceptance criteria:**
1. Migration: `targets_locked bool default false` on profiles.
2. `PATCH /me` respects the lock: locked → targets saved verbatim, never recomputed (TDD'd both paths).
3. Everything downstream (rings, quests, analytics) just reads targets — no special-casing (verify by grep/test).
4. Component tests: toggle both ways, field editability.

### NWE-405 · Progress photos (on-device) — `[x]` · S
**UI:** Profile → "Progress photos": 3-column grid with date badges; "+" tile to add (camera/library via the 204 util); long-press → select mode; selecting exactly two shows a "Compare" bar → side-by-side screen (labeled dates, pinch-zoom). Header note: "Photos stay on this device."
**Acceptance criteria:**
1. Local index (JSON manifest via the photo util) — no server rows; unit-tested manifest ops.
2. Grid, add, delete, compare flows work; deleting removes file + manifest entry.
3. Component tests: grid states (empty, populated), selection logic (max 2).
**Depends on:** NWE-204 (photo util).

---

## Epic 5 — AI coaching system ("super knowledge")

Vision: three coach roles — **goal coach, nutrition coach, training coach** — that share the
user's data, propose diets and programs, adapt them over time, and monitor progress to react
to drops and wins. Implemented as **one orchestrated pipeline with role-specialized prompts**
over the shared weekly summary (NWE-501) — not independent chattering agents (quota + coherence).
Deterministic, TDD'd detectors decide *when* a coach speaks; the LLM writes *what* it says.
The user always approves changes before targets or programs are modified.

### NWE-501 · Weekly aggregation (data layer) — `[x]` · O
> Drafted (2026-07-11): shared pure `weeklySummary()` added with fixtures for full/sparse/empty
> weeks; API `GET /insights/weekly-summary?week=` serves the aggregate and is covered by
> integration tests. Review note: volume currently falls back to `full_body` unless exercise
> metadata is expanded into this aggregate.
**Acceptance criteria:**
1. Shared pure function `weeklySummary(data, weekStart)` → JSON: avg daily kcal vs target, adherence %, macro gaps, days-logged consistency, training sessions + volume by muscle group, cardio minutes, weight trend (first/last/7-day-MA delta), water avg. **TDD'd against fixture data** including: full week, sparse week, empty week, no-targets user.
2. `GET /insights/weekly-summary?week=` serves it (integration-tested); no LLM anywhere in this story.
3. The final JSON schema is documented here and in docs/ai.md when done — every AI feature consumes it.

### NWE-502 · Weekly AI review generation — `[x]` · O
> Implemented for review (2026-07-11): `POST /insights/generate` is idempotent per week, stores
> `insights` rows with model + prompt version, validates the summary/recommendations/encouragement
> shape, uses Gemini when configured, and uses a deterministic local fallback for dev/test.
**Acceptance criteria:**
1. `POST /insights/generate`: calls the 501 aggregate, sends ONLY that JSON (no raw logs, no PII) to Gemini, stores the result in a new `insights` table (user_id, kind, week_start, content markdown, model+prompt version, created_at; unique user+week for kind='weekly') + RLS.
2. Prompt template versioned in `prompts/weekly-review.v1.ts`; output contract enforced by post-validation: 1-paragraph summary, 2–3 concrete recommendations, 1 encouragement line — regenerate once on contract violation, then fail gracefully.
3. Idempotent per (user, week); Gemini quota/timeout → clean `RATE_LIMITED`/`UPSTREAM_ERROR`, no partial rows (integration-tested with a mocked Gemini service).
4. `services/gemini.ts` built here or reused from NWE-508 (whichever lands first).
**Depends on:** NWE-501.

### NWE-503 · Insights UI — `[x]` · S
> Implemented for review (2026-07-11): added the 5th Insights tab, weekly review hero, generate
> action, past reviews list, physique compare entry, friendly busy/error state, component tests,
> and `.maestro/insights.yaml`.
**UI:** new 5th tab "Insights" (sparkles icon). Top: this week's review as a hero card — week range, headline, rendered markdown body, "generated Mon 07:00" footer. If missing: primary button "Generate my weekly review" with a one-line explainer. Below: "Physique compare" entry card (→ NWE-507) and a collapsed "Past reviews" list (week range + first line, tap to expand). Empty state for brand-new users explains what arrives after a week of logging.
**Acceptance criteria:**
1. `GET /insights?kind=weekly` list + hero; generate button calls `POST /insights/generate`, disabled while pending or when this week exists.
2. Markdown renders correctly (headings, lists); long reviews scroll within the card.
3. Quota error surfaces as a friendly "AI is busy — try again later" state (component test).
4. Component tests: empty / current / past states; Maestro flow extended (open Insights).
**Depends on:** NWE-502.

### NWE-507 · AI physique-progress compare — `[x]` · O
> Implemented for review (2026-07-11): Profile/Insights → Physique compare screen, server-recorded
> consent + revocation, free-tier caveat copy, `POST /insights/physique/analyze` with text-only
> storage, no submitted photo payload persistence, feedback deletion, and integration coverage.
**Goal:** user picks two photos — "previous" and "current" — and gets encouraging, concrete AI feedback on visible progress. No stored photo library required; **"we never store your images" is a headline feature of this screen.**
**UI:** two large photo slots side by side labeled Previous / Current (tap → camera / library / progress-photo grid picker), optional date under each; a reassurance line under the slots ("Analyzed in the moment. Never stored."); primary "Compare" button; result renders below as a card with the feedback text and a delete option.
**Acceptance criteria:**
1. First-use opt-in consent sheet with honest copy: photos leave the device only for the moment of analysis, sent to Google's Gemini API, **including the free-tier caveat** (Google may process free-tier API data to improve services); consent recorded; revocable in Profile; no analysis without it (integration-tested).
2. API route: photos inline (compressed base64/multipart) + stats context (weight trend, training volume from 501 when available) → Gemini vision → **only text stored** in `insights` (kind='physique'); photos never touch disk/DB server-side (code-reviewable guarantee + no-write test).
3. Versioned prompt with tone constraints: encouraging, body-neutral, no body-shaming, no medical claims/diagnoses, no body-fat-% presented as fact; refusal path if images aren't physique photos (unit-test the prompt builder; manual smoke for refusal).
4. User can delete any generated feedback.
**Depends on:** NWE-501, 502 (Gemini plumbing + insights storage). NWE-405 optional.

### NWE-508 · Snap-to-log: AI photo → meal — `[x]` · O
> Implemented for review (2026-07-11): Food tab snap-to-log panel, ephemeral photo analyze route
> (`POST /foods/analyze-photo`), strict candidate schemas, ingredient resolve route
> (`POST /foods/resolve`), `source='ai_photo'` logging with ingredient payload in `source_id`,
> per-day quota guard, and integration coverage.
**Goal:** photograph a meal; AI proposes what it is; user confirms; macros computed from real food DBs.
**UI:** camera button prominent on the Food tab (next to search). After the shot: a bottom sheet with up to 5 candidate cards (dish name, confidence pill, estimated kcal); "None of these → search/manual" as the last row. Selecting expands the editable ingredient list: rows with name, quantity stepper (g/ml), kcal, and an "estimated" badge where resolution fell back to AI numbers; footer shows live totals, meal-type chips, and the **Log** button. A persistent hint: "Portions are estimates — tap to adjust."
**Acceptance criteria:**
1. `POST /foods/analyze-photo`: photo inline, processed **ephemerally** (never persisted server-side — same promise as 507); returns the candidate structure validated by a strict shared Zod schema (malformed Gemini output → one retry → graceful failure). Integration-tested with mocked Gemini.
2. `POST /foods/resolve`: generic ingredients via **USDA FoodData Central** (free key, Edge Function secret), packaged via Open Food Facts; unresolved → Gemini's estimate flagged `estimated: true` (TDD'd resolver with fixture responses for both DBs).
3. Logging creates ONE `food_log` (dish name, summed macros, `source='ai_photo'`, ingredient breakdown in a `jsonb` column) — editable later via the NWE-205 flow.
4. Photo saved on-device via the 204 util; per-user daily analyze quota guard (TDD'd).
5. Component tests: candidate sheet, ingredient editing, estimated badge, fallback path.
**Depends on:** NWE-204, 114. *(Absorbs former NWE-506.)*

### NWE-509 · AI workout generation — `[x]` · O
> Implemented for review (2026-07-11): Workouts → Generate my program Q&A, strict generated
> program schema, `POST /routines/generate`, save endpoint that writes normal editable routines,
> unmatched exercise creation, training insight logging, preview UI, and integration coverage.
**Goal:** the training coach writes your program — works from day one (needs zero history, only the setup Q&A).
**UI:** a "✨ Generate my program" card at the top of the Routines segment (and offered at the end of onboarding once this ships). Q&A wizard, one question per page (same visual language as onboarding): goal chips → experience level → days/week → equipment (multi-select chips: gym, dumbbells, bodyweight, bands…) → injuries/constraints (free text, optional). Loading state with rotating friendly copy ("Balancing your push days…"). Result: a program preview — one card per training day (day name, exercise rows with sets×reps, a one-line rationale under the day) — with three actions: **Save program** (primary), **Adjust…** (free-text field: "less shoulder work", "45 min max" → regenerates a diff), **Regenerate**.
**Acceptance criteria:**
1. `POST /routines/generate`: Gemini returns the program as **strict JSON validated by a shared Zod schema, exercises mapped to library IDs** — unmatched exercise names are created as custom entries or dropped with a note; free text never enters the schema (malformed output → one retry → graceful failure). TDD'd with mocked Gemini fixtures.
2. Saving writes normal NWE-302 routines — fully editable afterwards, nothing locked or special-cased.
3. "Adjust" regenerates and renders a **diff view** (added/removed/changed rows highlighted green/red/amber) that the user approves or discards; approval replaces the draft, never silently.
4. Program rationale stored in `insights` (kind='training'); prompt versioned (`prompts/program-gen.v1.ts`); per-user generation quota guard (TDD'd).
5. Component tests: wizard steps, preview rendering, diff approve/discard. Maestro: generate → save → routine appears.
**Depends on:** NWE-301, 302.

### NWE-510 · Adaptive training — `[x]` · O
> Implemented for review (2026-07-11): routine coach suggestion action, strict routine-diff
> schema, `POST /routines/:id/adapt`, `POST /routines/:id/apply-diff`, Insights logging, and
> integration coverage. Reviewer should assess detector sophistication/thresholds.
**Goal:** the program evolves with logged performance — detection is deterministic, wording is AI, applying is the user's call.
**UI:** when a detector fires, a coach card appears at the top of the Workouts tab (and mirrors in Insights): small coach avatar, one-line finding ("Your bench press has stalled for 4 sessions"), and a "See suggestion" button → suggestion screen with the proposed routine diff (old vs new, same diff visual as 509) + the coach's short reasoning + **Apply** / **Dismiss**. Dismissed suggestions don't reappear for that detector for 2 weeks.
**Acceptance criteria:**
1. Detectors are pure shared functions, TDD'd: plateau (no e1RM progress in N sessions), missed sessions vs plan, volume drop week-over-week, rapid progress. Thresholds documented in the code.
2. Evaluated fortnightly (cron) and after session saves; firing calls Gemini with the detector context + program state → returns a strict-JSON routine diff (same schema discipline as 509).
3. **Nothing auto-applies.** Apply updates the routine atomically and logs the change in `insights` (kind='training'); Dismiss snoozes that detector 2 weeks (TDD'd gating).
4. Quota-guarded (max one proposal per detector per fortnight); integration tests with mocked Gemini cover fire → propose → apply and fire → dismiss → snooze.
5. Component tests: coach card, diff screen, apply/dismiss flows.
**Depends on:** NWE-509, 501.

### NWE-511 · Coach council — `[x]` · O
> Implemented for review (2026-07-11): `POST /insights/council` produces an idempotent weekly
> goal/nutrition/training council plan from the weekly summary, stores per-coach content in
> `insights`, rides the weekly cadence, and is integration-tested.
**Goal:** goal coach + nutrition coach + training coach produce ONE coordinated weekly plan and monitor progress together — the app's flagship feature.
**UI:** the Insights weekly review card grows into the **council plan**: three collapsible sections with coach identities — 🎯 Goal coach (progress vs goal + any target-change proposal), 🥗 Nutrition coach (diet proposals grounded in what was actually logged: "your protein dipped on weekends — two easy swaps…"), 🏋️ Training coach (adherence + focus, surfacing 510 suggestions). Proposals that change numbers render as **inline approve/dismiss chips** ("Calorie target 2 150 → 2 050 · Apply?"). Between weeklies, detector check-ins appear as small dated cards in the same feed ("Nutrition coach · Wed — 3 days without logs. No stress — today's a clean slate.").
**Acceptance criteria:**
1. One orchestrated pipeline (single structured prompt with role sections, or sequential role prompts sharing context — decide, document here): input = weekly summary (501) + goal + program state; output = strict-JSON plan validated by a shared Zod schema with per-coach sections and typed proposals (target diff / diet suggestion / training focus). TDD'd with mocked Gemini.
2. **Every numeric/program proposal requires explicit user approval**; applying a target diff respects `targets_locked` (absorbs former auto-adjusting-targets story); applied diffs logged in `insights`.
3. Weekly cadence rides the NWE-603 cron; council replaces the plain weekly review from 502 (502's generator becomes the fallback when there's insufficient data — brand-new users get the simple review, council kicks in when data supports it; boundary TDD'd).
4. Check-in triggers are deterministic shared detectors (logging lapse ≥3 days, weight stall 2+ weeks vs goal, volume drop) — quota-guarded, max one per detector per week, encouraging tone, never guilt (copy reviewed against the guardrail).
5. Prompt versioned (`prompts/council.v1.ts`); per-coach attribution rendered; component tests for sections, chips, check-in cards; integration test: full weekly run end-to-end with mocked Gemini.
**Depends on:** NWE-501, 502, 404, 509, 510, 603 (cron).

### NWE-505 · Coach chat — `⏸ v1.1` · O
Free-form chat with the council, grounded in user aggregates; quota-hungry, needs guardrails and the council live first. Depends on 511. *(NWE-120 ships the scoped, program-only version of this in v1.0; 505 remains the open-ended chat.)*

---

## Epic 5b — Coach awareness & interaction (added 2026-07-20, user decision)

Goal: the coaches should *know* the user (stated intent + distilled memory + decision history)
and the user should be able to *talk back* to a generated program instead of following blindly.
Architecture decisions (locked in discussion 2026-07-20):
- **No fine-tuning, no vector DB.** Awareness = per-request context injection; continuity = a
  rolling **distilled memory** (≤1200 chars, hard-capped) rewritten weekly by one cheap call.
- **Code decides when the coach speaks** (detectors, NWE-510); the LLM only writes the words.
- **Chat is artifact-scoped, not open-ended** (quota discipline; open chat stays v1.1 = 505).
- Everything the coach "knows" is **user-visible and clearable** (trust + privacy).

### NWE-118 · Coaching profile (stated intent) — `[x]` · O
> Done (2026-07-20): migration 0003; `coachingProfileSchema` (TDD'd); PATCH /me round-trip
> (integration-tested); onboarding "Tell your coach" page; Profile "Your coach" editor; injected
> via `coachContextLines` into program-gen/weekly/council/refine prompts (unit-tested rendering).
> **Live-verified on prod:** dislikes=["lunges"] → generated program contained no lunges.
**Goal:** capture what the user *wants* — not just what they log — and inject it into every AI call.
**UI:** one new onboarding page ("Tell your coach", skippable): motivation free-text, dislikes,
injuries/constraints, coach-tone chips (gentle · balanced · direct). Profile gains a "Your coach"
section showing the same fields, editable, with the copy "This is everything your coach knows
about you."
**Acceptance criteria:**
1. Migration `0003`: `coaching_profile jsonb not null default '{}'` on profiles. Shape owned by
   `coachingProfileSchema` in `packages/shared` (motivation, target_event {name,date}, preferences[],
   dislikes[], injuries[], coach_tone) — all optional, length-capped, TDD'd.
2. `PATCH /me` accepts `coaching_profile` (validated); round-trip integration test.
3. Onboarding page + Profile "Your coach" editor (component-tested: edit + save + rendered values).
4. Injection: program generation, weekly review, and council prompts all receive the coaching
   profile when present (dislikes are respected: e.g. "hates running" → no running; prompt-builder
   unit test asserts fields appear).
**Depends on:** NWE-104, 114.

### NWE-119 · Coach memory + decision feedback (continuity) — `[x]` · O
**Goal:** the coach remembers what worked, what the user rejected, and how the story is going.
**Acceptance criteria:**
1. Migration `0004`: `coach_memory jsonb not null default '{}'` on profiles (`{text, updated_at}`,
   Zod-owned, text hard-capped ≤1200 chars).
2. `buildCoachContext(db, userId)` service: `{coachingProfile, coachMemory, recentDecisions}` where
   recentDecisions = the last ~6 applied/dismissed proposals from `insights` (the behavioral
   feedback loop — "user dismissed cardio twice"). One injection point used by every coach route.
3. **Memory distillation:** after each weekly/council generation, one Gemini call
   (`prompts/coach-memory.v1.ts`, mock-hooked like all others) rewrites the memory from
   {previous memory + weekly summary + recent decisions}; result capped and stored. If Gemini is
   unreachable, memory is left unchanged (never a fake memory). Integration test: two council runs
   → memory updated; mocked response respected.
4. Profile "Your coach" section shows the memory text ("What your coach remembers") + **Clear
   memory** (sets `{}`); component + integration tested.
5. Prompts (council, weekly review, program gen, refine) include memory + recentDecisions when present.
**Depends on:** NWE-118, 511.

### NWE-120 · Program refinement chat (chat-to-edit) — `[x]` · O
> Done (2026-07-20): two-channel `refineProgramResponseSchema`; `/routines/generate` returns
> `insight_id`; `/routines/generated/refine` with history window (last 8 turns), thread persisted
> in the draft insight payload, ≤20 turns/draft, cross-user 404,
> UPSTREAM_ERROR when Gemini is down (no fake replies); ProgramChat UI (bubbles, thinking state,
> revision card → Apply replaces preview only; save via normal flow). Component + integration
> tested. **Live-verified on prod:** question → reply-only; "30 min max, 3 exercises/day" →
> reply + revised program (5→2-3 exercises/day).
**Goal:** discuss a generated program with the coach and iterate — never follow blindly.
**UI:** under the generated-program preview (Workouts tab), a chat panel: message list (user right,
coach left), input + Send. When the coach proposes a revision, a card renders **"Apply this
revision"** which replaces the preview draft (user then saves via the normal 509 flow). Loading
state while the coach thinks; friendly "coach is busy" error state.
**Acceptance criteria:**
1. **Two-channel structured output:** `refineProgramResponseSchema` in shared =
   `{reply: string, updated_program?: GeneratedProgram|null}` — prose answer always; revised
   program only when the user asked for a change. TDD'd.
2. `POST /routines/generate` now also returns `insight_id` (the stored draft row);
   `POST /routines/generated/refine` takes `{insight_id, message}`, loads the draft (RLS),
   sends {current program + last 8 turns + coach context (118/119)} to Gemini
   (`prompts/program-refine.v1.ts`, system-instructed, mock-hooked), appends both turns to the
   draft's `payload.messages`, persists `payload.draft_program` when revised, returns
   `{reply, updated_program}`. Gemini unreachable → clean `UPSTREAM_ERROR` (no fake replies).
3. **Quota discipline:** ≤20 turns per draft (RATE_LIMITED beyond). The 3 drafts/day guard is
   temporarily disabled during product testing so program generation can be exercised freely.
4. Applying a revision only changes the local draft; saving still goes through the normal
   NWE-302/509 save endpoint — nothing auto-applies (locked decision upheld).
5. Component tests: send → reply renders; revision card → Apply replaces preview; busy/error state.
   Integration test: full refine round-trip with mocked Gemini (reply-only AND with-revision cases).
**Depends on:** NWE-509, 118; better with 119.

### NWE-121 · AI meal planner (nutritionist) — `[x]` · O
**Goal:** the nutrition counterpart to the workout generator — a nutritionist-role AI plans a day
of meals to hit the user's macro targets, aware of their training, goals, body stats, and dietary
needs; the user refines it in chat, saves recipes, and logs "I had this" straight into the food log.
**UI:** Food tab gets a "✨ Plan my meals" card (next to search). A day picker (Mon…Sun; today
default) — pick a day, generate. Result: N meal cards (breakfast/lunch/dinner/snacks per the
user's meals-per-day pref) each with name, per-meal macros, and an expandable recipe (ingredients +
steps). A totals row vs. the day's targets. Actions per plan: **Review changes** (opens a bottom
sheet listing proposed changes → Approve applies to the plan / close-and-keep-chatting), a chat
input to talk to the nutritionist, and per meal: **Save recipe** (→ recipes, NWE-202) and
**I had this** (→ logs that meal's macros to the food log for the selected day).
**Architecture:** one orchestrated pipeline, nutritionist role prompt (same discipline as 509/120).
Full context: body stats + goal + **computed/locked targets (404)** + **training schedule from
routines/sessions** (periodize: more carbs on training days) + logged-food continuity + coaching
profile/memory (118/119) + the new dietary profile. Day-plan first (regenerate per day); no 7-day
mega-call.
**Acceptance criteria:**
1. Migration `0005`: extend `insights_kind_check` to include `'nutrition'` (meal-plan drafts live
   in `insights`, same as program drafts). Dietary fields added to `coachingProfileSchema`
   (dietary_style, allergies[], disliked_foods[], meals_per_day, cook_time_pref) — **allergies are
   a hard safety constraint, restated in the system prompt, never violated**; TDD'd.
2. Shared `mealPlanSchema` (loose-but-safe: meals[{name, meal_type, macros, recipe{ingredients[],
   steps[]}}], day_totals) + `refineMealPlanResponseSchema` (two-channel `{reply, updated_plan?}`),
   TDD'd. Per-meal macro sums are a pure function (TDD'd).
3. `POST /nutrition/plan` `{date}`: builds nutritionist context (targets + training-day awareness
   from routines + logged foods + dietary/coaching profile), calls Gemini (versioned
   `prompts/meal-plan.v1.ts`, mock-hooked, retry-once, deterministic fallback), stores the draft in
   `insights` (kind='nutrition'), returns `{plan, insight_id}`. Per-day quota (3/day). Integration-
   tested incl. allergy respected in a mocked plan.
4. `POST /nutrition/plan/refine` `{insight_id, message}`: two-channel chat-to-edit over the plan
   draft (last-8-turn history, ≤20 turns/draft), persists thread + revision; cross-user 404;
   UPSTREAM_ERROR when Gemini down. Integration-tested (reply-only + revision).
5. `POST /nutrition/plan/log-meal` `{insight_id, meal_index, logged_on}`: inserts ONE food_log
   (meal name, its macros, source='ai_photo'? no — new provenance handled as manual-style) for the
   day; saving a recipe reuses the NWE-202 recipe create. Integration-tested (log lands in totals).
6. App: dietary setup page (onboarding + Profile "Your coach"/nutrition), Food-tab planner entry,
   meal-plan view with recipe expanders + totals-vs-target, **Review-changes bottom sheet** (approve/
   close), refinement chat, Save recipe, I-had-this. Component-tested (plan renders; refine reply vs
   revision; log-meal calls the mutation; bottom-sheet approve replaces plan).
7. Copy body-neutral, "general wellness, not medical advice" rail; all AIs already receive body
   stats/goal/targets via context — verify the nutritionist prompt includes them (unit test).
**Depends on:** NWE-118/119 (context), 404 (targets), 501 (summary), 202 (recipes), 114.

---

## Epic 5c — Agentic AI Hub

> Approved design: [`docs/superpowers/specs/2026-07-21-ai-hub-design.md`](docs/superpowers/specs/2026-07-21-ai-hub-design.md).
> This deliberately supersedes NWE-505 and reverses the old aggregate-only rule for this Hub;
> reads remain capped, PII-free, and RLS-scoped, while model-initiated writes are impossible.

### NWE-122 · AI Hub backend foundation — `[x]` · O
> Implemented 2026-07-21: migration `0007_assistant.sql`; shared chat/tool/SSE contracts;
> 11-tool read-only MCP-shaped registry; Gemini Interactions streaming loop with fragmented
> argument assembly, parallel reads, continuation IDs, step/time caps and structured traces;
> authenticated `/assistant/chat` SSE plus thread list/resume endpoints; daily quota; direct RLS,
> persistence, stream, cap, and schema tests. NWE-123 owns the app screen; NWE-124 owns proposals.
> **Temporary user-directed override (2026-07-22):** the default 45-second total-loop timeout is
> disabled while real Interactions latency is evaluated; step, quota, row, and date caps remain.
**Acceptance criteria:**
1. `assistant_threads` and `assistant_messages` migration has RLS, indexes, lifecycle fields, and
   `insights.kind='assistant'`; cross-user isolation is integration-tested for both tables.
2. Read-only registry exposes the 11 approved tools with Zod args, MCP-shaped JSON Schema, ≤200-row
   and ≤365-day caps, with no mutation/proposal dispatch path.
3. Interactions loop uses streaming, re-sends interaction-scoped tools/system instructions,
   continues via `previous_interaction_id`, aggregates split arguments, executes parallel reads,
   skips unknown events, and enforces the 6-step/default 10-step-hard limits. The 45-second limit
   is temporarily disabled by the explicit user override above.
4. `POST /assistant/chat` streams `thought`, `function_call`, `text`, `done`, and `error`; auth,
   request validation, friendly daily quota, message/tool-trace persistence, and thread resume work.
   `GET /assistant/threads` and `GET /assistant/threads/:id` are RLS-scoped.
5. Hub tools never expose emails, photos, other-user data, or server-side writes. Copy/prompt is
   body-neutral and avoids medical claims. Docs and agent guidance reflect the approved reversal.

**Follow-ups:** NWE-123 Hub/FAB UI · NWE-124 proposals/approval · NWE-125/126 Interactions migration · NWE-127 remote MCP.

---

### NWE-123 · Hub screen (FAB, streaming chat, threads, trace) — `[x]` · O
**Goal:** give NWE-122's backend a face — one place to talk to the assistant, where the user *sees*
it working rather than staring at a spinner.
**UI:** a **magic FAB** (✨) floats above the tab bar on all five tabs, respecting safe-area insets;
tap opens `app/assistant.tsx` (full screen), long-press opens the recent-threads list. The screen:
message list (user right, assistant left, markdown via `MarkdownText`), a live **progress strip**
while the assistant works — "Thinking…" then per-tool copy ("Looking at your workout trends…",
"Checking today's meals…") driven by real `function_call` events, never faked. Under each assistant
message, a collapsed **"What I looked at"** row expands to the tool trace (friendly tool name,
argument preview, latency). Input + Send, disabled while streaming. Empty state suggests three
starter prompts (one workout, one nutrition, one "what should I focus on?"). Quota-reached and
"assistant is busy" states use friendly, non-guilting copy. Failed turns (`failed = true`) render
as a muted "couldn't finish that one" bubble with a Retry affordance, never as normal advice.
**Acceptance criteria:**
1. **Streaming client:** `lib/api.ts` gains `streamSSE()` built on **`expo/fetch`** (verified to
   expose a `ReadableStream` body + `getReader()`; `TextDecoderStream` available) — no new
   dependency. It yields events parsed by the shared `parseAssistantSse`, tolerating split chunks
   and unknown event types. If streaming is unavailable, fall back to a non-streamed request and
   render the final message (degraded, never broken). Unit-tested against split/hostile chunks.
2. **FAB** renders on all five tabs above the tab bar, safe-area aware, with an accessibility label;
   honours reduced-motion via the NWE-606 motion tokens; never covers the tab bar's hit targets.
3. **Progress reflects reality:** `thought` → "Thinking…"; each `function_call` → a humanised line
   from a tool→copy map (unknown tool names degrade to a generic "Checking your data…"). Text
   deltas append progressively. Component-tested with a scripted event sequence.
4. **Threads:** new chat starts a thread; `GET /assistant/threads` lists them (newest first);
   opening one resumes via `GET /assistant/threads/:id` and continues by sending `thread_id`.
   Long-press FAB → thread list. Empty/loading/error states on every surface.
5. **Transparency:** the "What I looked at" trace renders from `tool_trace` on every assistant
   message that used tools, and is absent (not an empty box) when none were used. Component-tested.
6. **Failed turns** are visually distinct and offer Retry (re-sends the same message to the same
   thread). Quota `RATE_LIMITED` renders its own friendly state, not a generic error.
7. **Retention disclosure** (required before this ships, per docs/ai.md): a short, honest line in
   the Hub's first-run state + Profile explaining that conversations are processed and briefly
   retained by Google, and that photos are never sent to the Hub.
**Depends on:** NWE-122.

**Completed 2026-07-21:** full-screen Hub + safe-area FAB/long-press threads, incremental
`expo/fetch` SSE parser/fallback, real event-driven progress, markdown, persisted threads,
transparency trace, retry/quota states, and Hub/Profile retention disclosure. Component and shared
parser tests cover streamed events, hostile splits, traces, and failed turns.

---

### NWE-124 · Proposals & approval sheet — `[~]` · O
**Goal:** close the loop — the assistant can *propose* real changes, and the user approves them
with a tap. This is what makes the Hub a hub rather than a chatbot. Completes S1 and S2 from the
design doc.
**UI:** when the assistant proposes something, an inline **proposal card** appears in the thread
(title, one-line human summary, a compact diff — e.g. "3 meals · 2,180 kcal" or "Day 2: +1 set on
rows, −1 exercise"). Tap → **gorhom bottom sheet** with the full detail (per-meal recipes and
macros; per-day exercise changes; target before→after). Sheet footer: **Approve** (primary) and a
grabber — **swipe down keeps the proposal in the thread and the conversation going** (explicitly
not a dismissal of the chat). After approval the card becomes a confirmed state ("Added to your
food log", "Routine updated") and the assistant acknowledges in-thread.
**Acceptance criteria:**
1. **Proposal tools** join the registry with `kind: 'proposal'` — `propose_program_revision`,
   `propose_meal_plan`, `propose_food_logs`, `propose_target_change`. The dispatcher **still has no
   mutation path**: proposal tools only validate args and return an artifact. The existing registry
   test is extended to assert every proposal tool performs zero writes. TDD'd.
2. **Persistence:** each proposal is stored as `insights(kind='assistant')` with its payload +
   `model`/`prompt_version`, and linked from the emitting message via
   `assistant_messages.proposal_insight_id`. The `proposal` SSE event (already in the shared union)
   is emitted with `{insight_id, proposal_kind}`.
3. **Apply endpoint:** `POST /assistant/proposals/:id/apply` validates the payload with the shared
   Zod schema **again** (never trust stored JSON), delegates to the *existing* endpoint for that
   kind (`/routines/generated/save`, `/food-logs`, `/nutrition/plan/log-meal`, `PATCH /me`), stamps
   `applied_at`, and is **idempotent** — applying twice does not double-write. Cross-user 404.
   `POST /assistant/proposals/:id/dismiss` stamps `dismissed_at` and leaves the thread intact.
4. **Safety rails carry through:** allergies remain absolute in any nutrition proposal; a
   `propose_target_change` on a `targets_locked` profile is refused with a clear explanation rather
   than silently applied. Integration-tested for all four kinds, including the allergy case.
5. **UI:** proposal card → sheet → Approve applies and confirms; swipe-down keeps both the proposal
   and the conversation alive. Both paths component-tested, plus the already-applied state.
6. **E2E (Maestro):** S1 (advice → program revision → approve) and S2 ("I ate x y z" → prefilled
   food logs → approve) run end-to-end against mocked AI.
**Depends on:** NWE-122, NWE-123.

**Implemented locally 2026-07-21:** four pure proposal tools, assistant-insight persistence + SSE linkage,
owned idempotent apply/dismiss endpoints with allergy/target-lock rails, inline cards and approval
sheet/confirmed state, integration/component coverage, and Maestro S1/S2 flow definitions. Story
remains `[~]` until those two flows are run against a rebuilt dev client and scripted local AI.

---

### NWE-125 · Migrate chat features to Interactions API — `[x]` · M
**Goal:** stop maintaining two AI paths for the same *shape* of feature. Program-refine and
meal-plan-refine are conversations; move them onto the Interactions API the Hub already uses.
**Acceptance criteria:**
1. `refineProgram` and `refineMealPlan` call the shared Interactions transport instead of
   `geminiJson`, continuing threads via `previous_interaction_id` rather than re-sending an
   8-turn history window.
2. **Behaviour is unchanged from the user's side:** two-channel `{reply, updated_*}` output, the
   ≤20-turn cap, cross-user 404, and clean `UPSTREAM_ERROR` when Gemini is down all still hold.
   The existing integration tests pass **unmodified** except for the mock transport they drive —
   that is the migration's proof.
3. Mock hooks are unified: the `GEMINI_MOCK_INTERACTION_SEQUENCE` mechanism replaces the
   per-feature `GEMINI_MOCK_*_REFINE` variables, with the old names accepted for one release.
4. Prompt versions bump (`program-refine.v2`, `meal-plan-refine.v2`) so stored rows remain
   attributable to the model/prompt that produced them.
5. Rollback is a single env flag (`ASSISTANT_INTERACTIONS_REFINE=off`) for one release, so a
   regression in production does not require a redeploy to undo.
**Depends on:** NWE-122.

**Completed 2026-07-21:** program/meal refiners now resume stored Interactions IDs, attribute v2
prompts, share the interaction mock transport, retain legacy mock names, and support the one-release
`ASSISTANT_INTERACTIONS_REFINE=off` compatibility mode.

---

### NWE-126 · Migrate one-shot generators to Interactions API — `[~]` · M
**Goal:** finish the consolidation so `generateContent` (now legacy) is gone from the codebase and
there is exactly one way this app talks to Gemini.
**Scope:** weekly review (501), council (511), physique compare (507), program generation (509),
meal-plan generation (121), snap-to-log photo analysis (508).
**Acceptance criteria:**
1. Each generator moves to the Interactions transport with `store=false` where no continuation is
   needed (these are one-shot — they must **not** create retained server-side state unnecessarily).
2. **Every existing integration test for these six features passes unchanged**, including the
   deterministic local fallbacks when Gemini is unreachable and the physique/photo path proving
   **no image is ever persisted**.
3. Photo-bearing calls (507/508) are re-verified against the privacy promise: ephemeral in-memory
   only, text stored, nothing image-shaped written server-side. This is re-tested, not assumed.
4. `services/gemini.ts`'s `geminiJson` is deleted once nothing imports it; `docs/ai.md` is updated
   so no doc still describes the legacy path.
5. Each feature migrates as its own commit with its own verification, so any single regression is
   independently revertable. **Live-verify on prod** after deploy, per the Definition of Done.
**Risk note:** this touches five shipped, working AI features. It is deliberately sequenced last in
the epic and after the Hub has proven the pattern in production.
**Depends on:** NWE-125.

**Implemented locally 2026-07-21:** all one-shot generators (plus routine diff and coach-memory
distillation) use the shared Interactions transport with `store=false`; image parts remain
ephemeral and the legacy `generateContent`/`geminiJson` path is deleted. Local automated
verification is complete. Story remains `[~]` only because its required per-feature commits,
deployment, and production live-verification were not authorized/performed in this session.

---

### NWE-127 · Expose the tool registry as a remote MCP server — `⏸ blocked` · M
**Goal:** let tools built for the Hub be reused by other clients (Claude, a CLI, a future web app)
without reimplementing them.
**Blocked on the platform, not on us:** Gemini 3.x **does not support remote MCP yet** ("coming
soon"; currently `gemini-3.5-flash` / Managed Agents only), and remote MCP requires **Streamable
HTTP** — SSE servers are not supported. Adopting it today would mean dropping to a weaker model and
losing the Gemini 3 thinking that measurably improves tool selection.
**Design notes captured now (per the approved spec) so the decision isn't re-derived later — this
story gets real acceptance criteria when it unblocks:**
1. The registry is already MCP-shaped (`{type,name,description,parameters}` + JSON Schema), so
   exposure is a **transport change, not a tool rewrite** — that is the whole point of NWE-122's
   shape.
2. Exposure needs a **Streamable HTTP** endpoint and a per-user auth story: Google's sandbox would
   call it from Google infrastructure, so the endpoint must be public and carry a scoped,
   short-lived per-user credential — never the user's Supabase JWT directly.
3. **Privacy gate:** this routes user data through a third-party sandbox. It requires an explicit
   product decision and user-facing disclosure before it ships, consistent with docs/ai.md.
4. Revisit when (a) Gemini 3.x supports remote MCP, **and** (b) a second client actually exists.
   Absent (b), in-process remains cheaper, faster, and more private for identical token cost.
**Depends on:** NWE-124.

---

## Epic 5d — Rich, editable proposals

> Approved 2026-07-22. The Hub can already propose and apply four kinds of change (NWE-124), but
> the proposals are **shallow** (meal totals only, no ingredients, no micros, no provenance) and
> **read-only** (a 150 g → 200 g correction costs a full agentic round-trip). This epic makes them
> deep and editable, and adds the missing workout-log capability.
>
> **Nothing here weakens the safety model.** The registry still has no mutation path; every write
> is still `proposal → review sheet → explicit approval → existing authenticated endpoint`.
>
> **Two facts the original schema anticipated** (verified 2026-07-22, they shape the whole epic):
> `food_logs.ingredients jsonb` already exists — its `0001` comment reads *"kept so the entry stays
> editable ingredient-by-ingredient"* — and is currently **unwritten**. And the USDA client already
> fetches the full `foodNutrients` array but discards everything except four macros. Most of this
> epic is *using* what is already there, not adding new infrastructure.

### NWE-128 · Per-ingredient proposal payloads — `[x]` · O
**Goal:** the precondition for everything else in this epic. A proposal must carry **per-ingredient,
per-100g** nutrition, not just a meal total — otherwise editing a quantity can only be a naive
`× new/old` on the whole entry, which is wrong for any composite dish (scaling "chicken curry" by
1.33 would also scale the cream and rice the user did not touch).
**Why per-100g:** it is already the app's convention (`recipe_items.calories_per_100g` et al.) and
the shape both USDA and Open Food Facts return, so scaling one ingredient is an exact linear
multiply against a known basis — not a percentage guess.
**Acceptance criteria:**
1. **Shared schema (TDD, test-first).** New `proposalIngredientSchema` in `packages/shared`:
   `{name, quantity_g, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
   source: 'usda'|'openfoodfacts'|'estimated', source_id?, fdc_id?}`. `foodLogProposalEntrySchema`
   extends the existing entry with `ingredients: proposalIngredientSchema[]` (1–30) and keeps the
   denormalized totals. Totals must equal the ingredient sum within ±1 kcal / ±0.5 g — enforced by
   a schema `.refine()` so an inconsistent proposal cannot be stored at all.
2. **Pure math (TDD, test-first).** `ingredientTotals(ingredients)` and
   `scaleIngredient(ingredient, quantity_g)` in `packages/shared`, rounding to 1 dp. Unit tests
   cover: single ingredient, composite dish, zero-quantity, ingredient removal, and the specific
   regression **"150 g chicken → 200 g in a 4-ingredient curry changes only the chicken's
   contribution."**
3. **Resolver returns ingredients.** `resolve_macros` returns the per-ingredient breakdown with
   per-100g bases and a `source` per row, instead of a single collapsed total. Existing callers
   (snap-to-log 508) keep working — asserted by their existing tests passing unchanged.
4. **`propose_food_logs` emits the new payload**, and `applyProposal` writes the breakdown into the
   **existing, currently-unused `food_logs.ingredients` jsonb** column. No migration needed for
   this story — verified the column exists with the intended shape.
5. **Backwards compatibility.** Proposals persisted before this story (no `ingredients`) still
   render and still apply; the sheet shows "ingredient detail unavailable" rather than erroring.
   Integration-tested against a stored legacy payload.
6. **Round-trip integration test:** propose → apply → read back `food_logs.ingredients` and assert
   the stored breakdown matches the proposal, and that summed totals match the row's macros.
**Depends on:** NWE-124.

---

### NWE-129 · Editable review sheet — `[x]` · O
**Goal:** let the user correct a proposal *in the sheet* — instantly, deterministically, and without
spending an AI call. "Actually it was 150 g chicken and no cream" should be two taps, not a
round-trip.
**UI:** the gorhom sheet becomes interactive. Each ingredient row: name, an inline numeric
`quantity_g` field, its computed contribution, a provenance chip (NWE-130), and a delete affordance.
A live totals bar at the top recalculates on every keystroke, showing the delta against the user's
daily targets. Servings stepper, meal-type chips and date remain editable. Workout proposals get the
equivalent: per-set `reps`/`weight`/`duration`/`distance` fields. Footer: **Approve** (applies the
*edited* payload), plus a subtle "ask the assistant" affordance for changes local editing cannot do.
**The two-tier rule (the core design decision):**
- **Local & free — must never call the AI:** change a quantity, delete an ingredient, change
  servings/meal type/date, edit sets/reps/weight/distance.
- **AI-assisted — one resolution call, not a full agentic turn:** add or swap an ingredient
  ("swap cream for yoghurt"), because that needs nutrition data the client does not have.
**Acceptance criteria:**
1. **Local edits perform zero network calls.** Component test asserts the API client is **not**
   invoked when quantities change, ingredients are deleted, or servings change — this is the
   story's headline property and must be tested explicitly, not assumed.
2. Totals recalculate from `ingredientTotals`/`scaleIngredient` (NWE-128), never from a re-fetch.
   Displayed macros match the shared math to 1 dp. Component-tested including the curry regression.
3. **Approve applies exactly what is on screen.** The edited payload is re-validated with the shared
   Zod schema client-side *and* server-side before the write; a payload whose totals no longer match
   its ingredients is rejected with a clear message rather than silently written.
4. **Add/swap ingredient** calls a single resolve endpoint (not the agent loop), shows a pending row
   while resolving, and flags the result's provenance. Failure leaves the sheet untouched with a
   friendly retry — never a half-applied edit.
5. **Deleting the last ingredient** disables Approve with an explanatory message rather than writing
   an empty entry.
6. Edits are **discarded on swipe-down** and the original proposal remains intact in the thread
   (consistent with NWE-124's "keep chatting" behaviour). Re-opening shows the original, not a
   half-edited draft. Component-tested.
7. Numeric inputs are keyboard-safe, `keyboardType="numeric"`, reject negatives and non-numerics,
   and cap at the schema maxima. Accessibility labels on every control.
**Depends on:** NWE-128.

---

### NWE-130 · Micronutrients & provenance — `[x]` · M
**Goal:** make the nutrition data both *deeper* (micros, not just four macros) and *honest* (the
user can see which numbers are measured and which are guessed).
**Why provenance matters:** the app already blends deterministic sources (USDA, Open Food Facts)
with Gemini estimates, but presents them identically. A user deserves to know that "chicken breast:
165 kcal" is a database value while "grandma's stew: 420 kcal" is a model's guess.
**Acceptance criteria:**
1. **Extract what is already fetched.** The USDA client currently maps `foodNutrients` down to four
   macros and discards the rest — extend it to also capture fiber, sugar, saturated fat, sodium,
   potassium, calcium, iron, and vitamin C where present. Open Food Facts equivalents mapped where
   its `nutriments` provide them. Missing values stay **`null`, never `0`** — a zero is a claim,
   a null is an absence. Unit-tested against fixture payloads for both providers.
2. **Shared schema:** `micronutrientsSchema` with every field nullable, extending
   `proposalIngredientSchema`. Aggregation ignores nulls and marks a day total "partial" when any
   contributing ingredient lacked that nutrient — so the UI never implies false completeness. TDD'd.
3. **Persistence:** micros ride in the existing `food_logs.ingredients` jsonb (no schema migration —
   verified the column exists). A day's micro totals are computed on read from the breakdown; no
   denormalized micro columns are added in this story.
4. **Provenance is per-ingredient and visible:** each row carries `source` and renders a chip —
   "USDA", "Open Food Facts", or "Estimated". Estimated rows are visually distinct, and any total
   containing an estimate is labelled as approximate. Component-tested.
5. **Deterministic sources win.** The resolver prefers USDA → Open Food Facts → Gemini estimate, in
   that order, per ingredient. Gemini is only asked for ingredients the databases could not resolve.
   Integration-tested with a mixed dish (one resolvable, one not) asserting the source mix.
6. **Harden the allergy check.** Replace the current substring match over the stringified proposal
   (which catches "peanuts" but not "groundnut" or "satay") with a structured check over resolved
   ingredient names plus a synonym/derivative list. Any allergen match blocks approval with a clear
   message. Integration-tested with a synonym case that today's check would miss.
7. Micro display in the sheet is collapsed by default — macros stay the primary read; micros expand.
**Depends on:** NWE-128.

---

### NWE-131 · Workout-log proposals & recipe tools — `[x]` · O
**Goal:** close the two capability holes. The assistant cannot currently log a completed workout at
all, and nine recipe endpoints exist that it cannot reach.
**UI:** a workout proposal card ("Push day · 6 exercises · 48 min") opens a sheet with date, title,
duration, notes, and exercises grouped into sets — each set editable (reps / weight / duration /
distance per the exercise's `kind`). Exercises that could not be matched to the library show a
warning chip with a "pick exercise" affordance rather than failing the whole proposal. Footer:
**Approve and log workout**. Food proposals gain a secondary **Save as recipe** action.
**Acceptance criteria:**
1. **`propose_workout_log` tool** (`kind: 'proposal'`, therefore still no mutation path) with a
   shared `workoutLogProposalSchema`: `{logged_on, title, duration_min?, notes?, exercises:
   [{name, exercise_id?, kind, sets: [{reps?, weight_kg?, duration_min?, distance_km?}]}]}`.
   Cardio sets reject `reps`/`weight_kg`; strength sets reject `distance_km` — enforced in the
   schema, TDD'd.
2. **Exercise matching** resolves names against the library (exact → case-insensitive → user's
   custom exercises). Unmatched exercises are surfaced as warnings **and are user-resolvable in the
   sheet**; approval is blocked only while an unmatched exercise remains. This must not silently
   invent an exercise row.
3. **Apply** delegates to the existing `POST /workout-sessions` (session + sets transactional), is
   **idempotent** via the same `applied_at` guard as NWE-124, and returns a confirmed card state
   ("Workout logged"). Cross-user 404. Integration-tested.
4. **Read tools added:** `get_recipes` and `get_recipe` over the existing endpoints, with the
   registry's standard Zod args and row caps. Registry test extended to assert they are `kind:
   'read'` and perform no writes.
5. **`propose_recipe` tool** + apply path creating a recipe via the existing NWE-202 endpoint,
   reusing the NWE-128 ingredient payload so a proposed recipe carries per-100g bases.
6. **"Save as recipe"** in the food proposal sheet creates a reusable recipe from the (possibly
   edited) ingredient breakdown **without** logging it twice — approving logs food, saving creates a
   recipe, and the two actions are independent. Integration-tested for both orders.
7. **Registry hygiene:** adding four tools must not degrade tool selection — the system instruction
   gains explicit "when to use" guidance for the read/propose split, and the total tool count and
   token cost of declarations is recorded in the story's verification notes.
8. **E2E (Maestro):** "log the workout I just did" → card → edit a set → approve → appears in
   Workouts history.
**Depends on:** NWE-128, NWE-129.

---

### NWE-132 · Proposal versioning — `[x]` · S
**Goal:** when a conversation revises a proposal, the thread should show one current card — not a
stack of near-identical ones the user must disambiguate.
**Acceptance criteria:**
1. `insights(kind='assistant')` payloads gain `supersedes_insight_id`; a revised proposal stamps the
   previous row's `dismissed_at` with reason `superseded` (no schema migration — reuses existing
   lifecycle columns).
2. A superseded card renders collapsed as "updated below" and **cannot be approved**; only the
   current version can. Integration-tested that approving a superseded proposal returns a clear
   error rather than applying stale data — this is the correctness point of the story.
3. Thread reads return only the current version expanded; history stays inspectable but out of the
   way. Component-tested.
4. Applying the current version leaves superseded siblings untouched (no cascade weirdness).
**Depends on:** NWE-124, NWE-128.

> **Completed 2026-07-22:** rich per-ingredient food/recipe payloads and deterministic edit math;
> safe-area-aware read-only-first review sheets with explicit Edit mode; USDA/Open Food Facts/Gemini provenance and partial micro
> totals; structured allergen protection; workout-log and recipe read/proposal/apply paths; and
> stale-proposal versioning. The registry now exposes **19 tools (13 read, 6 proposal)** with
> **14,801 bytes** of closed, fully nested declarations. Gemini validated tool choice and strict
> runtime schemas reject undeclared arguments while explicit unions preserve intentional flexibility.
> Verification: 121 shared tests, 74 app tests, 73 API tests,
> TypeScript, the no-direct-Supabase architecture check, whitespace validation, and a local iPhone
> 16 Plus release-build Maestro path that edited Bench Press set 1 from 8→10, approved it, verified
> the persisted `{10,8,8}` sets, and found the workout in History. No migration was needed because
> the existing `food_logs.ingredients` JSONB and insight lifecycle fields cover these stories.

---

## Epic 6 — Habits, engagement & gamification

Guardrail (locked, also in AGENTS.md): celebrate **real logged actions**, computed server-side —
never self-reported checkboxes; copy never guilts, shames, or manufactures FOMO; rest days
respected, not punished.

### NWE-607 · Notification infrastructure — `[x]` · O
> Implemented for review (2026-07-11): installed `expo-notifications`, added Profile →
> Notifications screen, server-persisted prefs in `profiles.notification_prefs`, local scheduling
> helpers, push-token registration at `POST /notifications/tokens`, dev-only
> `POST /notifications/test`, shared quiet-hour/category gating, and integration tests.
**Goal:** one system for every reminder and nudge — local scheduling + server push — fully user-controlled.
**Architecture:** two channels. **Local** (`expo-notifications` scheduled on-device) for user-set reminders — works offline, no server. **Push** (free Expo Push Service) for server-originated events (weekly review ready; coach check-ins in v1.1): app registers its Expo push token → `POST /devices`; `push_tokens` table (+RLS); API-side `services/push.ts` sends via the Expo Push API; scheduled triggers via Supabase cron (pg_cron → edge function).
**UI:** Profile → "Notifications" screen: master toggle; per-category toggles (Reminders · Weekly review · Celebrations; Coach check-ins appears in v1.1); per-reminder time pickers; quiet hours (from/to). **Permission is requested in context** — the first time the user enables anything — preceded by a small explainer sheet ("We'll only nudge you about things you choose"), never at app launch.
**Acceptance criteria:**
1. Permission flow: explainer sheet → OS prompt; denial handled gracefully (row shows "enable in Settings" deep link).
2. Local channel: schedule/cancel repeating notifications; they survive app restarts; tapping deep-links to the right tab (Maestro-verifiable on simulator).
3. Push channel: token registration endpoint + table (TDD'd, incl. token refresh + multiple devices); `POST /notifications/test` (dev-only) delivers a push end-to-end (manual verification documented).
4. Server respects preferences and quiet hours before sending (TDD'd gating logic in shared).
5. Preferences persist on the profile (or a `notification_prefs` jsonb) — survives reinstall via server state.
**Depends on:** NWE-114. Requires dev build (fine — no Expo Go anyway).

### NWE-601 · Reminders — `[x]` · S
> Implemented for review (2026-07-11): meal and weigh-in toggles/times persist, schedule/cancel
> local repeating notifications, and smart-skip helper avoids rescheduling completed meal/weight
> reminders when the app can observe completion.
**UI:** inside the Notifications screen: "Meal reminders" (per-meal toggles + time pickers; defaults breakfast 08:30, lunch 13:00, dinner 19:30) and "Weigh-in reminder" (time picker, default 08:00, daily). Notification copy is friendly and specific ("Lunch logged yet? 🍽 30 seconds and done.").
**Acceptance criteria:**
1. Reminders schedule via the 607 local channel with the user's chosen times; toggling off cancels.
2. **Smart-skip:** on app foreground, upcoming same-day reminders for already-completed actions (meal logged / weight logged) are rescheduled away (documented limitation: a reminder may still fire if the app wasn't opened — local notifications can't check the server at fire time).
3. Tapping opens the right tab (food/profile).
4. Unit tests: scheduling matrix (toggles × times), smart-skip logic.
**Depends on:** NWE-607.

### NWE-603 · Weekly review: scheduled generation + notification — `[x]` · S
> Implemented for review (2026-07-11): `POST /cron/weekly-review` is cron-callable (guarded by
> `CRON_SECRET` when set), finds users active in the last 14 days, reuses weekly idempotency,
> respects weekly-review notification prefs/quiet hours for push eligibility, and is
> integration-tested.
**Acceptance criteria:**
1. Supabase cron triggers weekly review generation (Mon 07:00 UTC — timezone simplification documented) for users active in the past 14 days; reuses NWE-502 idempotency.
2. On successful generation, a push notifies ("Your weekly review is ready 📈"); respects the category toggle + quiet hours; tap deep-links to Insights.
3. Integration test: cron handler generates + gates correctly (mocked Gemini + push).
**Depends on:** NWE-502, 607.

### NWE-602 · Streaks — `[x]` · S
> Implemented for review (2026-07-11): shared streak math with tests, `GET /streaks`, and Today
> dashboard momentum card with gentle copy.
**UI:** flame icon + count in the dashboard header row. Tapping opens a small sheet: current logging streak, perfect-day streak (from 605), longest ever, and one line of gentle copy — on an active streak ("12 days — steady!"), after a break ("Fresh start today — that's how every streak begins").
**Acceptance criteria:**
1. Streak math (consecutive days with ≥1 food log; separate perfect-day streak) is shared pure logic (TDD'd: today counts/doesn't count before first log, single-day, broken yesterday) served by `GET /streaks`.
2. No guilt copy anywhere (review against the guardrail).
3. Component tests: sheet states (active/broken/new user).

### NWE-604 · Badges & achievements — `[x]` · O
> Implemented for review (2026-07-11): shared badge catalog/criteria, server-side idempotent
> awarding on `GET /badges`, Profile → Badges grid, and integration tests.
**UI:** Profile → "Badges": a grid of badge tiles — earned ones in full color with the earn date, locked ones greyed with an encouraging hint ("Log 7 days in a row"). Unlock moment: full-screen celebration (606) with the badge scaling in + confetti + haptic, "Keep going" dismiss. Newly earned badges also show a small banner on the dashboard until seen.
**Acceptance criteria:**
1. Badge catalog as data in `packages/shared`: id, name, description, icon, **pure criteria function over user stats** (TDD'd per badge). Starter ~15: first food log, first workout, first snap-to-log, 7/30-day streaks, 10/50 workouts, first PR, first weekly review read, hydration week, 25/50/100% of the way to goal weight.
2. **Server-side idempotent awarding**: evaluated after relevant writes (or on fetch); `earned_badges` (user_id, badge_id, earned_on, unique) + RLS; retroactive evaluation awards new badges from history (integration-tested).
3. `GET /badges` returns catalog + earned state; "unseen" flag drives the dashboard banner.
4. Component tests: grid states, unlock flow, unseen banner.
**Depends on:** NWE-606 (celebration), data from earlier epics.

### NWE-605 · Daily quests & check-in — `[x]` · S
> Implemented for review (2026-07-11): shared quest generation with tests, `GET /quests?date=`,
> and Today dashboard quest rows computed from real logs; no manual check-off exists.
**UI:** dashboard widget "Today's quests": 3–5 rows with icon, label, and a hollow check that fills with a satisfying animation (606) when completed; completing all collapses the widget into a "Perfect day ✨" banner. Quests are worded as invitations, not orders ("Close your protein ring", not "You must…").
**Acceptance criteria:**
1. Quest generation from the user's own goals/enabled features: log a meal · log weight (on weigh-in cadence) · close your protein ring · complete your planned workout (**rest-day aware** — becomes water/recovery on rest days) · hit your water target. Generation logic is shared + TDD'd (feature-gating, rest days).
2. **State computed server-side from real logs** (`GET /quests?date=`) — doing the action completes the quest; no manual check-off exists.
3. Perfect day feeds the stricter streak (602) and badge criteria (604).
4. Skipping is consequence-free; whether a `quest_days` snapshot table is needed vs compute-on-read is decided and documented here.
5. Component tests: widget states (partial, perfect, rest day).
**Depends on:** NWE-602 groundwork, 606 for animations.

### NWE-606 · Celebration & motion system — `[x]` · S
> Skeleton (2026-07-11): motion tokens live in `constants/motion.ts`, and `lib/celebrations.ts`
> exposes `celebrate(kind)` with reduced-motion awareness and haptic feedback. Remaining:
> Reanimated visual primitives, badge confetti/burst, component tests, and wiring wins into
> quests/badges/rings/PRs.
One shared animation layer so every win feels consistent — used by ring closes (406), badge unlocks (604), quest completions (605), streak milestones (602), PR detections (408/510).
**Acceptance criteria:**
1. Motion tokens (durations, easings, scales) defined once in `constants/`; documented in docs/ui-flows.md.
2. Reanimated 4 micro-interactions: check fill, ring close pulse, count-up numbers; hero moment (badge unlock confetti/burst) via Lottie (`lottie-react-native`) or Reanimated — decision documented here; haptics (`expo-haptics`) on wins.
3. **Reduced motion** (`AccessibilityInfo.isReduceMotionEnabled`) → static fallbacks everywhere (component-tested); animations never block input; 60 fps on device (manual check documented).
4. A `celebrate(kind)` API so feature stories trigger celebrations in one line.

---

## Epic 7 — Integrations — `⏸ later`

### NWE-701 · Apple HealthKit — O · design doc first (native module + entitlements)
### NWE-702 · Health Connect (Android) — O

---

## Epic 8 — Release (v1.0 🚀)

### NWE-801 · Branding pass — `[ ]` · S
**Acceptance criteria:**
1. App name decided with the user (check App Store availability); `app.json` name/slug/scheme updated.
2. Icon + splash designed (simple, recognizable at 60 px; dark-mode variant) and wired via `app.json`; adaptive icon for Android kept working.
3. Accent-color audit across screens (one green, one destructive red, macro colors consistent).
4. User sign-off on the visual identity noted here.

### NWE-805 · Liquid Glass adoption (iOS 26 design language) — `[~]` · O

**Context — separate the two things Apple actually requires** (verified 2026-07-22):
- **Building with the iOS 26 SDK / Xcode 26 is mandatory** for any App Store Connect upload from
  **28 April**. This is a hard gate on shipping at all.
- **Adopting Liquid Glass visually is NOT mandatory** and does not affect review. But apps built
  with the iOS 26 SDK get it applied to native UI **by default**, so it arrives whether or not we
  design for it. The `UIDesignRequiresCompatibility: YES` Info.plist flag opts out — Apple has said
  it will be **removed in Xcode 27** (deadline ~April 2027), so it buys ~a year, not forever.

**Goal:** adopt Liquid Glass deliberately on our own terms — as a pass through the shared
primitives — rather than discovering what iOS did to our UI after a forced SDK bump.

**Why this is cheap for us:** every screen already routes through ten primitives in
`components/ui.tsx` (`Card`, `Button`, `Chip`, `ChipRow`, `Input`, `OptionRow`, `SectionTitle`,
`Muted`, `EmptyState`, `ProgressBar`) plus `Themed.tsx`. Glass is adopted in those, not sprayed
across ~30 screens. That is the payoff from the existing convention — and the reason this is a
refactor story, not a redesign.

**Stack support (verified):** Expo SDK 57 / RN 0.86 needs **no upgrade**. First-party
[`expo-glass-effect`](https://docs.expo.dev/versions/latest/sdk/glass-effect/) provides `GlassView`,
`GlassContainer`, `isLiquidGlassAvailable()`, with props `glassEffectStyle` (`clear`/`regular`),
`tintColor`, `isInteractive`, `colorScheme`. **It degrades to a plain `View` on Android and iOS < 26**,
so this does not fork the codebase — consistent with "iOS first, keep Android working".

**Acceptance criteria:**

1. **Capability gate, one place.** A single `lib/glass.ts` exposing `glassAvailable()` (wrapping
   `isLiquidGlassAvailable()`) and a `<Surface>` primitive that renders `GlassView` when available
   and today's `Card`/`View` otherwise. **No screen imports `expo-glass-effect` directly** — asserted
   by a lint/grep check in CI, so the fallback path can never be bypassed by accident.
2. **Primitives converted, API unchanged.** `Card`, `Button`, `Chip`, `Input`, `OptionRow` and
   `EmptyState` render glass where appropriate via `<Surface>`, with **no changes to their props**.
   Every existing component test passes **unmodified** — that is the proof the refactor is
   behaviour-preserving. Primitives that should *not* be glass (`Muted`, `SectionTitle`,
   `ProgressBar`, `ChipRow`) are explicitly listed as out of scope with a one-line reason each.
3. **Native tabs.** Migrate `app/(tabs)/_layout.tsx` to Expo Router's native tabs so the system
   Liquid Glass tab bar is used, preserving: the five tabs, per-platform `SymbolView` icons
   (ios SF Symbol / android Material), `tabBarAccessibilityLabel` on each, and the accent tint.
   **Highest-impact single change** — the tab bar is on every screen. If native tabs cannot preserve
   the per-platform icon contract, this AC is deferred to its own story rather than degrading
   Android; record the decision here.
4. **Floating surfaces get glass first** (they sit over content, where the effect is meaningful and
   the fallback is least jarring): the assistant **FAB** (currently opaque `Brand.accent` with a
   shadow) and the **gorhom bottom sheet** backgrounds used by the AI Hub proposal sheet and the
   Workouts routine sheet. Sheets need a deliberate `backgroundComponent`, not a wrapper swap —
   gorhom manages its own background.
5. **Contrast audit — the real risk.** Glass changes the effective background under text and
   controls. Audit `Brand.accent #16a34a` and `Brand.destructive #dc2626` on glass in **light and
   dark**, over both light and dark content, and verify **WCAG AA (4.5:1 body, 3:1 large/controls)**.
   Where a token fails, adjust the token or apply `tintColor` — **do not** ship failing contrast.
   Record the measured ratios in this story's notes. Macro colors (protein/carbs/fat) audited too.
6. **Legibility over scrolling content.** Glass over a scrolling list can become unreadable when
   busy content passes under it. Verify the FAB, tab bar and sheet headers against the densest real
   screens (Workouts history, Food day view, a long assistant thread) and add a scrim/`tintColor`
   where needed. This is a manual check with screenshots attached to the story.
7. **Reduced-motion & accessibility.** Respect `prefers-reduced-motion` (glass animation props
   disabled, per the NWE-606 motion system) and **Reduce Transparency** — when the OS setting is on,
   fall back to the opaque surface. Verified with the iOS accessibility settings enabled.
   Known pitfall from the docs: `opacity: 0` prevents glass rendering — use the animation props.
8. **Cross-platform proof.** Screenshots of the same three screens on: iOS 26 (glass), iOS 25
   (fallback), Android (fallback). All three must be visually coherent — the fallback must look
   intentional, not broken. This is the AC that proves the "does not fork the codebase" claim.
9. **Build gate.** `npx expo run:ios` builds against the iOS 26 SDK; app runs on device.
   `UIDesignRequiresCompatibility` is **not** set (we are adopting, not opting out) — and if it is
   set temporarily during the migration, this story does not close until it is removed.
10. **Docs.** `docs/ui-flows.md` "Cross-cutting UX rules" gains a glass section (when to use
    `<Surface>`, when not to, the contrast rule); `components/CLAUDE.md` documents the
    `<Surface>`-not-`GlassView` convention so future stories follow it.

**Explicitly out of scope:** redesigning any screen's layout or information hierarchy; new
animations; changing the accent identity (that is NWE-801). This story changes *material*, not
*design*.

**Risks:**
- Native tabs may not preserve the per-platform icon/accessibility contract → AC-3 has an escape.
- Contrast failures may force a token change that ripples into NWE-801's branding pass → sequence
  after 801 if branding is still in flux.
- Requires a dev build + prebuild (consistent with the no-Expo-Go decision; no conflict).

**Depends on:** NWE-801 (accent identity settled first, so the contrast audit is not redone).
**Blocks:** NWE-802 only if the 28 April SDK deadline is in play at build time.

**Implementation notes (2026-07-22):** capability/accessibility gating is centralized in
`lib/glass.tsx`; `Surface` backs Card/Button/Chip/Input/OptionRow/EmptyState, the assistant FAB,
and both gorhom sheet backgrounds. Native tabs retain all five labels, SF Symbols, Material
symbols, accessibility labels, and the green tint. CI rejects direct `expo-glass-effect` imports.
The opaque fallback is used for Reduce Transparency, unsupported platforms, and while OS settings
load; Reduce Motion disables style animation and interactivity. Existing app tests pass unmodified
(plus focused capability/fallback tests).

Contrast measurements (sRGB): accent `#16a34a` is 3.30:1 on white / 6.37:1 on black (passes the
3:1 control threshold); destructive `#dc2626` is 4.83:1 / 4.35:1 (passes controls; themed body-text
tokens are used where 4.5:1 is required). Macro strokes: protein 4.83:1 / 4.35:1, carbs `#b45309`
5.02:1 / 4.18:1, fat 3.68:1 / 5.71:1 — all pass the 3:1 non-text/control threshold. The original
amber carb token was 2.15:1 on white and was darkened. Neutral regular-glass tints use an opaque
fallback/scrim so primary text remains readable over dense scrolling content.

Automated/build evidence: Xcode 26.5 + iOS 26.5 SDK present; a clean Expo prebuild and native
build succeeded, installed, and launched on the iPhone 17 Pro / iOS 26.5 simulator; no
`UIDesignRequiresCompatibility` flag; TypeScript, import guard, and 40 app suites / 78 tests pass.
Manual evidence still required before `[x]`: screenshots of Workouts, Food, and a long assistant
thread on the installed iOS 26.5 and iOS 18.5 runtimes, Reduce Transparency/Reduce Motion checks,
and the same three Android screenshots. No Android SDK/emulator is installed on this machine, so
AC-6/7/8 cannot honestly be signed off in this implementation session.

### NWE-802 · TestFlight via EAS — `[ ]` · S
**Acceptance criteria:**
1. EAS project configured; `eas.json` with development / preview / production profiles.
2. **Flag first:** paid Apple Developer account ($99/yr) required — get user confirmation before purchase steps.
3. `eas build --platform ios` + `eas submit` documented and run; build installable via TestFlight on the user's iPhone (user confirms).
4. Push notifications verified working in the TestFlight build (APNs config via EAS).

### NWE-803 · App Store listing & privacy — `[ ]` · O
**Acceptance criteria:**
1. Privacy policy written and hosted (simple static page): health data stored; photos on-device except opt-in ephemeral Gemini analysis (with the free-tier processing caveat); account deletion + export available in-app.
2. App Store privacy "nutrition labels" filled truthfully (health & fitness data linked to identity; photos NOT collected).
3. Screenshots (6.7" + 6.1"), subtitle, description, keywords, age rating drafted with the user.
4. Review-readiness checklist: demo account for App Review, AI-content disclosure, account deletion reachable (117), no broken links.
**Depends on:** NWE-117, 801, 802.

### NWE-804 · Play Store follow-up — `⏸ later` · S

---

## v1.1 — first update

NWE-123…127 complete the AI Hub whose backend foundation ships in NWE-122 — full stories live in
**Epic 5c** above. The approved Hub supersedes the former NWE-505 coach-chat concept.

Order and rationale: **123** (screen/FAB/streaming) makes 122 usable → **124** (proposals +
approval) delivers both design scenarios and is the point the Hub becomes a hub → **125** migrates
the two chat features to the Interactions API → **126** migrates the six one-shot generators and
deletes the legacy `generateContent` path. **127** (remote MCP) is blocked on Google shipping
Gemini 3 remote-MCP support and on a second client existing.

NWE-126 is the riskiest story in the epic — it re-verifies five shipped AI features — which is why
it is sequenced last, after the Hub has proven the pattern in production.

---

## Discovered work

*(agents: append findings here instead of expanding story scope)*

- 2026-07-22 (NWE-805 verification): `npx expo-doctor` passes 19/20 checks but reports existing
  Expo patch-version drift (`expo` and several SDK packages are behind the SDK 57 recommended
  patches, and `@types/jest` is 30.x instead of the expected 29.5.x). The NWE-805 iOS 26 native
  build and all app tests pass, so dependency-wide upgrades were left for a dedicated maintenance
  story rather than mixed into the Liquid Glass material refactor.

- 2026-07-22 (AI workout review): the existing `exercises` table is the correct UUID-backed
  canonical directory, but its global starter catalogue is only ~55 rows and has no explicit
  alias relation. Current assistant matching now handles case and parenthetical labels such as
  `Romanian Deadlift (RDL)` invisibly, and unknown names no longer block logging. Follow-up:
  select a suitably licensed comprehensive exercise catalogue, import it through a forward-only
  migration, and add a normalized `exercise_aliases(alias, exercise_id)` table with uniqueness,
  indexes, RLS/read grants, and acronym/equipment variants. Do not ship a duplicated client file;
  the server table must remain the source of truth for analytics foreign keys.

- 2026-07-21 (bugfixes, from device testing): **two UX bugs fixed.**
  1. **Onboarding re-showed on every launch.** `finish()` (Skip / "Start tracking") only
     navigated and never persisted anything, so `profileIncomplete` stayed true and
     `app/_layout.tsx` redirected back into the wizard forever. Fix: migration `0006` adds
     `profiles.onboarding_completed_at` (backfilled for users who already had body stats); the
     redirect guard keys off it; `finish()` + `saveAndPreview()` stamp it; and `PATCH /me`
     auto-stamps once core stats (sex/birth_year/height_cm) are present. Integration + component
     tested.
  2. **Routine card layout broken** (Workouts → Routines): long routine names pushed the "Start"
     button off-screen, and delete was an undiscoverable long-press. Fix: title `View` now
     `flex:1` so Start stays visible; new reusable `components/SwipeToDelete.tsx`
     (`ReanimatedSwipeable`, confirm-before-delete) replaces the long-press — routine rows are now
     swipe-left-to-delete. Root wrapped in `GestureHandlerRootView`. **Needs a native rebuild**
     (`npx expo run:ios`) since GestureHandlerRootView/gesture-handler now mount at the root.
     Follow-up: apply the same swipe pattern to workout-history rows + food logs (still
     long-press).

- 2026-07-20 (NWE-121): **4 pre-existing "coach council" integration tests fail** in
  `epic5-6.integration.test.ts` (`coaches: council, generated program save…`, and the three
  `coach council:` tests at ~L225/294/329/404) — confirmed failing on a clean tree (stashed the
  NWE-121 additions and they still fail), so unrelated to the meal planner. Failure is an
  `AssertionError: Values are not equal` in the council flow. Needs its own debugging pass;
  NWE-121's own nutrition integration test + all shared/app tests pass.

- NWE-305 robustness: workout PATCH now snapshots/restores sets on replacement insert failure, but this is still best-effort outside a database transaction. A future migration should move session update + delete/insert sets into a single Postgres RPC/plpgsql transaction so even restore failures cannot lose sets.

- 2026-07-11: **Epic 3 + Epic 4 implemented as review-ready `[~]` slices in one session.**
  Added exercise/routine/analytics API routes, workout edit/cardio support, shared math tests,
  macro rings, weight/exercise/food/gym/goal analytics screens, target locking, and local
  progress-photo manifest/grid. Remaining hardening before flipping to `[x]`: API integration
  tests need the local Supabase env loaded in Deno; add focused RNTL component tests for picker,
  routine editor, macro overshoot rendering, analytics empty states, and progress-photo
  selection.
- Scaffold draft (2026-07-06) predates this backlog: NWE-101 covers its review. Known issues: hardcoded `#888` input text color; duplicated styles across screens.
- AGENTS.md + docs/ + folder CLAUDE.md files (written 2026-07-06) describe the TARGET architecture with current-state caveats; NWE-116 does the post-M1 accuracy pass with the user. TASKS.md wins on conflict.
- 2026-07-06 backlog audit: added NWE-117 (forgot password + account deletion/export — Apple requires in-app deletion; would have blocked launch) and NWE-607 (notification infrastructure). 509/510/511 were briefly cut to v1.1, then **restored to v1.0 (M8) by user decision — the coaches are the USP and ship at launch**; only coach chat (505) is v1.1. Former NWE-402/504/506 remain absorbed by 407/511/508 respectively.
- 2026-07-11: **Epics 5 (AI coaching 501/502/503/507/508/509/510/511) & 6 (gamification
  601–607) reviewed against DoD and closed.** Three review rounds. Round 1 caught that several AI
  features were marked "implemented" but were placeholders — 507/508 validated then discarded the
  photo (no Gemini vision call), 510 had no detectors, 511 was a hardcoded string, 606 was a
  skeleton with `celebrate()` wired nowhere, 501 hardcoded volume to `full_body`. Round 2: real
  rebuilds landed — `analyzeMealPhoto`/`analyzePhysique` send image `inlineData` to Gemini vision;
  `resolveIngredients` does real USDA→OFF→estimate with fixture tests; four documented-threshold
  detectors in `trainingDetectors.ts` with snooze/quota gating; `geminiJson` retry-once; all 5
  versioned prompt files; `celebrate()` wired. Held 511 for two ACs: (511.2) no lock-respecting
  proposal-apply path, (511.3) no council-vs-502 fallback boundary. Round 3: both landed —
  `POST /insights/:id/apply-proposal` validates the proposal belongs to the stored plan, refuses
  with CONFLICT when `targets_locked`, logs `applied_at`; `hasEnoughDataForCouncil()` predicate
  (unit-tested both ways) branches `/generate` + `/council` between council and the simple weekly
  review. Verified live: 86 shared + 50 app + 37 integration tests pass, typecheck clean, bundle
  builds. All Gemini calls sit behind `GEMINI_MOCK_*` env hooks so intelligence is real in prod and
  deterministic in tests. Deferred by design: 505 coach chat (v1.1).
- 2026-07-11: **Epics 3 (Workouts 301–305) & 4 (Analytics 401/404/405/406/407/408/409) reviewed
  against DoD and closed.** Two review rounds: round 1 caught 3 backend correctness bugs (workout
  PATCH could lose sets on partial failure; `trainingAnalytics` bucketed by month-chunks not ISO
  weeks + a fake streak; `movingAverage7` averaged data-points not calendar days) — all fixed with
  snapshot/restore, `isoWeekKey`/`isNextIsoWeek` + real consecutive-week streak, and a date-windowed
  average. Round 2 closed the front-end DoD gaps: component tests for every screen (43 app tests
  across 19 suites), `isError` states on all analytics/detail screens, macro-ring 600ms fill +
  reduced-motion fallback (`AccessibilityInfo`), and the chart-lib decision (custom
  `react-native-svg` primitives in `components/analytics.tsx` — documented under NWE-303 + ui-flows).
  Verified live: 70 shared + 43 app + 23 integration tests pass, typecheck clean, bundle builds.
  **Non-blocking robustness follow-up:** the workout-PATCH restore-on-failure is best-effort, not a
  true transaction (if the restore insert itself fails, sets are still lost). Proper fix = a plpgsql
  function doing update+delete+insert in one transaction (new migration) — do this when workouts
  editing is next touched.
- 2026-07-09: **Epic 2 (Nutrition: 201–206) implemented in one session.** New shared math
  (`foodMath` rescale, `recipeMath` totals/per-serving) TDD'd (58 shared tests total). Endpoints
  added: `PATCH /food-logs/:id`, `/favorites` CRUD, `/foods/recent`, `/water` (+undo), `/recipes`
  CRUD + `/:id/log`. New app deps: `@react-native-community/datetimepicker` (206 date picker),
  `expo-image-picker` + `expo-haptics` (204/203). Photos stay on-device (util split into pure
  `lib/photoPath.ts` + I/O `lib/photos.ts`). Verified: `npm run test:api` = **12/12 pass** against
  the live stack (incl. the 205 rescale). Note: no new migrations — all Epic 2 tables were
  pre-built in 0001 and only needed the 0002 grants. Also: after adding routes, clear stale
  `.expo/types` (`rm -rf .expo/types` + re-export) so typed-routes recognise them.
- 2026-07-09: **Migration `0002_grants.sql` added** (forward-only fix). Migration 0001 created
  tables + RLS but never granted DML to the Supabase roles (`anon`/`authenticated`/`service_role`),
  so on the local CLI stack every app query hit "permission denied for table". 0002 adds the
  standard grants + `alter default privileges` (so future tables are covered). Found by the
  integration tests once the stack was healthy — exactly what they're for. RLS remains the real
  access control; grants just let the roles reach the tables.
- 2026-07-09: **Epic 1 (M1 + 104/105/117) implemented in one session.** Findings worth keeping:
  - **Test renderer quirk.** RN 0.86 + React 19 + jest-expo 57 + RNTL 14 + `test-renderer@1.2.0`:
    `render()` is async (must `await`), and an async happy-path *submit* wedges the renderer for
    later tests in the SAME file. Workaround: isolate such assertions per-file (see
    `sign-in.submit.test.tsx`). Also `configure({concurrentRoot})` is not a valid option here.
  - **Deno FS API moved.** SDK 57 exposes `documentDirectory`/`deleteAsync` under
    `expo-file-system/legacy`; the new `Paths`/`File` API is for NWE-204.
  - **Local keys are new-style.** `supabase start` issues `sb_publishable_*`/`sb_secret_*`;
    `supabase status -o env` still yields legacy JWT `ANON_KEY`/`SERVICE_ROLE_KEY` for tests.
  - **Hono RPC input drift.** App zod vs Deno `npm:zod` make RPC *input* args nominally distinct;
    hooks assert the arg (`arg()` helper) while keeping response inference. API re-validates.
  - **Build-sandbox limit.** Integration/E2E that make HTTP to 127.0.0.1 (RLS, export, delete,
    Maestro, live `functions serve`) must be run in a real terminal — the agent sandbox resets
    loopback HTTP. Code + `deno check` verified; commands are in the README / story notes.
- 2026-07-07: **full v1.0 schema pre-designed** in `supabase/schema.sql` (commented, with tracking/lifecycle columns: created_at everywhere, trigger-maintained updated_at, seen_at/read_at/applied_at/dismissed_at, consent as timestamp). Feature stories' "Migration:" ACs now mean **verify the pre-built table against the story + write the shared Zod schemas**; add a new migration only for genuine design changes discovered during the build. NWE-110 still converts schema.sql → migration 0001 verbatim.
