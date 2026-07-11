import { Hono } from 'hono';

import {
  ok,
  saveGeneratedProgramSchema,
  detectTrainingSignals,
  upsertRoutineSchema,
  workoutProgramQuestionnaireSchema,
} from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import { zval } from '../middleware/validate.ts';
import { generateRoutineDiff, generateWorkoutProgram } from '../services/gemini.ts';
import { PROGRAM_GEN_PROMPT_VERSION } from '../prompts/program-gen.v1.ts';
import type { Env } from '../types.ts';

async function loadRoutine(db: Env['Variables']['db'], userId: string, id: string) {
  const { data, error } = await db
    .from('routines')
    .select('*, routine_exercises(*, exercise:exercises(*))')
    .eq('id', id)
    .eq('user_id', userId)
    .order('position', { foreignTable: 'routine_exercises', ascending: true })
    .single();
  if (error || !data) throw new HttpError('NOT_FOUND', 'Routine not found.');
  return data;
}

async function exerciseIdForName(db: Env['Variables']['db'], userId: string, name: string): Promise<string> {
  const { data: existing } = await db
    .from('exercises')
    .select('id')
    .ilike('name', name)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .limit(1);
  if (existing?.[0]?.id) return existing[0].id;
  const { data, error } = await db
    .from('exercises')
    .insert({ user_id: userId, name, muscle_group: 'full_body', kind: 'strength' })
    .select('id')
    .single();
  if (error || !data) throw new HttpError('INTERNAL', `Could not create exercise "${name}".`);
  return data.id;
}

