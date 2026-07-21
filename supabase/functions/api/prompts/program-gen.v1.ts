import type { WorkoutProgramQuestionnaire } from '../../_shared/index.ts';

export const PROGRAM_GEN_PROMPT_VERSION = 'program-gen.v1';

// System instruction — sets the agent's expertise, safety rails, and quality bar.
export const PROGRAM_GEN_SYSTEM = [
  'You are an expert strength & conditioning coach with 15+ years designing programs for real people.',
  'You write programs that are safe, effective, progressive, and tailored to the individual.',
  'Principles you always apply:',
  '- Match volume, intensity, and exercise selection to the stated GOAL and EXPERIENCE. A beginner is not an advanced lifter.',
  '- Use a sensible split for the number of training days (e.g. full-body for 2-3 days; upper/lower for 4; push/pull/legs or a bro/PPL hybrid for 5-6). NEVER repeat the same exercises every day.',
  '- Sequence compounds before accessories. Balance push/pull and upper/lower across the week. Include direct work for the specific areas the user names.',
  '- For fat-loss goals, keep strength work to preserve muscle AND add conditioning/cardio finishers.',
  '- Prescribe realistic sets and rep ranges (you may use ranges like "8-12" or "AMRAP" where appropriate).',
  '- Give each day a clear name (its focus) and a one-sentence rationale, and a short rationale per exercise.',
  '- No medical claims, no injury diagnosis. If constraints/injuries are given, program AROUND them and note substitutions.',
  'Return ONLY valid JSON in the requested shape. No markdown, no prose outside the JSON.',
].join('\n');

// Optional context to make it agentic: prior training so the program builds on what
// the user actually does, not a blank slate.
export interface ProgramContext {
  recentExercises?: string[]; // distinct exercises the user has logged
  sessionsPerWeekLogged?: number;
  weightTrendKg?: number | null;
  /** Rendered coach-awareness lines (coaching profile + memory + decisions, NWE-118/119). */
  contextLines?: string[];
}

export function programGenPrompt(input: WorkoutProgramQuestionnaire, ctx?: ProgramContext): string {
  const lines = [
    `Design a ${input.days_per_week}-day-per-week program.`,
    `Goal: ${input.goal}`,
    `Experience: ${input.experience}`,
    `Equipment available: ${input.equipment.join(', ') || 'bodyweight only'}`,
    input.constraints ? `Constraints/injuries to work around: ${input.constraints}` : 'No stated injuries.',
  ];

  if (ctx?.recentExercises?.length) {
    lines.push(
      `The user has recently trained these lifts (bias toward continuity + progression, but improve balance where needed): ${ctx.recentExercises.slice(0, 15).join(', ')}.`
    );
  }
  if (ctx?.sessionsPerWeekLogged != null) {
    lines.push(`They currently average ~${ctx.sessionsPerWeekLogged} logged sessions/week — keep the plan realistically achievable.`);
  }
  if (ctx?.weightTrendKg != null && ctx.weightTrendKg !== 0) {
    lines.push(`Recent weight trend: ${ctx.weightTrendKg > 0 ? '+' : ''}${ctx.weightTrendKg} kg — factor this into volume/conditioning.`);
  }
  if (ctx?.contextLines?.length) {
    lines.push('', ...ctx.contextLines);
  }

  lines.push(
    '',
    `Produce EXACTLY ${input.days_per_week} distinct days, each with 4-6 exercises.`,
    'Output JSON exactly: { "title": string, "days": [ { "name": string, "rationale": string, "exercises": [ { "name": string, "sets": number|string, "reps": number|string, "rest_seconds": number, "rationale": string } ] } ], "notes": string[] }',
    'Use common exercise names (e.g. "Barbell Bench Press", "Romanian Deadlift") that map to a standard gym library.'
  );
  return lines.join('\n');
}
