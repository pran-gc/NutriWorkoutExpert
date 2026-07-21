# NWE-122 · The AI Hub — agentic assistant

**Status:** design approved 2026-07-21 · **Epic:** 5c (new) · **Supersedes:** NWE-505 (coach chat, v1.1)

A magic FAB opens a full-screen assistant. An agentic LLM with tool access reads the user's
real data on demand, reasons over it, and *proposes* changes the user approves in a bottom
sheet. One hub where the AI can drive the whole app — safely.

---

## 1. Why this exists

Today every AI feature is a one-shot pipeline: fixed aggregate in → fixed JSON out. The user
cannot ask a follow-up, cannot request a drill-down, and each new capability needs a new
endpoint + prompt + screen. The hub inverts that: **one conversation, many tools**, and every
new capability is a new tool in a registry rather than a new vertical slice.

Two scenarios define done:

**S1 — Workout advice.** "How can I improve my workouts?" → assistant pulls trends, drills into
a date range if useful, gives advice, and proposes a concrete program revision. User taps the
card → bottom sheet → **Approve** (writes real routines) or swipe down and keep talking.

**S2 — Nutrition.** "What should I eat today?" → assistant pulls targets, dietary profile,
today's logs and training context → proposes a meal. **Or** "I ate chicken, rice and broccoli"
→ assistant resolves macros → proposes prefilled food-log rows → user approves → logged.

---

## 2. Decisions locked in brainstorming (do not re-litigate)

| Decision | Choice | Rationale |
|---|---|---|
| Ambition | **Full agentic**, quota is an ops problem | Capability over cost; revisit tiering later |
| Write authority | **Reads free, every write is a proposal** | Model *cannot* mutate data — safety property, not a policy |
| Scope | **Both scenarios in one epic** | They share one engine, registry and approval UI |
| Loop location | **Server-side in Hono**, streamed to app | Secrets stay server-side; app stays thin |
| API | **Gemini Interactions API** (GA Jun 2026) | `generateContent` is legacy; Interactions is the agentic path |
| Model | **Gemini 3.x** (`gemini-3.6-flash` class) | Native thinking measurably improves function calling |
| Tools | **MCP-shaped registry, executed in-process** | Cheaper, faster, more private *and* unlocks Gemini 3.x |
| Migration | **Hub first, then migrate existing AI features** | Prove the pattern before touching working features |

### Reversal of two Epic 5b decisions — recorded deliberately

Epic 5b locked *"chat is artifact-scoped, not open-ended"* and *"aggregates in, text out — the
LLM never sees raw logs."* **This epic reverses both.** The hub is open-ended, and tool calling
means the model pulls scoped raw rows on demand. This is an owner decision made 2026-07-21, not
drift. Mitigations: tools return **scoped, capped, PII-free** payloads (§6.3); the model never
sees emails, IDs of other users, or photos.

### Why not remote MCP (yet)

Remote MCP **does not support Gemini 3.x** ("coming soon"; works on `gemini-3.5-flash` /
Managed Agents), requires **Streamable HTTP** (not SSE), and would mean exposing a public,
per-user-authenticated endpoint to Google's sandbox — a materially larger attack surface that
cuts against the app's privacy posture. In-process is cheaper (identical token cost, far lower
latency, no second deployable), more private, and lets us use the better model. The registry is
**MCP-shaped so it lifts out unchanged** when the platform catches up → **NWE-127**.

---

## 3. Architecture

```
App  app/assistant.tsx  ◄── magic FAB (all tabs)
  │  POST /assistant/chat { thread_id?, message }
  │  ◄════ SSE: thought · function_call · text delta · proposal · done
  ▼
Hono  routes/assistant.ts
  │
  ├─ services/agent/loop.ts ──► Gemini Interactions API (stream:true)
  │     • tools + system_instruction re-sent every turn (interaction-scoped)
  │     • thread continuity via previous_interaction_id
  │     • hard step cap · structured per-step logging · timeout budget
  │
  └─ services/agent/registry.ts   MCP-shaped defs {type,name,description,parameters}
        ├─ kind:'read'      → existing services, user-JWT db client (RLS enforced)
        └─ kind:'proposal'  → NEVER executes; returns a Proposal artifact
```

**The core safety inversion.** Tools are declared with `kind`. The loop's dispatcher has
**no code path that mutates**: `read` tools call services; `proposal` tools only validate args
and return an artifact. Approval happens later, through **existing, already-tested endpoints**,
triggered by a user tap. Prompt injection or hallucination therefore cannot write to the DB.

---

## 4. Data model

Reuse `insights` — it already has `payload`, `applied_at`, `dismissed_at`, `model`,
`prompt_version`. No parallel proposal concept.

**Migration `0007_assistant.sql`:**

