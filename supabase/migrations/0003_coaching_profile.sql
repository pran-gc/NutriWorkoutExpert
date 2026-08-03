-- ============================================================================
-- 0003 · Coaching profile — stated intent the coaches inject into every AI call
-- ============================================================================
-- NWE-118. Shape is owned by `coachingProfileSchema` in packages/shared (jsonb
-- pattern #7): motivation, target_event, preferences, dislikes, injuries,
-- coach_tone. User-visible and user-editable ("this is everything your coach
-- knows about you"). RLS: rides the existing profiles policies (own row only).
alter table public.profiles
  add column if not exists coaching_profile jsonb not null default '{}'::jsonb;
