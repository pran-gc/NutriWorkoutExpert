-- ============================================================================
-- 0005 · Allow 'nutrition' insights (AI meal planner drafts) — NWE-121
-- ============================================================================
-- Meal-plan drafts live in `insights` (kind='nutrition'), the same pattern as
-- program drafts (kind='training'). Extend the kind CHECK to permit it.
-- Forward-only: drop + recreate the constraint.
alter table public.insights drop constraint if exists insights_kind_check;
alter table public.insights
  add constraint insights_kind_check
  check (kind in ('weekly', 'council', 'physique', 'training', 'checkin', 'nutrition'));
