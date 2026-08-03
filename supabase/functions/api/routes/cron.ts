import { Hono } from 'hono';

import {
  canSendNotification,
  formatWeeklyReview,
  notificationPrefsSchema,
  ok,
  weeklySummary,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { WEEKLY_REVIEW_PROMPT_VERSION } from '../prompts/weekly-review.v1.ts';
import { adminDb } from '../services/adminDb.ts';
import { generateWeeklyReview } from '../services/gemini.ts';
import type { Env } from '../types.ts';

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monday(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export const cronRoute = new Hono<Env>().post('/weekly-review', async (c) => {
  // This endpoint is NOT behind authMiddleware and runs under the service-role
  // client over ALL users, so it MUST fail closed. Require CRON_SECRET to be
  // configured AND to match — never skip the check when the env var is unset,
  // or the route becomes an unauthenticated, service-role-privileged trigger.
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) {
    // Misconfiguration: refuse rather than run unauthenticated.
    throw new HttpError('INTERNAL', 'Cron is not configured.');
  }
  if (c.req.header('x-cron-secret') !== secret) {
    throw new HttpError('FORBIDDEN', 'Invalid cron secret.');
  }
  const db = adminDb();
  const weekStart = monday();
  const weekEnd = addDays(new Date(`${weekStart}T00:00:00Z`), 6);
  const activeSince = addDays(new Date(), -14);
  const { data: activeFood, error: activeErr } = await db
    .from('food_logs')
    .select('user_id')
    .gte('logged_on', activeSince);
  if (activeErr) throw new HttpError('INTERNAL', 'Could not find active users.');
  const userIds = [...new Set((activeFood ?? []).map((row) => row.user_id as string))];
  let generated = 0;
  let pushEligible = 0;
  for (const userId of userIds) {
    const { data: existing } = await db
      .from('insights')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', 'weekly')
      .eq('week_start', weekStart)
      .maybeSingle();
    if (existing) continue;
    const [{ data: foodLogs }, { data: waterLogs }, { data: workouts }, { data: weights }, { data: profile }] =
      await Promise.all([
        db.from('food_logs').select('*').eq('user_id', userId).gte('logged_on', weekStart).lte('logged_on', weekEnd),
        db.from('water_logs').select('ml, logged_on').eq('user_id', userId).gte('logged_on', weekStart).lte('logged_on', weekEnd),
        db.from('workout_sessions').select('*, workout_sets(*)').eq('user_id', userId).gte('logged_on', weekStart).lte('logged_on', weekEnd),
        db.from('weight_logs').select('*').eq('user_id', userId).gte('logged_on', weekStart).lte('logged_on', weekEnd),
        db.from('profiles').select('*').eq('id', userId).single(),
      ]);
    const summary = weeklySummary(
      {
        foodLogs: foodLogs ?? [],
        waterLogs: waterLogs ?? [],
        workouts: workouts ?? [],
        weights: weights ?? [],
        profile: profile ?? null,
      },
      weekStart
    );
    const review = await generateWeeklyReview(summary);
    const { error } = await db.from('insights').insert({
      user_id: userId,
      kind: 'weekly',
      week_start: summary.weekStart,
      content: formatWeeklyReview(review.content),
      payload: { summary, review: review.content, generated_by: 'cron' },
      model: review.model,
      prompt_version: WEEKLY_REVIEW_PROMPT_VERSION,
    });
    if (!error) generated += 1;
    const prefs = notificationPrefsSchema.parse(profile?.notification_prefs ?? {});
    if (canSendNotification('07:00', prefs, 'weekly_review')) pushEligible += 1;
  }
  return c.json(ok({ users: userIds.length, generated, pushEligible }));
});
