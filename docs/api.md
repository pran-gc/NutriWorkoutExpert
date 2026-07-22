# API architecture

> Target-state document (built by NWE-113/114; endpoints beyond those arrive with their
> feature stories). The API is a single **Hono** app deployed as the Supabase Edge Function
> `api`, source in `supabase/functions/api/`.

## Conventions (every endpoint follows these)

1. **Auth**: every route except `GET /health` sits behind `authMiddleware`, which
   - verifies the `Authorization: Bearer <supabase JWT>` header,
   - rejects with `401 UNAUTHENTICATED` otherwise,
   - injects into context: `user` (id, email) and `db` — a Supabase client created
     **with the caller's JWT** so Postgres RLS stays enforced (defense in depth).
     The service-role client is a separate, explicitly-named escape hatch used only where
     genuinely required.
2. **Validation**: request bodies/queries/params are parsed with **Zod schemas imported from
   `packages/shared`** (never redefined locally). Invalid input → `400 VALIDATION_ERROR`
   with field details. Handlers receive typed, parsed data only.
3. **Response envelope** (defined in `packages/shared`):
   ```ts
   // success                          // failure
   { data: T }                         { error: { code: ErrorCode, message: string, details?: unknown } }
   ```
   `ErrorCode`: `UNAUTHENTICATED` (401) · `FORBIDDEN` (403) · `NOT_FOUND` (404) ·
   `VALIDATION_ERROR` (400) · `CONFLICT` (409) · `UPSTREAM_ERROR` (502, third party failed) ·
   `RATE_LIMITED` (429) · `INTERNAL` (500). Handlers never leak raw DB/upstream errors.
4. **Typed client**: the app consumes the API through Hono RPC (`hc<AppType>`) wrapped in
   `lib/api.ts`, which attaches the current session token and unwraps the envelope. A contract
   change that isn't reflected on both sides fails `tsc`.
5. **TDD**: route logic is written test-first — unit tests for pure logic (Vitest), integration
   tests against the local Supabase stack for the full route (auth, validation, RLS, persistence).
   See [testing.md](testing.md).
6. **Dates**: day-scoped resources use `logged_on` = `YYYY-MM-DD` in the device's local time
   (client computes it — the server never guesses timezones). Timestamps are ISO 8601 UTC.
7. **Naming**: kebab-case paths, plural nouns, no verbs except explicit actions
   (`/insights/generate`).

## Endpoint catalog

Status: ✅ exists · 🔜 M1 (NWE-113/114) · 🚧 arrives with its feature story.

### Core
| Method & path | Story | Notes |
|---|---|---|
| 🔜 `GET /health` | 113 | public; returns version + uptime |
| 🔜 `GET /me` | 113 | profile of the caller |
| 🔜 `PATCH /me` | 114 | update profile; recomputes targets server-side (shared logic) unless `targets_locked` |
| 🚧 `GET /me/export` | 117 | full JSON bundle of ALL user rows (table registry keeps it complete) |
| 🚧 `DELETE /me` | 117 | account deletion (admin client; cascades verified per table) — App Store requirement |

### Weight & body
| Method & path | Story | Notes |
|---|---|---|
| 🔜 `PUT /weights/:date` | 114 | upsert (one per day) |
| 🔜 `GET /weights?from&to` | 114 | for trend chart (NWE-401 adds moving average from shared logic) |
| 🚧 `POST /measurements`, `GET /measurements?kind` | 403 | later |

