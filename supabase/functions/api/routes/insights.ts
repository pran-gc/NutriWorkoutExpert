import { Hono } from 'hono';
import type { Context } from 'hono';

import {
  applyCouncilProposalParamSchema,
  applyCouncilProposalSchema,
  analyzePhysiqueSchema,
  addDaysISO,
  councilPlanSchema,
  deleteInsightParamSchema,
  formatWeeklyReview,
  generateInsightSchema,
  hasEnoughDataForCouncil,
  mondayForDateISO,
  ok,
  weeklySummary,
  weeklySummaryQuerySchema,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import { WEEKLY_REVIEW_PROMPT_VERSION } from '../prompts/weekly-review.v1.ts';
import { analyzePhysique, generateCouncilPlan, generateWeeklyReview } from '../services/gemini.ts';
import type { Env } from '../types.ts';

type BuiltSummary = Awaited<ReturnType<typeof buildWeeklySummary>>;

function defaultWeek(): string {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

async function buildWeeklySummary(c: Context<Env>, week?: string) {
  const user = c.get('user');
  const db = c.get('db');
  const start = mondayForDateISO(week ?? defaultWeek());
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const endIso = end.toISOString().slice(0, 10);
  const [{ data: foodLogs, error: foodErr }, { data: waterLogs, error: waterErr }, { data: workouts, error: workoutErr }, { data: weights, error: weightErr }, { data: profile, error: profileErr }, { data: exercises, error: exerciseErr }] =
    await Promise.all([
      db.from('food_logs').select('*').eq('user_id', user.id).gte('logged_on', start).lte('logged_on', endIso),
      db.from('water_logs').select('ml, logged_on').eq('user_id', user.id).gte('logged_on', start).lte('logged_on', endIso),
      db.from('workout_sessions').select('*, workout_sets(*)').eq('user_id', user.id).gte('logged_on', start).lte('logged_on', endIso),
      db.from('weight_logs').select('*').eq('user_id', user.id).gte('logged_on', start).lte('logged_on', endIso),
      db.from('profiles').select('*').eq('id', user.id).single(),
      db.from('exercises').select('id, name, muscle_group, kind'),
    ]);
  if (foodErr || waterErr || workoutErr || weightErr || profileErr || exerciseErr) {
    throw new HttpError('INTERNAL', 'Could not build weekly summary.');
  }
  const exerciseMeta = Object.fromEntries(
    (exercises ?? []).map((e) => [e.id, { name: e.name, muscle_group: e.muscle_group, kind: e.kind }])
  );
  return weeklySummary(
    {
      foodLogs: foodLogs ?? [],
      waterLogs: waterLogs ?? [],
      workouts: workouts ?? [],
      weights: weights ?? [],
      exerciseMeta,
      profile: profile ?? null,
    },
    start
  );
}

function totalTrainingVolume(summary: BuiltSummary): number {
  return Object.values(summary.training.volumeByMuscleGroup).reduce((sum, value) => sum + value, 0);
}

async function buildCouncilDetectorMessages(
  c: Context<Env>,
  summary: BuiltSummary
): Promise<string[]> {
  const user = c.get('user');
  const db = c.get('db');
  const messages: string[] = [];

  const { data: latestFood } = await db
    .from('food_logs')
    .select('logged_on')
    .eq('user_id', user.id)
    .order('logged_on', { ascending: false })
    .limit(1);
  const lastLoggedOn = latestFood?.[0]?.logged_on as string | undefined;
  if (lastLoggedOn) {
    const daysQuiet = Math.floor(
      (Date.parse(`${summary.weekEnd}T00:00:00Z`) - Date.parse(`${lastLoggedOn}T00:00:00Z`)) / 86400000
    );
    if (daysQuiet >= 3) {
      messages.push(`Nutrition coach: logging has been quiet for ${daysQuiet} days. No stress — today's simplest meal is enough to restart the signal.`);
    }
  }

  if (
    summary.weightTrend.movingAverageDeltaKg != null &&
    Math.abs(summary.weightTrend.movingAverageDeltaKg) < 0.1 &&
    summary.consistency.foodDaysLogged >= 4
  ) {
    messages.push('Goal coach: weight trend is flat while logging is consistent; offer a small target review as an approval-only proposal.');
  }

  const previous = await buildWeeklySummary(c, addDaysISO(summary.weekStart, -7));
  const previousVolume = totalTrainingVolume(previous);
  const currentVolume = totalTrainingVolume(summary);
  if (previousVolume > 0 && currentVolume <= previousVolume * 0.7) {
    messages.push('Training coach: weekly strength volume dropped by at least 30%; suggest a recovery-aware focus without guilt.');
  }

  return messages;
}

async function saveWeeklyInsight(c: Context<Env>, summary: BuiltSummary) {
  const user = c.get('user');
  const db = c.get('db');
  const { data: existing, error: existingErr } = await db
    .from('insights')
    .select('*')
    .eq('user_id', user.id)
    .eq('kind', 'weekly')
    .eq('week_start', summary.weekStart)
    .maybeSingle();
  if (existingErr) throw new HttpError('INTERNAL', 'Could not check existing review.');
  if (existing) return existing;

  const generated = await generateWeeklyReview(summary);
  const { data, error } = await db
    .from('insights')
    .insert({
      user_id: user.id,
      kind: 'weekly',
      week_start: summary.weekStart,
      content: formatWeeklyReview(generated.content),
      payload: { summary, review: generated.content },
      model: generated.model,
      prompt_version: WEEKLY_REVIEW_PROMPT_VERSION,
    })
    .select()
    .single();
  if (error || !data) throw new HttpError('INTERNAL', 'Could not save weekly review.');
  return data;
}

async function saveCouncilInsight(c: Context<Env>, summary: BuiltSummary) {
  const user = c.get('user');
  const db = c.get('db');
  const detectorMessages = await buildCouncilDetectorMessages(c, summary);
  const council = await generateCouncilPlan(summary, detectorMessages);
  const content = [
    council.plan.headline,
    '',
    `Goal coach: ${council.plan.coaches.goal.summary}`,
    `Nutrition coach: ${council.plan.coaches.nutrition.summary}`,
    `Training coach: ${council.plan.coaches.training.summary}`,
  ].join('\n');
  const row = {
    user_id: user.id,
    kind: 'council',
    week_start: summary.weekStart,
    content,
    payload: { summary, plan: council.plan },
    model: council.model,
    prompt_version: council.promptVersion,
  };
  const { data: existing } = await db
    .from('insights')
    .select('id')
    .eq('user_id', user.id)
    .eq('kind', 'council')
    .eq('week_start', summary.weekStart)
    .maybeSingle();
  const query = existing
    ? db.from('insights').update(row).eq('id', existing.id).eq('user_id', user.id)
    : db.from('insights').insert(row);
  const { data, error } = await query.select().single();
  if (error || !data) throw new HttpError('INTERNAL', 'Could not save council plan.');
  return data;
}

export const insightsRoute = new Hono<Env>()
  .get('/', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { data, error } = await db
      .from('insights')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw new HttpError('INTERNAL', 'Could not load insights.');
    return c.json(ok(data ?? []));
  })
  .delete('/:id', zval('param', deleteInsightParamSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const { error } = await db.from('insights').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not delete insight.');
    return c.json(ok({ id }));
  })
  .get('/weekly-summary', zval('query', weeklySummaryQuerySchema), async (c) => {
    const { week } = c.req.valid('query');
    return c.json(ok(await buildWeeklySummary(c, week)));
  })
  .post('/generate', zval('json', generateInsightSchema), async (c) => {
    const { week } = c.req.valid('json');
    const summary = await buildWeeklySummary(c, week);
    const insight = hasEnoughDataForCouncil(summary)
      ? await saveCouncilInsight(c, summary)
      : await saveWeeklyInsight(c, summary);
    return c.json(ok(insight));
  })
  .post('/physique/analyze', zval('json', analyzePhysiqueSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { week, notes, photos } = c.req.valid('json');
    const { data: profile, error: profileErr } = await db
      .from('profiles')
      .select('notification_prefs')
      .eq('id', user.id)
      .single();
    const consent = (profile?.notification_prefs as Record<string, unknown> | null)?.ai_consent as
      | { physique?: boolean; free_tier_acknowledged?: boolean }
      | undefined;
    if (profileErr || !consent?.physique || !consent?.free_tier_acknowledged) {
      throw new HttpError('FORBIDDEN', 'Physique analysis needs AI photo consent first.');
    }
    const summary = await buildWeeklySummary(c, week);
    const feedback = await analyzePhysique(photos, summary, notes);
    const content = feedback.feedback;
    const { data, error } = await db
      .from('insights')
      .insert({
        user_id: user.id,
        kind: 'physique',
        week_start: summary.weekStart,
        content,
        payload: { weekStart: summary.weekStart, refused: feedback.refused },
        model: feedback.model,
        prompt_version: feedback.promptVersion,
      })
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not save physique feedback.');
    return c.json(ok(data));
  })
  .post('/council', zval('json', generateInsightSchema), async (c) => {
    const { week } = c.req.valid('json');
    const summary = await buildWeeklySummary(c, week);
    const insight = hasEnoughDataForCouncil(summary)
      ? await saveCouncilInsight(c, summary)
      : await saveWeeklyInsight(c, summary);
    return c.json(ok(insight));
  })
  .post('/:id/apply-proposal', zval('param', applyCouncilProposalParamSchema), zval('json', applyCouncilProposalSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { id } = c.req.valid('param');
    const { proposal } = c.req.valid('json');

    const { data: insight, error: insightErr } = await db
      .from('insights')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('kind', 'council')
      .maybeSingle();
    if (insightErr) throw new HttpError('INTERNAL', 'Could not load council plan.');
    if (!insight) throw new HttpError('NOT_FOUND', 'Council plan not found.');

    const plan = councilPlanSchema.safeParse((insight.payload as Record<string, unknown> | null)?.plan);
    if (!plan.success) throw new HttpError('VALIDATION_ERROR', 'Council plan payload is not applyable.');
    const approved = Object.values(plan.data.coaches)
      .flatMap((coach) => coach.proposals)
      .some((candidate) =>
        candidate.type === 'target_diff' &&
        candidate.target === proposal.target &&
        candidate.label === proposal.label &&
        candidate.proposed === proposal.proposed
      );
    if (!approved) throw new HttpError('VALIDATION_ERROR', 'Proposal does not belong to this council plan.');

    const { data: profile, error: profileErr } = await db
      .from('profiles')
      .select('targets_locked')
      .eq('id', user.id)
      .single();
    if (profileErr || !profile) throw new HttpError('NOT_FOUND', 'Profile not found.');
    if (profile.targets_locked) {
      throw new HttpError('CONFLICT', 'Targets are locked. Unlock custom targets before applying a council proposal.');
    }

    const { data: updatedProfile, error: updateErr } = await db
      .from('profiles')
      .update({ [proposal.target]: Math.round(proposal.proposed), targets_locked: true })
      .eq('id', user.id)
      .select()
      .single();
    if (updateErr || !updatedProfile) throw new HttpError('INTERNAL', 'Could not apply council proposal.');

    const payload = {
      ...((insight.payload as Record<string, unknown> | null) ?? {}),
      appliedProposals: [
        ...(((insight.payload as Record<string, unknown> | null)?.appliedProposals as unknown[] | undefined) ?? []),
        { proposal, applied_at: new Date().toISOString() },
      ],
    };
    const { data: applied, error: appliedErr } = await db
      .from('insights')
      .update({ applied_at: new Date().toISOString(), payload })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (appliedErr || !applied) throw new HttpError('INTERNAL', 'Could not mark council proposal applied.');
    return c.json(ok({ insight: applied, profile: updatedProfile }));
  });
