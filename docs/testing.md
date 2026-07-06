# Testing & TDD

> The harness is built by NWE-111; every later story follows this document.
> Decision (locked): **full pyramid including E2E**, with domain/API logic written test-first.

## The pyramid

```
        ▲  E2E (Maestro, iOS simulator — Mac only)     few, critical paths
       ▲▲  Integration (API routes vs local Supabase)  per endpoint
     ▲▲▲▲  Unit (Vitest / jest-expo + RNTL)            many, fast, most logic lives here
```

| Level | Tooling | What it covers | Where |
|---|---|---|---|
| Unit — domain | **Vitest** | pure logic in `packages/shared`: nutrition math, macro scaling, moving averages, streaks, weekly aggregation, recipe totals, pace | `packages/shared/**/*.test.ts` |
| Unit — API logic | **Vitest** | route handlers' pure parts, prompt builders, normalizers (Open Food Facts mapping) | alongside API source |
| Unit — app | **jest-expo + React Native Testing Library** | component behavior: forms validate, lists render states, panels open; TanStack Query hooks with mocked API client | `app/**`, `components/**` `*.test.tsx` |
| Integration | Vitest + **local Supabase stack** (Docker, `supabase start`) | full HTTP route: auth rejection, Zod validation, RLS actually blocking cross-user access, persistence, envelopes | `supabase/functions/api/**/*.integration.test.ts` |
| E2E | **Maestro** flows | sign in → log food → dashboard total updates; log workout; (later) generate insight | `.maestro/*.yaml` |

## TDD workflow (per story)

1. **Red** — from the story's acceptance criteria, write failing tests first:
   domain rules → shared unit tests; endpoint behavior → integration tests
   (happy path + auth + validation + the story's edge cases).
2. **Green** — implement the minimum to pass. Schema change first (migration), then shared
   schemas/logic, then service + route, then UI.
3. **Refactor** — with tests green; keep routes thin (validate → service → envelope).
4. UI component tests may be written after the component (test-after is acceptable for UI
   **only** — never for domain/API logic).
5. Extend a Maestro flow **only if** the story touches a critical path.

Hard rules for agents:
- A bugfix starts with a test reproducing the bug.
- Never weaken/delete a failing test to get green without documenting why in the PR/commit.
- Integration tests get fresh fixtures per test (seed helpers + cleanup); no order dependence.
- Every RLS-protected table gets at least one "user B cannot read user A's rows" test.

## Commands (canonical once NWE-111 lands)

```bash
npm run test            # all unit (Vitest + jest-expo)
npm run test:unit       # Vitest only (shared + api logic)
npm run test:app        # jest-expo + RNTL
npm run test:int        # integration — requires `supabase start` (Docker)
npm run test:e2e        # maestro test .maestro/  — Mac + simulator only
npx tsc --noEmit        # typecheck, part of Definition of Done
```

## CI (GitHub Actions, NWE-111/115)

| Trigger | Jobs |
|---|---|
| every push / PR | typecheck → unit tests → integration tests (Supabase CLI spins up the stack in CI) |
| push to `main` | + deploy migrations & functions to the hosted project (NWE-115) |
| E2E | **not in CI** (macOS runners are expensive) — run manually on the Mac mini before releases; documented as a deliberate trade-off |

## Environments for tests

- Unit tests: no network, no Docker — pure.
- Integration: **local stack only** (`supabase start`), never the hosted project.
- Gemini in tests: mocked at the service boundary (`services/gemini.ts`); prompt-builder logic
  is unit-tested; a manual smoke test against the real free-tier API happens in the AI stories.
- Open Food Facts: mocked in unit/integration; the normalizer is tested against recorded
  fixture responses.
