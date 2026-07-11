// User-data registry (NWE-117). One list of every table that holds user rows,
// so export and deletion stay complete: adding a user table WITHOUT updating this
// registry makes the export integration test fail (that's the point).
//
// profiles + auth.users cascade to everything via FK on delete, but we still list
// child tables explicitly so the export bundle is exhaustive and self-documenting.
export const USER_TABLES = [
  'profiles',
  'weight_logs',
  'food_logs',
  'favorite_foods',
  'recipes',
  'recipe_items',
  'water_logs',
  'exercises', // only the user's custom rows (user_id = them); global rows are excluded by RLS
  'workout_sessions',
  'workout_sets',
  'routines',
  'routine_exercises',
  'insights',
  'earned_badges',
  'push_tokens',
] as const;

export type UserTable = (typeof USER_TABLES)[number];