```sql
-- Threads: one row per conversation.
create table public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,                                  -- derived from first user message
  last_interaction_id text,                    -- Gemini previous_interaction_id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assistant_threads enable row level security;
create policy assistant_threads_own on public.assistant_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index assistant_threads_user_idx
  on public.assistant_threads (user_id, updated_at desc);

-- Messages: user + assistant turns, plus the tool trace for transparency.
create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '',
  tool_trace jsonb,        -- [{name, args_preview, ms, ok}] — user-visible "what I looked at"
  proposal_insight_id uuid references public.insights(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.assistant_messages enable row level security;
create policy assistant_messages_own on public.assistant_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index assistant_messages_thread_idx
  on public.assistant_messages (thread_id, created_at);

-- Proposals live in insights.
alter table public.insights drop constraint insights_kind_check;
alter table public.insights add constraint insights_kind_check
  check (kind in ('weekly','council','physique','training','checkin','nutrition','assistant'));
```

**Retention/privacy.** `store=true` is required for `previous_interaction_id`; Google retains
interactions **1 day (free) / 55 days (paid, configurable down to 7)**. Set the **minimum**
retention the tier allows, disclose it in-app, and **never** send photos or emails to the hub.
`docs/ai.md` gets a section stating this plainly.

---

## 5. Functional requirements

### FR-1 Entry point
Magic FAB on all five tabs, above the tab bar, respecting safe-area. Opens `app/assistant.tsx`.
Long-press → recent threads. Honours reduced-motion (NWE-606 tokens).

### FR-2 Conversation
Streaming replies. Live progress reflecting real steps: *"Thinking…"* (`type:'thought'`),
*"Looking at your workout trends…"* (`type:'function_call'`, humanised per tool). Markdown via
existing `MarkdownText`. Threads persist and are resumable; empty/loading/error states per the
cross-cutting UX rules.

### FR-3 Transparency
Each assistant message can expand a **"What I looked at"** trace listing tools called (friendly
name + params + latency). Non-negotiable for trust: the model reads real data, the user sees
exactly what.

