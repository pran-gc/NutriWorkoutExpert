-- ============================================================================
-- NutriWorkoutExpert — full v1.0 schema
-- ============================================================================
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → paste → Run).
-- Becomes supabase/migrations/0001_init.sql in NWE-110; after that, changes
-- ship as NEW numbered migrations — never edit this one once applied.
--
-- Design principles (the "whys" — full rationale in docs/data-model.md):
--
-- 1. RLS ON EVERY TABLE, even though the app only talks to our Hono API.
--    The API queries with the caller's JWT, so RLS is the second lock on the
--    door: an endpoint bug can't leak another user's rows. Defense in depth.
--
-- 2. DENORMALIZE NUTRITION INTO LOG ROWS. food_logs stores name + macros as
--    they were at log time. If a recipe or food-DB entry changes later, your
--    history stays true. Same idea for workout_sets keeping the exercise name
--    text next to exercise_id.
--
-- 3. TRACKING COLUMNS. Every table: created_at. Tables that mutate: updated_at
--    (kept correct by trigger, not by remembering to set it in app code).
--    Lifecycle columns where stories need them: seen_at (badge banner),
--    read_at (insight opened — feeds a badge), applied_at / dismissed_at
--    (coach proposals; dismissal drives the 2-week snooze). Consent is a
--    TIMESTAMP, not a boolean — privacy reviews ask "when", not just "if".
--
-- 4. DAY-SCOPED DATA uses logged_on (YYYY-MM-DD computed on the DEVICE, in the
--    user's local timezone). The server never guesses timezones. Hot query
--    everywhere is "this user, this day/range" → index (user_id, logged_on desc).
--
-- 5. NO PHOTOS IN THE DATABASE OR STORAGE — product promise ("your photos are
--    never stored"). photo_path holds a device-local filename only; it is
--    meaningless off-device, and that is intentional.
--
-- 6. CATALOGS LIVE IN CODE, NOT THE DB, when they are logic-bearing: the badge
--    catalog (criteria are pure TypeScript functions in packages/shared) and
--    quest definitions. The DB stores only earned/derived STATE. Exercises are
--    the exception (seeded rows) because user rows must reference them by FK.
--
-- 7. jsonb WHERE THE SHAPE IS OWNED BY ZOD in packages/shared (ingredient
--    breakdowns, coach-proposal payloads, notification prefs): these evolve
--    with prompts/UI, and their single source of truth is the shared schema —
--    mirroring them as columns would create a second, drifting contract.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- updated_at maintained by trigger so app/API code can't forget it.
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- PROFILES — one row per user, auto-created on signup
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,

  -- Body stats for Mifflin-St Jeor (all nullable: onboarding is skippable).
  sex text check (sex in ('male', 'female')),
  birth_year int check (birth_year between 1900 and 2100),
  height_cm numeric(5, 1) check (height_cm > 0),
  activity_level text not null default 'moderate'
    check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),

  -- Goal + computed daily targets. Stored (not recomputed per request) so the
  -- user sees stable numbers; recomputed server-side on profile save (NWE-114)
  -- unless targets_locked (NWE-404: user pinned their own numbers).
  goal_type text not null default 'maintain'
    check (goal_type in ('lose', 'maintain', 'gain')),
  target_weight_kg numeric(5, 1),
  calorie_target int,
  protein_target_g int,
  carbs_target_g int,
  fat_target_g int,
  targets_locked boolean not null default false,          -- NWE-404
  water_target_ml int not null default 2000,              -- NWE-203

  -- Consent for sending photos to Gemini (NWE-507/508). Timestamp, not bool:
  -- records WHEN consent was given; revoking sets it back to null.
  photo_ai_consented_at timestamptz,

  -- Notification preferences (NWE-607): categories, reminder times, quiet
  -- hours. Shape owned by the Zod schema in packages/shared (see why #7).
  notification_prefs jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: select own" on public.profiles for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);
-- No delete policy: profiles die only via auth-user cascade (NWE-117).

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create the profile on signup so the app never races a missing row.
-- SECURITY DEFINER because auth.users triggers run outside the user's grants.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- WEIGHT LOGS — one per day, upserted (NWE-114/401/409)
-- ---------------------------------------------------------------------------
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  weight_kg numeric(5, 1) not null check (weight_kg > 0),
  logged_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One weigh-in per day: re-logging replaces, which is what users mean.
  unique (user_id, logged_on)
);

create index if not exists weight_logs_user_date_idx
  on public.weight_logs (user_id, logged_on desc);

alter table public.weight_logs enable row level security;
create policy "weight_logs: own" on public.weight_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger weight_logs_updated_at before update on public.weight_logs
  for each row execute function public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- FOOD LOGS — the core nutrition ledger (NWE-114/205/204/508)
-- ---------------------------------------------------------------------------
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Denormalized on purpose (why #2): what you logged is what you see forever.
  food_name text not null,
  brand text,
  meal_type text not null default 'snack'
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  quantity_g numeric(7, 1) not null default 100 check (quantity_g > 0),
  calories numeric(7, 1) not null default 0,
  protein_g numeric(6, 1) not null default 0,
  carbs_g numeric(6, 1) not null default 0,
  fat_g numeric(6, 1) not null default 0,

  -- Provenance: where this entry came from. 'ai_photo' = snap-to-log (NWE-508),
  -- 'recipe' = one-tap recipe log (NWE-202). Analytics and the nutrition coach
  -- read this to know how the user actually logs.
  source text not null default 'manual'
    check (source in ('manual', 'openfoodfacts', 'recipe', 'ai_photo')),
  source_id text,                       -- OFF barcode / recipe id / null

  -- Snap-to-log ingredient breakdown (NWE-508): [{name, quantity_g, macros,
  -- estimated}] — kept so the entry stays editable ingredient-by-ingredient.
  -- Shape owned by packages/shared Zod (why #7).
  ingredients jsonb,

  -- Device-local filename only (why #5). Never a URL, never uploaded.
  photo_path text,

  logged_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_logs_user_date_idx
  on public.food_logs (user_id, logged_on desc);

alter table public.food_logs enable row level security;
create policy "food_logs: own" on public.food_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger food_logs_updated_at before update on public.food_logs
  for each row execute function public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- FAVORITE FOODS — two-tap re-logging (NWE-201)
-- ---------------------------------------------------------------------------
create table if not exists public.favorite_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  -- Per-100g macros so any quantity can be logged from a favorite.
  calories_per_100g numeric(7, 1) not null default 0,
  protein_per_100g numeric(6, 1) not null default 0,
  carbs_per_100g numeric(6, 1) not null default 0,
  fat_per_100g numeric(6, 1) not null default 0,
  source text not null default 'manual' check (source in ('manual', 'openfoodfacts')),
  source_id text,
  -- Tracking: remembers how much of it you usually eat → pre-fills the panel.
  last_quantity_g numeric(7, 1) not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedupe: starring the same food twice updates rather than duplicates.
create unique index if not exists favorite_foods_dedupe_idx
  on public.favorite_foods (user_id, lower(name), coalesce(lower(brand), ''));

alter table public.favorite_foods enable row level security;
create policy "favorite_foods: own" on public.favorite_foods for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger favorite_foods_updated_at before update on public.favorite_foods
  for each row execute function public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- RECIPES — composite foods, logged in one tap (NWE-202)
-- ---------------------------------------------------------------------------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  servings numeric(5, 2) not null default 1 check (servings > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipes enable row level security;
create policy "recipes: own" on public.recipes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.handle_updated_at();

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  -- user_id duplicated from the parent so RLS stays a one-column check
  -- (no join inside the policy = simpler and faster).
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  quantity_g numeric(7, 1) not null check (quantity_g > 0),
  calories_per_100g numeric(7, 1) not null default 0,
  protein_per_100g numeric(6, 1) not null default 0,
  carbs_per_100g numeric(6, 1) not null default 0,
  fat_per_100g numeric(6, 1) not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipe_items_recipe_idx on public.recipe_items (recipe_id);

alter table public.recipe_items enable row level security;
create policy "recipe_items: own" on public.recipe_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger recipe_items_updated_at before update on public.recipe_items
  for each row execute function public.handle_updated_at();

-- Note: logging a recipe COPIES its summed macros into food_logs
-- (source='recipe'). Editing a recipe never rewrites history (why #2).


-- ---------------------------------------------------------------------------
-- WATER LOGS — append-only taps (NWE-203)
-- ---------------------------------------------------------------------------
-- Each +250/+500 tap is one row: "undo last" = delete newest row of the day,
-- which is trivial and exact. Append-only → no updated_at needed.
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ml int not null check (ml > 0 and ml <= 2000),
  logged_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists water_logs_user_date_idx
  on public.water_logs (user_id, logged_on desc);

alter table public.water_logs enable row level security;
create policy "water_logs: own" on public.water_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- EXERCISES — seeded global library + user's custom entries (NWE-301)
-- ---------------------------------------------------------------------------
-- user_id NULL = global seed row (readable by everyone, writable by no one).
-- FK identity is what makes progress charts (303), routines (302), gym
-- analytics (408) and the AI program generator (509) possible — free-text
-- exercise names can't be aggregated.
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,  -- null = global
  name text not null,
  muscle_group text not null
    check (muscle_group in ('chest','back','shoulders','legs','arms','core','full_body','cardio')),
  kind text not null default 'strength' check (kind in ('strength', 'cardio')),
  created_at timestamptz not null default now()
);

create index if not exists exercises_name_idx on public.exercises (lower(name));

alter table public.exercises enable row level security;
create policy "exercises: read global + own" on public.exercises for select
  using (user_id is null or auth.uid() = user_id);
create policy "exercises: insert own" on public.exercises for insert
  with check (auth.uid() = user_id);
create policy "exercises: update own" on public.exercises for update
  using (auth.uid() = user_id);
create policy "exercises: delete own" on public.exercises for delete
  using (auth.uid() = user_id);

-- Starter library (~55). Idempotent: safe to re-run.
insert into public.exercises (name, muscle_group, kind)
select * from (values
  ('Bench Press','chest','strength'), ('Incline Bench Press','chest','strength'),
  ('Dumbbell Bench Press','chest','strength'), ('Chest Fly','chest','strength'),
  ('Cable Crossover','chest','strength'), ('Push-Up','chest','strength'),
  ('Dip','chest','strength'),
  ('Deadlift','back','strength'), ('Pull-Up','back','strength'),
  ('Chin-Up','back','strength'), ('Lat Pulldown','back','strength'),
  ('Barbell Row','back','strength'), ('Dumbbell Row','back','strength'),
  ('Seated Cable Row','back','strength'), ('Back Extension','back','strength'),
  ('Overhead Press','shoulders','strength'), ('Dumbbell Shoulder Press','shoulders','strength'),
  ('Arnold Press','shoulders','strength'), ('Lateral Raise','shoulders','strength'),
  ('Front Raise','shoulders','strength'), ('Rear Delt Fly','shoulders','strength'),
  ('Face Pull','shoulders','strength'), ('Shrug','shoulders','strength'),
  ('Squat','legs','strength'), ('Front Squat','legs','strength'),
  ('Goblet Squat','legs','strength'), ('Leg Press','legs','strength'),
  ('Romanian Deadlift','legs','strength'), ('Lunge','legs','strength'),
  ('Bulgarian Split Squat','legs','strength'), ('Leg Extension','legs','strength'),
  ('Leg Curl','legs','strength'), ('Hip Thrust','legs','strength'),
  ('Calf Raise','legs','strength'),
  ('Barbell Curl','arms','strength'), ('Dumbbell Curl','arms','strength'),
  ('Hammer Curl','arms','strength'), ('Preacher Curl','arms','strength'),
  ('Triceps Pushdown','arms','strength'), ('Overhead Triceps Extension','arms','strength'),
  ('Skull Crusher','arms','strength'), ('Close-Grip Bench Press','arms','strength'),
  ('Plank','core','strength'), ('Side Plank','core','strength'),
  ('Crunch','core','strength'), ('Cable Crunch','core','strength'),
  ('Hanging Leg Raise','core','strength'), ('Russian Twist','core','strength'),
  ('Ab Wheel Rollout','core','strength'),
  ('Running','cardio','cardio'), ('Cycling','cardio','cardio'),
  ('Swimming','cardio','cardio'), ('Rowing','cardio','cardio'),
  ('Walking','cardio','cardio'), ('Hiking','cardio','cardio'),
  ('Elliptical','cardio','cardio'), ('Stair Climber','cardio','cardio'),
  ('Jump Rope','cardio','cardio')
) as seed(name, muscle_group, kind)
where not exists (
  select 1 from public.exercises e where e.user_id is null and lower(e.name) = lower(seed.name)
);


-- ---------------------------------------------------------------------------
-- WORKOUT SESSIONS + SETS (NWE-114/301/304/305)
-- ---------------------------------------------------------------------------
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Workout',
  notes text,
  duration_min int check (duration_min >= 0),
  -- Provenance: which routine started this session (null = ad-hoc). Feeds
  -- consistency analytics (408: sessions vs plan). set null on routine delete
  -- so deleting a routine never touches history.
  routine_id uuid,
  logged_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_sessions_user_date_idx
  on public.workout_sessions (user_id, logged_on desc);

alter table public.workout_sessions enable row level security;
create policy "workout_sessions: own" on public.workout_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger workout_sessions_updated_at before update on public.workout_sessions
  for each row execute function public.handle_updated_at();

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,  -- flat RLS (see recipe_items)

  -- FK for aggregation (charts/analytics/AI) + text snapshot for history
  -- fidelity (why #2). exercise_id nullable: pre-301 legacy rows have text only.
  exercise_id uuid references public.exercises (id) on delete set null,
  exercise text not null,

  set_number int not null default 1 check (set_number > 0),
  -- Strength fields
  reps int check (reps >= 0),
  weight_kg numeric(6, 1) check (weight_kg >= 0),
  -- Cardio fields (NWE-304). API validation enforces the right combo per kind.
  duration_min numeric(6, 1) check (duration_min >= 0),
  distance_km numeric(6, 2) check (distance_km >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_sets_session_idx on public.workout_sets (session_id);
-- Exercise history queries (303: "this user, this exercise, over time"):
create index if not exists workout_sets_user_exercise_idx
  on public.workout_sets (user_id, exercise_id, created_at desc);

alter table public.workout_sets enable row level security;
create policy "workout_sets: own" on public.workout_sets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger workout_sets_updated_at before update on public.workout_sets
  for each row execute function public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- ROUTINES — reusable templates; AI-generated ones land here too (NWE-302/509)
-- ---------------------------------------------------------------------------
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  notes text,
  -- Provenance: 'ai' = generated by NWE-509. AI routines are ordinary rows —
  -- fully editable, nothing special-cased (locked decision).
  source text not null default 'user' check (source in ('user', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routines enable row level security;
create policy "routines: own" on public.routines for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger routines_updated_at before update on public.routines
  for each row execute function public.handle_updated_at();

-- Now that routines exists, wire the provenance FK from sessions.
alter table public.workout_sessions
  drop constraint if exists workout_sessions_routine_id_fkey;
alter table public.workout_sessions
  add constraint workout_sessions_routine_id_fkey
  foreign key (routine_id) references public.routines (id) on delete set null;

create table if not exists public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,  -- flat RLS
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position int not null default 0,
  target_sets int not null default 3 check (target_sets > 0),
  target_reps int check (target_reps > 0),          -- null for cardio/timed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists routine_exercises_routine_idx
  on public.routine_exercises (routine_id, position);

alter table public.routine_exercises enable row level security;
create policy "routine_exercises: own" on public.routine_exercises for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger routine_exercises_updated_at before update on public.routine_exercises
  for each row execute function public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- INSIGHTS — everything the AI says to the user (NWE-502/507/509/510/511)
-- ---------------------------------------------------------------------------
-- One table for all AI output kinds so the Insights feed is a single query
-- and lifecycle tracking works uniformly. Photos NEVER land here (why #5) —
-- physique rows hold text feedback only.
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null
    check (kind in ('weekly', 'council', 'physique', 'training', 'checkin')),

  week_start date,          -- weekly/council: the week this covers
  detector text,            -- checkin/training: which detector fired (snooze key)

  content text not null,    -- markdown shown to the user
  -- Structured proposals (target diffs, routine diffs) — shape owned by Zod
  -- in packages/shared (why #7). The approve/dismiss chips render from this.
  payload jsonb,

  -- Reproducibility: which model + prompt version produced this (debugging
  -- bad advice, and honest changelogs when prompts improve).
  model text not null,
  prompt_version text not null,

  -- Lifecycle tracking (why #3):
  read_at timestamptz,       -- user opened it (feeds "first review read" badge)
  applied_at timestamptz,    -- user approved the proposal in payload
  dismissed_at timestamptz,  -- user dismissed it (drives detector snooze)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency: one weekly/council row per user per week (NWE-502/511).
create unique index if not exists insights_weekly_unique_idx
  on public.insights (user_id, kind, week_start)
  where week_start is not null;

create index if not exists insights_user_created_idx
  on public.insights (user_id, created_at desc);

alter table public.insights enable row level security;
create policy "insights: own" on public.insights for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger insights_updated_at before update on public.insights
  for each row execute function public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- EARNED BADGES — derived state only; catalog lives in code (NWE-604, why #6)
-- ---------------------------------------------------------------------------
create table if not exists public.earned_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id text not null,           -- key into the packages/shared catalog
  earned_at timestamptz not null default now(),
  seen_at timestamptz,              -- null → dashboard "new badge" banner shows
  -- Idempotent awarding: re-evaluating criteria can never double-award.
  unique (user_id, badge_id)
);

alter table public.earned_badges enable row level security;
create policy "earned_badges: select own" on public.earned_badges for select
  using (auth.uid() = user_id);
create policy "earned_badges: mark seen" on public.earned_badges for update
  using (auth.uid() = user_id);
-- No user insert/delete policies ON PURPOSE: only the API's service-role
-- awarding path writes badges — a tampered client can't grant itself trophies
-- (gamification guardrail: real actions only).

-- (No quest_days table: NWE-605 defaults to compute-on-read from real logs;
--  the story adds a snapshot table only if that proves insufficient.)


-- ---------------------------------------------------------------------------
-- PUSH TOKENS — server-initiated notifications (NWE-607/603)
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_token text not null unique,   -- unique: a device that re-registers moves, not duplicates
  platform text not null check (platform in ('ios', 'android')),
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()   -- tracks last successful registration/refresh
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
create policy "push_tokens: own" on public.push_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger push_tokens_updated_at before update on public.push_tokens
  for each row execute function public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- Deliberately absent (so nobody "helpfully" adds them):
--   * measurements            — post-v1.0 (NWE-403); migration ships with it.
--   * quest_days              — compute-on-read first (NWE-605 decides).
--   * any photo/storage table — photos are on-device only. Product promise.
--   * badge/quest catalogs    — logic-bearing catalogs live in packages/shared.
-- ---------------------------------------------------------------------------
