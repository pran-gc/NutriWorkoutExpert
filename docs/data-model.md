# Data model

> **The full v1.0 schema lives in [`supabase/schema.sql`](../supabase/schema.sql)** (designed
> 2026-07-07 from the complete backlog, with inline comments explaining every "why"). NWE-110
> converts it verbatim into `supabase/migrations/0001_init.sql`; later stories add numbered
> migrations only for genuine design changes. Markers below: ✅ = the app feature using the
> table exists · 🚧 = table exists in the schema, its feature story hasn't been built yet.
> Feature stories **verify their tables against real needs** (and document deviations) rather
> than designing them from scratch.
>
> **Tracking columns convention:** every table has `created_at`; mutable tables have
> `updated_at` maintained by the `handle_updated_at` trigger (never by app code). Lifecycle
> timestamps where stories need them: `seen_at` (badges → dashboard banner), `read_at`
> (insights → "first review read" badge), `applied_at`/`dismissed_at` (coach proposals →
> approve/dismiss + detector snooze). Consent is a timestamp (`photo_ai_consented_at`), not a
> boolean — privacy reviews ask *when*, not just *if*.

## Principles

- **Every user table**: `user_id uuid` referencing `auth.users(id) on delete cascade`, RLS
  enabled with `auth.uid() = user_id` policies, index on `(user_id, logged_on desc)` where
  day-scoped. No exceptions — CI/review should reject a migration without RLS.
- **Day-scoped data** uses `logged_on date` (device-local `YYYY-MM-DD` computed by the client).
- **Denormalize nutrition into log rows.** `food_logs` stores name + macros at log time, so
  history stays accurate if the source food/recipe changes later. Same idea for workout sets
  (exercise text kept alongside `exercise_id`).
- Schema changes ship as **new idempotent migration files** — never edit an applied migration.

## Entity overview

```mermaid
erDiagram
    profiles ||--o{ weight_logs : ""
    profiles ||--o{ food_logs : ""
    profiles ||--o{ workout_sessions : ""
    workout_sessions ||--o{ workout_sets : ""
    exercises ||--o{ workout_sets : "exercise_id (✅301)"
    profiles ||--o{ water_logs : "🚧203"
    profiles ||--o{ favorite_foods : "🚧201"
    profiles ||--o{ recipes : "🚧202"
    recipes ||--o{ recipe_items : "🚧202"
    profiles ||--o{ routines : "✅302"
    routines ||--o{ routine_exercises : "✅302"
    profiles ||--o{ insights : "✅502"
    profiles ||--o{ assistant_threads : "✅122"
    assistant_threads ||--o{ assistant_messages : "✅122"
    profiles ||--o{ measurements : "🚧403 later"
```

## Tables

### ✅ profiles — one row per user, auto-created on signup (trigger `handle_new_user`)
`id (= auth.uid)`, `display_name`, `sex ('male'|'female')`, `birth_year`, `height_cm`,
`activity_level (sedentary|light|moderate|active|very_active)`,
`goal_type (lose|maintain|gain)`, `target_weight_kg`,
`calorie_target`, `protein_target_g`, `carbs_target_g`, `fat_target_g`, timestamps.
Planned additions: `water_target_ml default 2000` (🚧203), `targets_locked bool` (🚧404),
AI consent flag (🚧507).

### ✅ weight_logs
`weight_kg`, `logged_on` — **unique (user_id, logged_on)**, upserted (one weigh-in per day).

### ✅ food_logs
`food_name`, `brand`, `meal_type (breakfast|lunch|dinner|snack)`, `quantity_g`,
`calories`, `protein_g`, `carbs_g`, `fat_g` (all for the logged quantity, denormalized),
`source ('manual'|'openfoodfacts')` + `source_id` (barcode), `logged_on`.
Planned: `source='recipe'` (🚧202), `photo_path` — **device-local filename, not a URL;
photo exists only on the device that logged it** (🚧204).

### ✅ workout_sessions / ✅ workout_sets
Sessions: `title`, `notes`, `duration_min`, `logged_on`.
Sets: `session_id (cascade)`, `user_id`, `exercise_id`, `exercise text`, `set_number`, `reps`,
`weight_kg`, `duration_min`, `distance_km`. Text is kept alongside the FK for history fidelity.

### ✅ exercises (NWE-301)
`user_id nullable` — **null = global seed row** (~50 common exercises seeded by migration),
`name`, `muscle_group`, `kind (strength|cardio)`. RLS: read global + own; write own only.

