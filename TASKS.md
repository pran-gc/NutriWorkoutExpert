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
- **AI:** free-tier Gemini, called only from the backend. API keys live in Edge Function secrets.
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

**After v1.0:** coach chat (505 — quota-hungry, needs the council live first), barcode scan
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
| M9 | Release — **v1.0 launch** | NWE-117, 801, 802, 803 |
| v1.1 | — | NWE-505 (coach chat) |
| Later | — | NWE-207, 306, 403, 701, 702, 804 |

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
Free-form chat with the council, grounded in user aggregates; quota-hungry, needs guardrails and the council live first. Depends on 511.

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

NWE-505 (coach chat) once the council is live and quota behavior under real usage is known.

---

## Discovered work

*(agents: append findings here instead of expanding story scope)*

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
