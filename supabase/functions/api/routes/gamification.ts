import { Hono } from 'hono';

import {
  BADGE_CATALOG,
  computeDailyStreak,
  dateQuerySchema,
  evaluateBadges,
  generateDailyQuests,
  ok,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import { adminDb } from '../services/adminDb.ts';
import type { Env } from '../types.ts';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

async function awardBadges(userId: string, badgeIds: string[]) {
  if (badgeIds.length === 0) return;
  const rows = badgeIds.map((badge_id) => ({ user_id: userId, badge_id }));
  const { error } = await adminDb().from('earned_badges').upsert(rows, { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
  if (error) throw new HttpError('INTERNAL', 'Could not award badges.');
}

export const gamificationRoute = new Hono<Env>()
  .get('/streaks', zval('query', dateQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { date } = c.req.valid('query');
    const { data, error } = await db.from('food_logs').select('logged_on').eq('user_id', user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not load streaks.');
    return c.json(ok({ food: computeDailyStreak((data ?? []).map((row) => row.logged_on), date ?? todayISO()) }));
  })
  .get('/quests', zval('query', dateQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const date = c.req.valid('query').date ?? todayISO();
    const [{ data: foods, error: foodErr }, { data: water, error: waterErr }, { data: workouts, error: workoutErr }, { data: profile, error: profileErr }] =
      await Promise.all([
        db.from('food_logs').select('logged_on').eq('user_id', user.id).eq('logged_on', date),
        db.from('water_logs').select('ml, logged_on').eq('user_id', user.id).eq('logged_on', date),
        db.from('workout_sessions').select('logged_on').eq('user_id', user.id).eq('logged_on', date),
        db.from('profiles').select('water_target_ml').eq('id', user.id).single(),
      ]);
    if (foodErr || waterErr || workoutErr || profileErr) throw new HttpError('INTERNAL', 'Could not load quests.');
    return c.json(
      ok(
        generateDailyQuests({
          date,
          foodLogs: foods ?? [],
          waterMl: (water ?? []).reduce((sum, row) => sum + Number(row.ml), 0),
          workouts: workouts ?? [],
          waterTargetMl: profile?.water_target_ml ?? 2000,
        })
      )
    );
  })
  .get('/badges', zval('query', dateQuerySchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const date = c.req.valid('query').date ?? todayISO();
    const week = weekStart(date);
    const [{ data: foodDays, error: foodErr }, { count: workoutCount, error: workoutErr }, { data: waterDays, error: waterErr }, { count: reviewCount, error: reviewErr }, { count: aiPhotoCount }, { data: weights }, { data: profile }] =
      await Promise.all([
        db.from('food_logs').select('logged_on').eq('user_id', user.id),
        db.from('workout_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        db.from('water_logs').select('logged_on').eq('user_id', user.id).gte('logged_on', week).lte('logged_on', date),
        db.from('insights').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'weekly'),
        db.from('food_logs').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('source', 'ai_photo'),
        db.from('weight_logs').select('weight_kg, logged_on').eq('user_id', user.id).order('logged_on', { ascending: true }),
        db.from('profiles').select('target_weight_kg').eq('id', user.id).single(),
      ]);
    if (foodErr || workoutErr || waterErr || reviewErr) throw new HttpError('INTERNAL', 'Could not evaluate badges.');
    const ids = evaluateBadges({
      foodDays: [...new Set((foodDays ?? []).map((row) => row.logged_on))],
      workoutCount: workoutCount ?? 0,
      waterDaysThisWeek: new Set((waterDays ?? []).map((row) => row.logged_on)).size,
      weeklyReviews: reviewCount ?? 0,
      aiPhotoLogs: aiPhotoCount ?? 0,
      prCount: 0,
      goalProgressPct: goalProgressPct(weights ?? [], profile?.target_weight_kg ?? null),
      today: date,
    });
    await awardBadges(user.id, ids);
    const { data: earned, error } = await db.from('earned_badges').select('*').eq('user_id', user.id).order('earned_at', { ascending: false });
    if (error) throw new HttpError('INTERNAL', 'Could not load badges.');
    return c.json(ok({ catalog: BADGE_CATALOG, earned: earned ?? [] }));
  });

function goalProgressPct(weights: { weight_kg: number }[], target: number | null): number {
  if (!target || weights.length < 2) return 0;
  const first = Number(weights[0].weight_kg);
  const last = Number(weights[weights.length - 1].weight_kg);
  const total = Math.abs(target - first);
  if (total < 0.1) return 100;
  const moved = Math.abs(last - first);
  return Math.max(0, Math.min(100, Math.round((moved / total) * 100)));
}