### 🚧 earned_badges (604) — user_id, badge_id, earned_on; unique (user_id, badge_id); catalog lives in code (`packages/shared`), not the DB

### 🚧 push_tokens (607) — user_id, expo_token, device label, updated_at; RLS; notification prefs (categories + quiet hours) live on the profile or a jsonb column

### 🚧 favorite_foods (201) · recipes + recipe_items (202) · water_logs (203) · push_tokens (607)
Full definitions in `schema.sql`; the owning story writes the matching Zod schemas in
`packages/shared` and adjusts columns via a new migration only if the build reveals a gap.
Deliberately absent: `measurements` (post-v1.0, NWE-403) and `quest_days` (NWE-605 computes
on read first).

### ✅ routines + routine_exercises (NWE-302)
Reusable workout templates. `routine_exercises` stores ordered exercise IDs plus target
sets/reps; deleting a routine cascades template rows only. Past `workout_sessions.routine_id`
is `on delete set null`, so history is never removed by template cleanup.

### ✅ insights (NWE-502; extended by 121/122)
`user_id`, `kind` (`weekly`|`council`|`physique`|`training`|`checkin`|`nutrition`|`assistant`;
migrations `0005`/`0007` add the last two), `week_start date` (weekly only, unique per user+week), `content` (markdown),
`payload jsonb` (AI drafts: program days for `training`, meal plan + refine thread for
`nutrition`), `model`, `prompt_version`, `created_at`. **Never stores images** — physique rows
hold text feedback only.

### ✅ assistant_threads + assistant_messages (NWE-122)
`assistant_threads` stores one owned conversation: `title`, Gemini `last_interaction_id`, and
timestamps. `assistant_messages` stores owned user/assistant turns, a capped user-visible
`tool_trace` (`name`, argument preview, latency, success), a `failed` flag, and an optional
proposal link to `insights`. Both tables cascade with account/thread deletion, have RLS tied to
`auth.uid()`, and are indexed for newest-thread and chronological-message reads. Gemini interaction
continuity uses stored server-side state; local messages remain the app's durable conversation
record.

**Failed turns are still persisted.** If the loop breaks mid-stream, whatever it produced (partial
text + tool trace) is written as an assistant message with `failed = true`, and
`last_interaction_id` still advances. This keeps two invariants: a thread never holds a user
message with no reply, and the next message never resumes Gemini from stale server-side state.
The UI renders `failed` turns as "couldn't finish", not as normal assistant output.

Proposal messages link `proposal_insight_id` to `insights(kind='assistant')`. The insight payload
contains the shared-schema proposal and, after approval, its `apply_result`; the existing
`applied_at` / `dismissed_at` columns are the durable idempotency and decision state. Thread reads
join these proposal fields for inline cards without duplicating the artifact in message rows.
Food proposal entries persist their per-ingredient bases, nullable micronutrients, and provenance
in the existing `food_logs.ingredients` JSONB; daily micronutrient totals are derived on read and
carry per-nutrient `partial` flags. Proposal payloads may also hold `recipe_result`,
`supersedes_insight_id`, `superseded_by_insight_id`, and `dismiss_reason='superseded'`. No new
columns are needed: lifecycle state remains in `applied_at`/`dismissed_at`, while the version links
stay with the schema-versioned artifact.

`profiles.coaching_profile` (jsonb) also carries the **dietary profile** (NWE-121): `dietary_style`
(omnivore/vegetarian/vegan/pescatarian/halal/kosher/other), `allergies[]` (hard safety
constraint — never violated by the nutritionist), `disliked_foods[]`, `meals_per_day`,
`cook_time_pref`. Validated by `coachingProfileSchema` in `packages/shared`.

## What is deliberately NOT in the database

- **Photos** — on-device only (`expo-file-system`); DB stores at most a local filename.
- **Raw third-party payloads** — Open Food Facts results are normalized at the API boundary.
- **LLM inputs** — one-shot features use aggregates/ephemeral photos. The Hub may send capped,
  PII-free tool results (never emails/photos/other users); its text and transparency trace are stored.

## Migrations workflow (post NWE-110)

```
supabase migration new <name>     # create supabase/migrations/NNNN_<name>.sql
supabase db reset                 # replay all migrations + seed on local Docker stack
# integration tests run against this local stack
# deploy to hosted project via GitHub Action (NWE-115): supabase db push
```

The hosted (free-tier) project has **no automatic backups** — a scheduled `pg_dump` export is
part of NWE-115. Free-tier projects pause after 7 idle days; resume from the dashboard.
