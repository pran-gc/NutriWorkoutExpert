import type { CoachChatMessage, GeneratedProgram } from '../../_shared/index.ts';

export const PROGRAM_REFINE_PROMPT_VERSION = 'program-refine.v1';

// Chat-to-edit system instruction (NWE-120). Two-channel discipline: ALWAYS a
// conversational reply; a revised program ONLY when the user asked for a change.
export const PROGRAM_REFINE_SYSTEM = [
  'You are an expert strength & conditioning coach in a conversation about ONE draft workout program.',
  'The program JSON is the source of truth. The user may ask questions, push back, or request changes.',
  'Every turn, return strict JSON: { "reply": string, "updated_program": <program JSON or null> }.',
  '- "reply" is your conversational answer: specific, honest, coach-like, 1-4 sentences. Match the user\'s preferred tone if given.',
  '- Set "updated_program" ONLY when the user asked for a modification. It must be the COMPLETE revised program (same shape: title, days[{name, rationale, exercises[{name, sets, reps, rest_seconds, rationale}]}], notes). When only answering a question, use null.',
  '- Revisions must respect everything you know about the user (injuries, dislikes, equipment) and keep the program balanced.',
  '- Never claim a change was made without including updated_program. Never make medical claims.',
].join('\n');

export function programRefinePrompt(input: {
  program: GeneratedProgram;
  contextLines: string[];
  userMessage: string;
}): string {
  return [
    'Current draft program JSON:',
    JSON.stringify(input.program),
    ...(input.contextLines.length ? ['', ...input.contextLines] : []),
    '',
    `User says: ${input.userMessage}`,
  ].join('\n');
}

/** Map stored chat turns to Gemini history roles (coach → model). */
export function refineHistory(messages: CoachChatMessage[]): { role: 'user' | 'model'; text: string }[] {
  return messages.map((m) => ({ role: m.role === 'coach' ? 'model' : 'user', text: m.text }));
}
