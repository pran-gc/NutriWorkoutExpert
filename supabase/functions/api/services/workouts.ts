import type { CreateWorkoutSessionInput } from '../../_shared/index.ts';
import { HttpError } from '../middleware/error.ts';
import type { Env } from '../types.ts';

export async function createWorkoutSession(db: Env['Variables']['db'], userId: string, input: Omit<CreateWorkoutSessionInput, 'sets'> & { sets?: CreateWorkoutSessionInput['sets'] }) {
  const { sets = [], ...session } = input;
  const ids = [...new Set(sets.map((set) => set.exercise_id).filter(Boolean))] as string[];
  const kinds = new Map<string, string>();
  if (ids.length) {
    const { data, error } = await db.from('exercises').select('id, kind').in('id', ids).or(`user_id.is.null,user_id.eq.${userId}`);
    if (error) throw new HttpError('INTERNAL', 'Could not validate exercises.');
    for (const row of data ?? []) kinds.set(row.id, row.kind);
    if (kinds.size !== ids.length) throw new HttpError('VALIDATION_ERROR', 'One or more exercises are unavailable. Pick a matching exercise before approval.');
  }
  for (const set of sets) {
    const looksCardio = (set.exercise_id ? kinds.get(set.exercise_id) === 'cardio' : set.distance_km != null);
    if (looksCardio && (set.duration_min == null || set.duration_min <= 0)) throw new HttpError('VALIDATION_ERROR', 'Cardio sets need a duration.');
    if (!looksCardio && set.reps == null) throw new HttpError('VALIDATION_ERROR', 'Strength sets need reps.');
  }
  const { data: created, error } = await db.from('workout_sessions').insert({ ...session, user_id: userId }).select().single();
  if (error || !created) throw new HttpError('INTERNAL', 'Could not save workout.');
  if (sets.length) {
    const { error: setsError } = await db.from('workout_sets').insert(sets.map((set) => ({ ...set, session_id: created.id, user_id: userId })));
    if (setsError) {
      await db.from('workout_sessions').delete().eq('id', created.id).eq('user_id', userId);
      throw new HttpError('INTERNAL', 'Could not save workout sets.');
    }
  }
  const { data } = await db.from('workout_sessions').select('*, workout_sets(*)').eq('id', created.id).eq('user_id', userId).single();
  return data ?? created;
}
