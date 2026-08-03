-- ============================================================================
-- 0006 · Track onboarding completion so the wizard shows exactly once
-- ============================================================================
-- Before this, "profile incomplete" was inferred purely from missing body stats,
-- so a user who Skipped onboarding (saving nothing) was redirected back into it
-- on every launch. Add an explicit timestamp the app sets when the user finishes
-- OR skips the wizard; the redirect guard keys off this instead.
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

-- Backfill: anyone who already has the core body stats has effectively completed
-- onboarding — don't re-prompt existing users.
update public.profiles
  set onboarding_completed_at = coalesce(onboarding_completed_at, updated_at, now())
  where sex is not null and birth_year is not null and height_cm is not null;
