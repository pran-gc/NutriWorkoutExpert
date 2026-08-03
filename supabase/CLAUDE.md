# supabase/ — database + backend API

Everything server-side lives under this folder. Detailed docs: ../docs/data-model.md
(schema, RLS, migrations) and ../docs/api.md (Hono conventions, endpoint catalog).

## Layout

- `schema.sql` — the current full schema. ⚠️ NWE-110 converts it into
  `migrations/0001_init.sql`; after that, **never edit applied migrations** — add a new
  numbered file per change (`supabase migration new <name>`).
- `migrations/` — (post NWE-110) ordered SQL migrations, replayed by `supabase db reset`
  locally and pushed to the hosted project by CI (NWE-115).
- `functions/api/` — (post NWE-113) the entire backend: one Hono app on Deno.
  Structure: `index.ts` (mounts middleware/routers, exports `AppType` for the typed client) ·
  `middleware/` (auth → user + user-scoped db client; error → envelope) ·
  `routes/` (thin: validate with shared Zod → call service → wrap envelope) ·
  `services/` (I/O: db queries, `gemini.ts`, `openfoodfacts.ts`) ·
  `prompts/` (versioned AI prompt templates, e.g. `weekly-review.v1.ts`).

## Non-negotiable rules

- **Every table**: RLS enabled, `auth.uid()`-scoped policies, `user_id` FK with
  `on delete cascade`, index on `(user_id, logged_on desc)` for day-scoped data. A migration
  without RLS is a defect.
- **Every RLS table gets an integration test** proving user B cannot read user A's rows.
- Deno runtime: npm packages via `npm:` specifiers; no Node-only APIs; shared code imported
  from `packages/shared`.
- Secrets (`GEMINI_API_KEY`, service-role) via `supabase secrets set` / Edge Function env —
  never in code, never in the app.
- Service-role client only where user-scoped RLS genuinely cannot work (e.g. the signup
  trigger equivalent); name it explicitly (`adminDb`) so reviews can spot it.
- AI endpoints: existing one-shot routes use aggregates/ephemeral photos. The agentic Hub is the
  explicit exception: capped PII-free rows may be read through user-JWT tools, but its dispatcher
  has no write path. Nothing image-shaped is ever persisted server-side (../docs/ai.md).
- Local dev/tests run against `supabase start` (Docker) — integration tests must never touch
  the hosted project.