### FR-4 Proposals & approval
A `proposal` tool emits a card in-thread (title + human summary + diff). Tap → **gorhom bottom
sheet** with full detail. **Approve** → calls the existing endpoint, stamps `insights.applied_at`,
confirms in-thread. **Swipe down** → dismissed but *retained* in the thread; conversation
continues (explicitly per user's S1 description). Proposal payloads are Zod-validated in
`packages/shared` **before** rendering and **again** before applying.

### FR-5 Safety & limits
Per-message step cap (default 6, hard max 10) — on exceed, stop and answer with what's known.
Daily message quota (default 50, env-tunable). Total loop budget ≤ 45 s → `background=true`
fallback beyond. All copy body-neutral, no medical claims. Allergies remain absolute in any
nutrition proposal.

---

## 6. Technical requirements

### 6.1 Tool declaration (verified shape)
```ts
export interface ToolDef<A = unknown> {
  type: 'function';
  name: string;
  description: string;                 // include WHEN to call it
  parameters: JSONSchema;              // object/properties/required
  kind: 'read' | 'proposal';
  args: z.ZodType<A>;                  // server-side validation, never trust the model
  run(ctx: ToolCtx, args: A): Promise<unknown>;   // read: data · proposal: artifact
}
```
Registry is a `Record<string, ToolDef>`; adding a capability = adding one entry. `tool_choice`
defaults to `auto`; `validated` mode used for proposal tools to enforce schema adherence.

### 6.2 Loop contract
1. `POST /v1beta/interactions` — `{model, input, tools, generation_config, stream:true}`; on
   continuation `previous_interaction_id` (tools + system_instruction **re-sent**, they are
   interaction-scoped).
2. Consume SSE: `interaction.created` → `step.start` / `step.delta` / `step.stop` →
   `interaction.completed`. Aggregate `arguments_delta` fragments before parsing.
3. On `function_call`: validate args with Zod → dispatch → return
   `{type:'function_result', name, call_id, result:[{type:'text',text:JSON}]}`.
4. **Parallel calls**: execute independent reads with `Promise.all`, return all results together.
5. Repeat to the step cap. Unknown event types are **logged and skipped**, never thrown.
6. Thought signatures are handled automatically for Gemini 3 — do not strip them.

### 6.3 Tool catalogue (v1)

*Read* — `get_profile_and_targets` · `get_workout_trends{days}` ·
`get_workouts{from,to,limit}` · `get_exercise_history{exercise_id}` · `get_routines` ·
`get_food_logs{date|from,to}` · `get_nutrition_trends{days}` · `get_weight_trend{days}` ·
`get_coach_memory` · `search_foods{q}` · `resolve_macros{items[]}`

*Proposal* — `propose_program_revision{routine_id, days[]}` ·
`propose_meal_plan{date, meals[]}` · `propose_food_logs{logged_on, entries[]}` ·
`propose_target_change{calories,protein_g,carbs_g,fat_g,rationale}`

Every read tool: **row cap** (≤200), **date-range cap** (≤365 d), returns **no** emails/user
IDs/photos. Reads use the request's user-JWT client so **RLS is the boundary**.

### 6.4 Client streaming
**`expo/fetch`** (verified: exposes `ReadableStream` + `getReader()`; `TextDecoderStream`
available in `expo/winter`). No new dependency. `lib/api.ts` gains `streamSSE()` that yields
parsed events; the screen renders from a reducer over them. Graceful degradation: if streaming
fails, fall back to a non-streamed request.

### 6.5 Observability
Every step logged structured: `{thread_id, step, tool, args_preview, ms, ok, tokens}`. Persist
the trace to `assistant_messages.tool_trace` (powers FR-3 and debugging bad advice).

### 6.6 Testing
- **Shared (Vitest, TDD):** all proposal payload schemas; tool arg schemas; SSE event-parser
  (fixtures incl. split `arguments_delta`, unknown events, mid-stream error).
- **API (Deno integration):** mocked Interactions transport (`GEMINI_MOCK_INTERACTION_SEQUENCE`)
  driving multi-step loops; step-cap enforcement; **write tools never mutate**; cross-user 404s;
  RLS proven per new table; quota enforcement.
- **App (RNTL):** FAB opens hub; streaming renders progressively; proposal card → sheet →
  approve calls the right mutation; swipe-down keeps the thread; trace expands.
- **E2E (Maestro):** S1 and S2 end-to-end against mocked AI.

---

## 7. Acceptance criteria

**AC-1 Migration.** `0007_assistant.sql` creates both tables with RLS + indexes and extends
`insights_kind_check` with `'assistant'`. Cross-user isolation integration-tested per table.

**AC-2 Registry.** `services/agent/registry.ts` exposes MCP-shaped defs. Each tool has a Zod
arg schema, `kind`, and a row/range cap. Unit test asserts **every `kind:'proposal'` tool
performs zero writes** (dispatcher has no mutation path).

**AC-3 Loop.** `services/agent/loop.ts` runs the Interactions loop with `stream:true`,
continues via `previous_interaction_id`, aggregates `arguments_delta`, executes parallel reads
concurrently, enforces the step cap, and skips unknown events. Integration-tested with a mocked
multi-step sequence (read → read → text) and a cap-exceeded sequence.

**AC-4 Endpoint.** `POST /assistant/chat` streams SSE: `thought`, `function_call`, `text`,
`proposal`, `done`, `error`. Auth required; RLS-scoped; validated with shared Zod. Daily quota
returns `RATE_LIMITED` with friendly copy. `GET /assistant/threads`, `GET /assistant/threads/:id`
list and resume.

**AC-5 Proposals.** Each proposal kind is Zod-validated, stored as `insights(kind='assistant')`,
and applied **only** via `POST /assistant/proposals/:id/apply`, which delegates to the existing
endpoint for that kind and stamps `applied_at`. Applying twice is idempotent. Dismiss stamps
`dismissed_at` and leaves the thread intact. Integration-tested for all four kinds, including
**allergy respected** in nutrition proposals.

**AC-6 Hub screen.** FAB on all tabs → `app/assistant.tsx`. Streams progressively with real
tool-progress copy. Threads resume. Empty/loading/error states present. Component-tested.

**AC-7 Approval UX.** Proposal card → gorhom sheet → Approve applies and confirms in-thread;
swipe-down dismisses and keeps chatting. Component-tested for both paths.

**AC-8 Transparency.** "What I looked at" trace renders from `tool_trace` on every assistant
message that used tools. Component-tested.

**AC-9 Safety.** Step cap, daily quota, 45 s budget, ≤200-row/≤365-day tool caps all enforced
and tested. No photos/emails/other-user data reachable by any tool. Copy body-neutral.

**AC-10 Docs.** `docs/ai.md` gains an "Agentic hub" section (loop, tool catalogue, retention
disclosure, the Epic-5b reversal); `docs/api.md` gains the `/assistant/*` endpoints;
`docs/data-model.md` gains both tables. `AGENTS.md` locked-decisions updated.

---

## 8. Story breakdown

| Story | Scope | Depends on |
|---|---|---|
| **NWE-122** | Migration + registry + loop + `/assistant/chat` streaming (read tools only) | — |
| **NWE-123** | Hub screen: FAB, streaming chat, threads, trace | 122 |
| **NWE-124** | Proposals + approval sheet (all four kinds) — completes S1 & S2 | 122, 123 |
| **NWE-125** | Migrate program-refine + meal-plan-refine to Interactions | 122 |
| **NWE-126** | Migrate one-shot generators (weekly, council, physique, program-gen, snap-to-log) | 125 |
| **NWE-127** | *(follow-up)* Expose registry as Streamable-HTTP MCP server when Gemini 3 supports it | 124 |

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Edge Function timeout on long loops | 45 s budget → `background=true`; step cap keeps loops short |
| RN streaming fragility | `expo/fetch` verified; non-streamed fallback path |
| Quota burn (full-agentic by choice) | Step cap, daily quota, structured token logging to measure real cost |
| Model calls wrong/excess tools | Gemini 3 thinking; precise "when to call" descriptions; `validated` mode |
| Interactions API lacks caching/Batch | Accepted; revisit if cost forces it |
| Prompt injection via logged food names | Writes are impossible by construction; reads are RLS-scoped and capped |
