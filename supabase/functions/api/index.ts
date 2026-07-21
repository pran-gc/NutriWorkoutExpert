// The NutriWorkoutExpert backend: one Hono app on a Supabase Edge Function.
// The mobile app talks ONLY to this API (never the DB directly); supabase-js in
// the app is auth-only. Every endpoint follows the template established here
// (docs/api.md). Exports `AppType` for the app's typed Hono RPC client.
import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { authMiddleware } from './middleware/auth.ts';
import { onError } from './middleware/error.ts';
import { analyticsRoute } from './routes/analytics.ts';
import { cronRoute } from './routes/cron.ts';
import { exercisesRoute } from './routes/exercises.ts';
import { favoritesRoute } from './routes/favorites.ts';
import { foodLogsRoute } from './routes/food-logs.ts';
import { waterRoute } from './routes/water.ts';
import { foodsRoute } from './routes/foods.ts';
import { healthRoute } from './routes/health.ts';
import { gamificationRoute } from './routes/gamification.ts';
import { insightsRoute } from './routes/insights.ts';
import { meRoute } from './routes/me.ts';
import { notificationsRoute } from './routes/notifications.ts';
import { recipesRoute } from './routes/recipes.ts';
import { nutritionRoute } from './routes/nutrition.ts';
import { routinesRoute } from './routes/routines.ts';
import { weightsRoute } from './routes/weights.ts';
import { workoutsRoute } from './routes/workouts.ts';
import type { Env } from './types.ts';

// Served by Supabase at /functions/v1/api → base path '/api'.
const app = new Hono<Env>().basePath('/api');

app.onError(onError);
app.use('*', logger());

// Every route except /health requires a valid Supabase JWT.
app.use('/me/*', authMiddleware);
app.use('/me', authMiddleware);
app.use('/weights/*', authMiddleware);
app.use('/weights', authMiddleware);
app.use('/food-logs/*', authMiddleware);
app.use('/food-logs', authMiddleware);
app.use('/foods/*', authMiddleware);
app.use('/favorites/*', authMiddleware);
app.use('/favorites', authMiddleware);
app.use('/water/*', authMiddleware);
app.use('/water', authMiddleware);
app.use('/recipes/*', authMiddleware);
app.use('/recipes', authMiddleware);
app.use('/workouts/*', authMiddleware);
app.use('/workouts', authMiddleware);
app.use('/exercises/*', authMiddleware);
app.use('/exercises', authMiddleware);
app.use('/routines/*', authMiddleware);
app.use('/routines', authMiddleware);
app.use('/nutrition/*', authMiddleware);
app.use('/analytics/*', authMiddleware);
app.use('/insights/*', authMiddleware);
app.use('/insights', authMiddleware);
app.use('/streaks', authMiddleware);
app.use('/quests', authMiddleware);
app.use('/badges', authMiddleware);
app.use('/notifications/*', authMiddleware);

const routes = app
  .route('/health', healthRoute)
  .route('/cron', cronRoute)
  .route('/me', meRoute)
  .route('/weights', weightsRoute)
  .route('/food-logs', foodLogsRoute)
  .route('/foods', foodsRoute)
  .route('/favorites', favoritesRoute)
  .route('/water', waterRoute)
  .route('/recipes', recipesRoute)
  .route('/workouts', workoutsRoute)
  .route('/exercises', exercisesRoute)
  .route('/routines', routinesRoute)
  .route('/nutrition', nutritionRoute)
  .route('/analytics', analyticsRoute)
  .route('/insights', insightsRoute)
  .route('/', gamificationRoute)
  .route('/notifications', notificationsRoute);

// The type the app imports for `hc<AppType>` full inference.
export type AppType = typeof routes;

export { app };

// Only serve when run as the entrypoint — tests import `app` and call
// `app.fetch(...)` directly without binding a port.
if (import.meta.main) {
  Deno.serve(app.fetch);
}