### Food
| Method & path | Story | Notes |
|---|---|---|
| 🔜 `GET /food-logs?date=` | 114 | day's entries + computed totals |
| 🔜 `POST /food-logs` | 114 | manual or from-search entry (denormalized macros) |
| ✅ `GET /food-logs/totals?date=` | 130 | macro totals plus ingredient-derived nullable micronutrients, partial flags, and approximate provenance |
| 🔜 `PATCH /food-logs/:id` · `DELETE /food-logs/:id` | 114/205 | edit rescales macros server-side |
| 🔜 `GET /foods/search?q=` | 114 | proxies Open Food Facts (normalized per-100g), caches hot queries |
| ✅ `POST /foods/analyze-photo` | 508 | ephemeral photo → validated dish candidates + ingredients + quantities |
| ✅ `POST /foods/resolve` | 508 | ingredients → macros, unresolved rows flagged as AI estimates |
| 🚧 `GET /foods/recent` | 201 | last 20 distinct logged foods |
| 🚧 `GET/POST/DELETE /favorites` | 201 | |
| 🚧 `GET/POST/PATCH/DELETE /recipes` | 202 | items nested; totals computed in shared logic |
| 🚧 `GET /water?date=` · `POST /water` · `DELETE /water/last?date=` | 203 | totals + undo |

### Nutrition (AI meal planner)
| Method & path | Story | Notes |
|---|---|---|
| ✅ `POST /nutrition/plan` | 121 | nutritionist plans one day: `{date}` → `{plan, insight_id}`. Full context (targets + training-day awareness from routines/sessions + logged-food continuity + dietary/coaching profile/memory). Draft stored in `insights` (kind `nutrition`); 3/day quota |
| ✅ `POST /nutrition/plan/refine` | 121 | chat-to-edit over a plan draft: `{insight_id, message}` → `{reply, updated_plan?}`; last-8-turn history, ≤20 turns/draft; cross-user 404 |
| ✅ `POST /nutrition/plan/log-meal` | 121 | "I had this": `{insight_id, meal_index, logged_on}` inserts one `food_logs` row with the planned meal's macros |

### Workouts
| Method & path | Story | Notes |
|---|---|---|
| 🔜 `GET /workout-sessions?from&to` | 114 | with nested sets |
| 🔜 `POST /workout-sessions` | 114 | session + sets in one call (transactional) |
| 🔜 `PATCH /workout-sessions/:id` · `DELETE …/:id` | 114/305 | |
| ✅ `GET /exercises?q=` · `POST /exercises` | 301 | global seed + user's custom |
| ✅ `GET /exercises/:id/history` | 303 | best set + volume per session, for charts |
| ✅ `GET/POST/PUT/DELETE /routines` | 302 | `GET /routines/:id/prefill` returns exercises + last session's numbers |
| ✅ `POST /routines/generated/refine` | 120 | chat-to-edit over a program draft: `{insight_id, message}` → `{reply, updated_program?}`; ≤20 turns/draft |
| ✅ `POST /routines/generate` | 509 | AI program from setup Q&A → strict JSON mapped to library IDs |
| ✅ `POST /routines/generated/save` | 509 | writes generated days as normal editable routines |
| ✅ `POST /routines/:id/adapt` | 510 | coach adjustment diff (user approves before apply) |
| ✅ `POST /routines/:id/apply-diff` | 510 | logs an approved training adjustment |

### Analytics (pre-aggregated server-side; math in `packages/shared`, TDD'd)
| Method & path | Story | Notes |
|---|---|---|
| ✅ `GET /analytics/food?from&to` | 407 | adherence per day, macro splits, meal-type split, top foods |
| ✅ `GET /analytics/training?from&to` | 408 | weekly volume by muscle group, consistency, PR feed (e1RM), cardio |
| ✅ `GET /analytics/goal` | 409 | weight projection + ETA, pace vs plan, adherence↔progress series |

### Engagement & notifications
| Method & path | Story | Notes |
|---|---|---|
| ✅ `GET /quests?date=` | 605 | quest list + completion computed server-side from real logs |
| ✅ `GET /badges` | 604 | starter catalog + earned state; awarding is idempotent, evaluated server-side |
| ✅ `GET /streaks?date=` | 602 | food logging streak (perfect-day streak still pending) |
| ✅ `POST /notifications/tokens` | 607 | Expo push-token registration (multi-device/token refresh via token upsert) |
| ✅ `GET/PATCH /notifications/prefs` | 607 | categories + quiet hours persisted on profile |
| ✅ `POST /notifications/test` | 607 | dev-only push eligibility check |
| ✅ `POST /cron/weekly-review` | 603 | cron-callable weekly review generation, guarded by `CRON_SECRET` when set |

