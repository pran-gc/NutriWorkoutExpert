-- ============================================================================
-- 0004 · Coach memory — rolling distilled summary for coaching continuity
-- ============================================================================
-- NWE-119. `{ text, updated_at }`, shape owned by `coachMemorySchema` in
-- packages/shared; text hard-capped (≤1200 chars) so prompt cost stays flat
-- forever. Rewritten weekly by one distillation call after the council runs.
-- User-visible in Profile ("What your coach remembers") and clearable.
-- RLS: rides the existing profiles policies (own row only).
alter table public.profiles
  add column if not exists coach_memory jsonb not null default '{}'::jsonb;
