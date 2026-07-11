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
| 🔜 `PATCH /food-logs/:id` · `DELETE /food-logs/:id` | 114/205 | edit rescales macros server-side |
| 🔜 `GET /foods/search?q=` | 114 | proxies Open Food Facts (normalized per-100g), caches hot queries |
| ✅ `POST /foods/analyze-photo` | 508 | ephemeral photo → validated dish candidates + ingredients + quantities |
| ✅ `POST /foods/resolve` | 508 | ingredients → macros, unresolved rows flagged as AI estimates |
| 🚧 `GET /foods/recent` | 201 | last 20 distinct logged foods |
| 🚧 `GET/POST/DELETE /favorites` | 201 | |
| 🚧 `GET/POST/PATCH/DELETE /recipes` | 202 | items nested; totals computed in shared logic |
| 🚧 `GET /water?date=` · `POST /water` · `DELETE /water/last?date=` | 203 | totals + undo |

### Workouts
| Method & path | Story | Notes |
|---|---|---|
| 🔜 `GET /workout-sessions?from&to` | 114 | with nested sets |
| 🔜 `POST /workout-sessions` | 114 | session + sets in one call (transactional) |
| 🔜 `PATCH /workout-sessions/:id` · `DELETE …/:id` | 114/305 | |
| ✅ `GET /exercises?q=` · `POST /exercises` | 301 | global seed + user's custom |
| ✅ `GET /exercises/:id/history` | 303 | best set + volume per session, for charts |
| ✅ `GET/POST/PUT/DELETE /routines` | 302 | `GET /routines/:id/prefill` returns exercises + last session's numbers |
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

## Hono app structure

```
supabase/functions/api/
  index.ts            # entrypoint: mounts middleware + routers, exports AppType
  middleware/
    auth.ts           # JWT verify → user + user-scoped db client in context
    error.ts          # catch-all → error envelope, logging
  routes/
    health.ts  me.ts  weights.ts  food-logs.ts  foods.ts  workouts.ts
    exercises.ts  routines.ts  insights.ts  gamification.ts  notifications.ts  cron.ts  water.ts ...
  services/           # logic with I/O (db queries, gemini.ts, openfoodfacts.ts)
```

Rules of thumb: **pure logic goes to `packages/shared`** (unit-testable everywhere),
**I/O logic goes to `services/`** (integration-tested), **routes stay thin**
(validate → call service → wrap envelope). Deno runtime: npm imports via `npm:` specifiers;
never import Node-only APIs.

## Third-party proxying

- **Open Food Facts** — proxied so the client never calls third parties; API sets a proper
  `User-Agent`, tolerates upstream flakiness (`UPSTREAM_ERROR`), and may cache popular queries.
- **Gemini** — key lives in Edge Function secrets; only aggregates or ephemeral photos are sent
  (never raw logs, never emails); every AI feature has a versioned prompt in the repo.
  See [ai.md](ai.md).
