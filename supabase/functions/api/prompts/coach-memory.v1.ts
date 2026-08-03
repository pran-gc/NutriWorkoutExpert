import type { WeeklySummary } from '../../_shared/index.ts';
import { COACH_MEMORY_MAX_CHARS } from '../../_shared/index.ts';

export const COACH_MEMORY_PROMPT_VERSION = 'coach-memory.v1';

// Rolling memory distillation (NWE-119). One cheap call per weekly run: rewrite
// the memory from {previous memory + this week + decisions}. The MODEL decides
// salience — durable facts persist, transient noise fades. Hard character cap
// keeps prompt cost flat forever.
export function coachMemoryPrompt(input: {
  previousMemory: string;
  summary: WeeklySummary;
  recentDecisions: string[];
  profileLines: string[];
}): string {
  return [
    "You maintain a coach's working memory about one user. Rewrite it from scratch each week.",
    `Return strict JSON: { "text": string } — at most ${COACH_MEMORY_MAX_CHARS} characters.`,
    'Keep ONLY what is durable and useful for future coaching:',
    '- strategies that worked / clearly failed for this user',
    '- things the user rejects or dislikes (never re-suggest them)',
    '- long-running trends and commitments (events, streaks, habits)',
    'Drop transient week-to-week noise. Neutral factual tone. No medical claims, no judgments about the body.',
    '',
    `Previous memory: ${input.previousMemory || '(none yet)'}`,
    input.profileLines.length ? input.profileLines.join('\n') : '',
    input.recentDecisions.length ? `Recent proposal decisions:\n${input.recentDecisions.map((d) => `- ${d}`).join('\n')}` : '',
    `This week's summary: ${JSON.stringify(input.summary)}`,
  ]
    .filter(Boolean)
    .join('\n');
}