### Insights (AI)
| Method & path | Story | Notes |
|---|---|---|
| ✅ `GET /insights/weekly-summary?week=` | 501 | aggregate JSON only, no LLM |
| ✅ `POST /insights/generate` | 502/511 | sparse users get the simple weekly review; data-rich users get the council plan |
| ✅ `GET /insights` | 503 | list stored reviews / physique feedback |
| ✅ `POST /insights/physique/analyze` | 507 | base64 photos accepted ephemerally; requires recorded consent; stores text only |
| ✅ `POST /insights/council` | 511 | same sparse/data-rich boundary as generate; returns weekly fallback or council plan |
| ✅ `POST /insights/:id/apply-proposal` | 511 | explicitly applies an approved council target diff; refuses locked targets; stamps `applied_at` |
| ✅ `DELETE /insights/:id` | 503/507 | deletes a generated insight/feedback row |

### Agentic assistant
| Method & path | Story | Notes |
|---|---|---|
| ✅ `POST /assistant/chat` | 122–132 | `{thread_id?, message}` → SSE (`thought`, `function_call`, `text`, `proposal`, `done`, `error`); `proposal` includes the resolved artifact for immediate inline-card rendering; read + proposal tool loop, daily quota |
| ✅ `GET /assistant/threads` | 122 | newest-first thread summaries, maximum 50 |
| ✅ `GET /assistant/threads/:id` | 122 | resume one owned thread with up to 200 persisted messages and tool traces |
| ✅ `POST /assistant/proposals/:id/apply` | 124/128–132 | optional edited `{proposal}` snapshot; owned, revalidated, idempotent approval for program/meal/food/workout/recipe/target proposals |
| ✅ `POST /assistant/proposals/:id/save-recipe` | 131 | independently saves a rich food proposal as a reusable recipe without logging it |
| ✅ `POST /assistant/proposals/:id/dismiss` | 124 | stamps an owned proposal dismissed without changing or closing its thread |

Assistant tool inputs are closed contracts. Every object—including nested program exercises,
planned meals, food ingredients, nutrient values, workout sets, recipes, and target changes—has
explicit properties and rejects undeclared keys. Genuine alternatives are declared as bounded
unions rather than accepted as arbitrary objects. Gemini uses validated tool choice, and the API
revalidates every call with the corresponding strict Zod schema before reading data or creating an
approval-only proposal artifact.

## Hono app structure

```
supabase/functions/api/
  index.ts            # entrypoint: mounts middleware + routers, exports AppType
  middleware/
    auth.ts           # JWT verify → user + user-scoped db client in context
    error.ts          # catch-all → error envelope, logging
  routes/
    health.ts  me.ts  weights.ts  food-logs.ts  foods.ts  workouts.ts
    exercises.ts  routines.ts  insights.ts  assistant.ts  gamification.ts  notifications.ts  cron.ts  water.ts ...
  services/           # logic with I/O (db queries, gemini.ts, openfoodfacts.ts)
```

Rules of thumb: **pure logic goes to `packages/shared`** (unit-testable everywhere),
**I/O logic goes to `services/`** (integration-tested), **routes stay thin**
(validate → call service → wrap envelope). Deno runtime: npm imports via `npm:` specifiers;
never import Node-only APIs.

## Third-party proxying

- **Open Food Facts** — proxied so the client never calls third parties; API sets a proper
  `User-Agent`, tolerates upstream flakiness (`UPSTREAM_ERROR`), and may cache popular queries.
- **Gemini** — key lives in Edge Function secrets. One-shot routes send aggregates or ephemeral
  photos. The agentic assistant can pull capped, PII-free rows through RLS-scoped read tools;
  emails and photos are unavailable and no tool can write. Prompts/instructions are versioned.
  See [ai.md](ai.md).
