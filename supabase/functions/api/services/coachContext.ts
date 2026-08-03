// The ONE place coach awareness is assembled (NWE-118/119). Every AI route calls
// this and passes the result into its prompt builder, so what the coach "knows"
// is consistent, capped, and testable in a single spot.
//
//   coachingProfile  — stated intent (user-edited, Zod-owned jsonb)
//   coachMemory      — rolling distilled summary (≤1200 chars, weekly rewrite)
//   recentDecisions  — the behavioral feedback loop: the last few proposals the
//                      user explicitly applied or dismissed ("dismissed cardio
//                      twice" beats any amount of model guessing)
import {
  type CoachingProfile,
  coachMemorySchema,
  coachingProfileSchema,
} from '../../_shared/index.ts';
import type { Env } from '../types.ts';

export interface CoachContext {
  coachingProfile: CoachingProfile | null;
  coachMemory: string;
  recentDecisions: string[];
}

type Db = Env['Variables']['db'];

export async function buildCoachContext(db: Db, userId: string): Promise<CoachContext> {
  const [{ data: profile }, { data: decided }] = await Promise.all([
    db.from('profiles').select('coaching_profile, coach_memory').eq('id', userId).single(),
    db
      .from('insights')
      .select('kind, detector, content, applied_at, dismissed_at, created_at')
      .eq('user_id', userId)
      .or('applied_at.not.is.null,dismissed_at.not.is.null')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const coachingParsed = coachingProfileSchema.safeParse(profile?.coaching_profile ?? {});
  const memoryParsed = coachMemorySchema.safeParse(profile?.coach_memory ?? {});

  const recentDecisions = (decided ?? []).map((row) => {
    const verb = row.applied_at ? 'APPLIED' : 'DISMISSED';
    const what = row.detector ?? row.kind;
    const firstLine = (row.content ?? '').split('\n')[0].slice(0, 120);
    return `${verb} ${what}: ${firstLine}`;
  });

  const coachingProfile = coachingParsed.success ? coachingParsed.data : null;
  const hasProfile = coachingProfile && Object.keys(coachingProfile).length > 0;

  return {
    coachingProfile: hasProfile ? coachingProfile : null,
    coachMemory: memoryParsed.success ? (memoryParsed.data.text ?? '') : '',
    recentDecisions,
  };
}

/** Render the context as prompt lines (empty array when there's nothing to say). */
export function coachContextLines(ctx: CoachContext): string[] {
  const lines: string[] = [];
  if (ctx.coachingProfile) {
    const p = ctx.coachingProfile;
    lines.push('What the user has told you about themselves:');
    if (p.motivation) lines.push(`- Motivation: ${p.motivation}`);
    if (p.target_event?.name) {
      lines.push(`- Target event: ${p.target_event.name}${p.target_event.date ? ` on ${p.target_event.date}` : ''}`);
    }
    if (p.preferences?.length) lines.push(`- Preferences: ${p.preferences.join('; ')}`);
    if (p.dislikes?.length) lines.push(`- Dislikes (respect these — do not program them): ${p.dislikes.join('; ')}`);
    if (p.injuries?.length) lines.push(`- Injuries/constraints (work around them): ${p.injuries.join('; ')}`);
    if (p.coach_tone) lines.push(`- Preferred coaching tone: ${p.coach_tone}`);
  }
  if (ctx.coachMemory) {
    lines.push(`Coach memory (what you know from working with this user): ${ctx.coachMemory}`);
  }
  if (ctx.recentDecisions.length) {
    lines.push('Recent proposal decisions (learn from these — stop repeating what they dismiss):');
    for (const d of ctx.recentDecisions) lines.push(`- ${d}`);
  }
  return lines;
}
