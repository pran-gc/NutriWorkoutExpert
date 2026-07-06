-- NutriWorkoutExpert — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).

-- ============================================================
-- PROFILES: one row per user, created automatically on signup
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  sex text check (sex in ('male', 'female')),
  birth_year int check (birth_year between 1900 and 2100),
  height_cm numeric(5, 1) check (height_cm > 0),
  activity_level text not null default 'moderate'
    check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal_type text not null default 'maintain'
    check (goal_type in ('lose', 'maintain', 'gain')),
  target_weight_kg numeric(5, 1),
  calorie_target int,
  protein_target_g int,
  carbs_target_g int,
  fat_target_g int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile row when a user signs up
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

-- ============================================================
-- WEIGHT LOGS
-- ============================================================
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  weight_kg numeric(5, 1) not null check (weight_kg > 0),
  logged_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

create index if not exists weight_logs_user_date_idx
  on public.weight_logs (user_id, logged_on desc);

alter table public.weight_logs enable row level security;

create policy "Users manage own weight logs"
  on public.weight_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- FOOD LOGS: nutrition is denormalized per entry so history
-- stays accurate even if the source food data changes
-- ============================================================
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  food_name text not null,
  brand text,
  meal_type text not null default 'snack'
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  quantity_g numeric(7, 1) not null default 100 check (quantity_g > 0),
  calories numeric(7, 1) not null default 0,
  protein_g numeric(6, 1) not null default 0,
  carbs_g numeric(6, 1) not null default 0,
  fat_g numeric(6, 1) not null default 0,
  source text not null default 'manual', -- 'manual' | 'openfoodfacts'
  source_id text,                        -- e.g. Open Food Facts barcode
  logged_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists food_logs_user_date_idx
  on public.food_logs (user_id, logged_on desc);

alter table public.food_logs enable row level security;

create policy "Users manage own food logs"
  on public.food_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- WORKOUT SESSIONS + SETS
-- ============================================================
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Workout',
  notes text,
  duration_min int check (duration_min >= 0),
  logged_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists workout_sessions_user_date_idx
  on public.workout_sessions (user_id, logged_on desc);

alter table public.workout_sessions enable row level security;

create policy "Users manage own workout sessions"
  on public.workout_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise text not null,
  set_number int not null default 1 check (set_number > 0),
  reps int check (reps >= 0),
  weight_kg numeric(6, 1) check (weight_kg >= 0),
  duration_min numeric(6, 1) check (duration_min >= 0), -- for cardio/timed exercises
  created_at timestamptz not null default now()
);

create index if not exists workout_sets_session_idx
  on public.workout_sets (session_id);

alter table public.workout_sets enable row level security;

create policy "Users manage own workout sets"
  on public.workout_sets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