export const routinesRoute = new Hono<Env>()
  .get('/', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { data, error } = await db
      .from('routines')
      .select('*, routine_exercises(*, exercise:exercises(*))')
      .eq('user_id', user.id)
      .order('position', { foreignTable: 'routine_exercises', ascending: true })
      .order('updated_at', { ascending: false });
    if (error) throw new HttpError('INTERNAL', 'Could not load routines.');
    return c.json(ok(data ?? []));
  })
  .post('/generate', zval('json', workoutProgramQuestionnaireSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const body = c.req.valid('json');
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 1);
    const { count, error } = await db
      .from('insights')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('kind', 'training')
      .eq('prompt_version', PROGRAM_GEN_PROMPT_VERSION)
      .gte('created_at', since.toISOString());
    if (error) throw new HttpError('INTERNAL', 'Could not check program quota.');
    if ((count ?? 0) >= 3) throw new HttpError('RATE_LIMITED', 'Daily program generation limit reached.');
    const program = await generateWorkoutProgram(body);
    await db.from('insights').insert({
      user_id: user.id,
      kind: 'training',
      detector: 'program_generation',
      content: `Generated program draft: ${program.title}`,
      payload: { program, questionnaire: body },
      model: 'program-generator',
      prompt_version: PROGRAM_GEN_PROMPT_VERSION,
    });
    return c.json(ok(program));
  })
  .post('/generated/save', zval('json', saveGeneratedProgramSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { program } = c.req.valid('json');
    const saved = [];
    for (const [dayIndex, day] of program.days.entries()) {
      const { data: routine, error } = await db
        .from('routines')
        .insert({
          user_id: user.id,
          name: `${program.title} · ${day.name}`,
          notes: day.rationale,
          source: 'ai',
        })
        .select()
        .single();
      if (error || !routine) throw new HttpError('INTERNAL', 'Could not save generated program.');
      const items = [];
      for (const [position, exercise] of day.exercises.entries()) {
        items.push({
          user_id: user.id,
          routine_id: routine.id,
          exercise_id: exercise.exercise_id ?? await exerciseIdForName(db, user.id, exercise.name),
          position,
          target_sets: exercise.sets,
          target_reps: exercise.reps ?? null,
        });
      }
      const { error: itemErr } = await db.from('routine_exercises').insert(items);
      if (itemErr) throw new HttpError('INTERNAL', 'Could not save generated program exercises.');
      saved.push(await loadRoutine(db, user.id, routine.id));
      if (dayIndex === 0) {
        await db.from('insights').insert({
          user_id: user.id,
          kind: 'training',
          content: `Generated program: ${program.title}`,
          payload: { program },
          model: 'program-generator',
          prompt_version: PROGRAM_GEN_PROMPT_VERSION,
        });
      }
    }
    return c.json(ok(saved));
  })
  .post('/', zval('json', upsertRoutineSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const { exercises = [], ...routine } = c.req.valid('json');
    const { data: created, error } = await db
      .from('routines')
      .insert({ ...routine, user_id: user.id })
      .select()
      .single();
    if (error || !created) throw new HttpError('INTERNAL', 'Could not save routine.');
    if (exercises.length) {
      const { error: itemError } = await db.from('routine_exercises').insert(
        exercises.map((item) => ({ ...item, routine_id: created.id, user_id: user.id }))
      );
      if (itemError) {
        await db.from('routines').delete().eq('id', created.id).eq('user_id', user.id);
        throw new HttpError('INTERNAL', 'Could not save routine exercises.');
      }
    }
    return c.json(ok(await loadRoutine(db, user.id, created.id)));
  })
  .put('/:id', zval('json', upsertRoutineSchema), async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const { exercises = [], ...routine } = c.req.valid('json');
    const { data: updated, error } = await db
      .from('routines')
      .update(routine)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error || !updated) throw new HttpError('NOT_FOUND', 'Routine not found.');
    const { error: deleteErr } = await db
      .from('routine_exercises')
      .delete()
      .eq('routine_id', id)
      .eq('user_id', user.id);
    if (deleteErr) throw new HttpError('INTERNAL', 'Could not update routine.');
    if (exercises.length) {
      const { error: itemError } = await db.from('routine_exercises').insert(
        exercises.map((item) => ({ ...item, routine_id: id, user_id: user.id }))
      );
      if (itemError) throw new HttpError('INTERNAL', 'Could not update routine exercises.');
    }
    return c.json(ok(await loadRoutine(db, user.id, id)));
  })
  .delete('/:id', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const { error } = await db.from('routines').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new HttpError('INTERNAL', 'Could not delete routine.');
    return c.json(ok({ id }));
  })
  .post('/:id/adapt', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const routine = await loadRoutine(db, user.id, id);
    const { data: recent, error: recentErr } = await db
      .from('workout_sessions')
      .select('*, workout_sets(*)')
      .eq('user_id', user.id)
      .gte('logged_on', new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10));
    if (recentErr) throw new HttpError('INTERNAL', 'Could not load training history.');
    const signals = detectTrainingSignals({ sessions: recent ?? [], plannedSessionsPerWeek: routine.routine_exercises?.length ? 3 : 2, today: new Date().toISOString().slice(0, 10) });
    const signal = signals[0] ?? {
      detector: 'manual_routine_review',
      message: `Review routine "${routine.name}" for a gentle progression adjustment.`,
      kind: 'manual',
    };
    const { data: snoozed } = await db
      .from('insights')
      .select('id, dismissed_at')
      .eq('user_id', user.id)
      .eq('kind', 'training')
      .eq('detector', signal.detector)
      .gte('dismissed_at', new Date(Date.now() - 14 * 86400000).toISOString())
      .limit(1);
    if ((snoozed ?? []).length > 0) throw new HttpError('RATE_LIMITED', 'This suggestion is snoozed for now.');
    const { count } = await db
      .from('insights')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('kind', 'training')
      .eq('detector', signal.detector)
      .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString());
    if ((count ?? 0) >= 1) throw new HttpError('RATE_LIMITED', 'This detector already suggested a change recently.');
    const diff = await generateRoutineDiff(signal.message, { routine, signal, recent });
    const { data, error } = await db
      .from('insights')
      .insert({
        user_id: user.id,
        kind: 'training',
        detector: signal.detector,
        content: `${diff.title}\n\n${diff.reason}`,
        payload: { routine_id: id, diff, signal },
        model: 'local-routine-diff',
        prompt_version: 'adaptive-training.v1',
      })
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not save training suggestion.');
    return c.json(ok({ insight: data, diff }));
  })
  .post('/:id/dismiss-diff', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    await loadRoutine(db, user.id, id);
    const { data, error } = await db
      .from('insights')
      .insert({
        user_id: user.id,
        kind: 'training',
        detector: `dismissed_routine:${id}`,
        content: 'Training suggestion dismissed for now.',
        payload: { routine_id: id },
        model: 'local-routine-diff',
        prompt_version: 'adaptive-training.v1',
        dismissed_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not dismiss training suggestion.');
    return c.json(ok(data));
  })
  .post('/:id/apply-diff', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    await loadRoutine(db, user.id, id);
    const { data, error } = await db
      .from('insights')
      .insert({
        user_id: user.id,
        kind: 'training',
        detector: 'manual_apply',
        content: 'Training suggestion applied. Review the routine and keep what fits.',
        payload: { routine_id: id, applied: true },
        model: 'local-routine-diff',
        prompt_version: 'adaptive-training.v1',
        applied_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !data) throw new HttpError('INTERNAL', 'Could not apply training suggestion.');
    return c.json(ok(data));
  })
  .get('/:id/prefill', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const id = c.req.param('id');
    const routine = await loadRoutine(db, user.id, id);
    const items = [...(routine.routine_exercises ?? [])].sort(
      (a: { position: number }, b: { position: number }) => a.position - b.position
    );
    const prefill = [];
    for (const item of items) {
      const { data } = await db
        .from('workout_sets')
        .select('reps, weight_kg, duration_min, distance_km, created_at')
        .eq('user_id', user.id)
        .eq('exercise_id', item.exercise_id)
        .order('created_at', { ascending: false })
        .limit(1);
      prefill.push({ ...item, last_set: data?.[0] ?? null });
    }
    return c.json(ok({ routine, exercises: prefill }));
  });
