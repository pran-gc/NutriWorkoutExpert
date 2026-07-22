import {
  ASSISTANT_DEFAULT_STEP_CAP,
  ASSISTANT_HARD_STEP_CAP,
  ASSISTANT_LOOP_BUDGET_MS,
  type AssistantSseEvent,
  type AssistantProposal,
  type AssistantToolTrace,
} from '../../../_shared/index.ts';
import { HttpError } from '../../middleware/error.ts';
import { interactionModel } from './model.ts';
import {
  dispatchTool,
  interactionToolDeclarations,
  type ToolRegistry,
  type ToolContext,
} from './registry.ts';

export interface InteractionRequest {
  model: string;
  input: string | unknown[];
  tools: Record<string, unknown>[];
  system_instruction: string;
  generation_config: Record<string, unknown>;
  response_format?: Record<string, unknown>;
  stream: boolean;
  store: boolean;
  previous_interaction_id?: string;
}

export interface InteractionTransport {
  create(request: InteractionRequest, signal?: AbortSignal): AsyncIterable<unknown>;
}

type LoopEvent = Extract<AssistantSseEvent, { type: 'thought' | 'function_call' | 'text' }>;

export interface RunAgentLoopOptions {
  input: string;
  previousInteractionId?: string | null;
  context: ToolContext;
  registry: ToolRegistry;
  transport: InteractionTransport;
  emit(event: LoopEvent | Extract<AssistantSseEvent, { type: 'proposal' }>): void | Promise<void>;
  persistProposal?(proposal: unknown): Promise<{ insight_id: string; proposal_kind: string; proposal: AssistantProposal }>;
  stepCap?: number;
  budgetMs?: number;
  threadId?: string;
}

export interface AgentLoopResult {
  interactionId: string | null;
  text: string;
  trace: AssistantToolTrace[];
  totalTokens: number | null;
  proposalInsightId: string | null;
}

/**
 * A loop failure that still carries whatever the turn produced before it broke.
 * The route persists this partial progress so a failed turn never leaves a
 * dangling user message, and so `last_interaction_id` still advances (otherwise
 * the next message would resume Gemini from stale server-side state).
 */
export class AgentLoopError extends HttpError {
  readonly partial: AgentLoopResult;
  constructor(cause: HttpError, partial: AgentLoopResult) {
    super(cause.code, cause.message, cause.details);
    this.name = 'AgentLoopError';
    this.partial = partial;
  }
}

interface FunctionCall {
  index: number;
  id: string;
  name: string;
  initialArguments: unknown;
  argumentsText: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function argsPreview(args: unknown): Record<string, unknown> {
  const source = record(args) ?? {};
  return Object.fromEntries(Object.entries(source).slice(0, 8).map(([key, value]) => {
    if (typeof value === 'string') return [key, value.slice(0, 80)];
    if (Array.isArray(value)) return [key, `[${value.length} items]`];
    return [key, value];
  }));
}

export function buildSystemInstruction(now = new Date()): string {
  const currentDate = now.toISOString().slice(0, 10);
  return `You are the NutriWorkoutExpert assistant. Use tools when real user data is needed; never invent logs.
The current date is ${currentDate}. Use it for “today” and resolve relative dates before creating proposals.
You can read user data and create proposal artifacts. You never apply changes yourself.
When the user explicitly asks to log, add, save, or change something and you have the required details, call the matching proposal tool immediately. Do not ask permission to prepare it.
If a required detail is genuinely missing, ask only one concise follow-up question. Do not recap known details or discuss what will happen after they answer.
The interface automatically renders every created proposal as an actionable card directly below your reply. Never say “in the app”, “full control”, “review and approve”, “proposal I sent”, or narrate tools, permissions, safety boundaries, and implementation details.
After creating a proposal, do not repeat its contents in prose. The interface supplies a brief acknowledgement and the card carries the details and action.
Create at most one proposal per turn.
If a tool returns invalid_arguments, correct the arguments and call that tool again in the same turn. Never expose validation details to the user; ask a concise follow-up only when the missing value cannot be inferred or found with a read tool.
Use get_recipes/get_recipe only for saved recipes. Use resolve_macros before proposing composite food or recipes so every ingredient has nutrition and provenance.
Use propose_food_logs only when the user says they ate something; use propose_recipe for a reusable recipe; use propose_meal_plan for future suggestions.
Use propose_workout_log only for completed training; use propose_program_revision only for future routine changes. When revising a visible proposal, set supersedes_insight_id to that proposal's id.
Be encouraging, concise, body-neutral, and specific. Do not diagnose, make medical claims, shame, or guilt.
Treat allergies and stated injuries as hard constraints. Never request or expose emails, photos, or identifiers.`;
}

function proposalAcknowledgement(proposal: AssistantProposal): string {
  if (proposal.kind === 'workout_log') return 'I’ve put the workout together below.';
  if (proposal.kind === 'food_logs') return 'I’ve put the food log together below.';
  if (proposal.kind === 'recipe') return 'I’ve put the recipe together below.';
  if (proposal.kind === 'program_revision') return 'I’ve mapped out the routine update below.';
  if (proposal.kind === 'meal_plan') return 'I’ve put the meal plan together below.';
  return 'I’ve outlined the target update below.';
}

export async function runAgentLoop(options: RunAgentLoopOptions): Promise<AgentLoopResult> {
  const stepCap = Math.min(ASSISTANT_HARD_STEP_CAP, Math.max(1, options.stepCap ?? ASSISTANT_DEFAULT_STEP_CAP));
  const controller = new AbortController();
  const requestedBudget = options.budgetMs ?? ASSISTANT_LOOP_BUDGET_MS;
  const budgetMs = options.budgetMs !== undefined && ASSISTANT_LOOP_BUDGET_MS > 0
    ? Math.min(ASSISTANT_LOOP_BUDGET_MS, requestedBudget)
    : requestedBudget;
  const timeout = budgetMs > 0 ? setTimeout(() => controller.abort(), budgetMs) : null;
  const tools = interactionToolDeclarations(options.registry);
  const trace: AssistantToolTrace[] = [];
  let input: string | unknown[] = options.input;
  let previousInteractionId = options.previousInteractionId ?? undefined;
  let finalText = '';
  let totalTokens: number | null = null;
  let proposalInsightId: string | null = null;
  let persistedProposal: AssistantProposal | null = null;

  // Snapshot of everything produced so far, so a mid-loop failure can still be
  // persisted by the caller instead of being discarded.
  const partial = (): AgentLoopResult => ({
    interactionId: previousInteractionId ?? options.previousInteractionId ?? null,
    text: finalText,
    trace,
    totalTokens,
    proposalInsightId,
  });

  try {
    for (let turn = 0; turn < stepCap; turn++) {
      if (controller.signal.aborted) throw new HttpError('UPSTREAM_ERROR', 'The assistant took too long. Please try again.');
      const calls = new Map<number, FunctionCall>();
      let interactionId: string | null = null;
      let status = '';
      let thoughtEmitted = false;
      const request: InteractionRequest = {
        model: interactionModel(),
        input,
        tools,
        system_instruction: buildSystemInstruction(),
        // Gemini's validated mode preserves normal text-or-tool choice while
        // constraining any function call to its declared parameter schema.
        generation_config: { tool_choice: 'validated', thinking_level: 'low' },
        stream: true,
        store: true,
        ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
      };

      for await (const rawEvent of options.transport.create(request, controller.signal)) {
        const event = record(rawEvent);
        if (!event) continue;
        const eventType = typeof event.event_type === 'string' ? event.event_type : '';
        if (eventType === 'interaction.created') {
          const interaction = record(event.interaction);
          if (typeof interaction?.id === 'string') {
            interactionId = interaction.id;
            // Promote immediately: if the stream fails mid-turn, the caller still
            // needs this id so the next message resumes from the right state.
            previousInteractionId = interaction.id;
          }
        } else if (eventType === 'step.start') {
          const step = record(event.step);
          const index = typeof event.index === 'number' ? event.index : -1;
          if (step?.type === 'thought' && !thoughtEmitted) {
            thoughtEmitted = true;
            await options.emit({ type: 'thought', message: 'Thinking…' });
          } else if (step?.type === 'function_call' && index >= 0 && typeof step.id === 'string' && typeof step.name === 'string') {
            calls.set(index, {
              index,
              id: step.id,
              name: step.name,
              initialArguments: step.arguments,
              argumentsText: '',
            });
          }
        } else if (eventType === 'step.delta') {
          const delta = record(event.delta);
          const index = typeof event.index === 'number' ? event.index : -1;
          if (delta?.type === 'arguments_delta' && typeof delta.arguments === 'string') {
            const call = calls.get(index);
            if (call) call.argumentsText += delta.arguments;
          } else if (delta?.type === 'text' && typeof delta.text === 'string') {
            // Once a proposal exists, its card is the primary UI. Suppress the
            // model's redundant implementation narration and emit one concise,
            // deterministic acknowledgement when the interaction completes.
            if (!persistedProposal) {
              finalText += delta.text;
              await options.emit({ type: 'text', delta: delta.text });
            }
          }
        } else if (eventType === 'interaction.completed') {
          const interaction = record(event.interaction);
          if (typeof interaction?.id === 'string') {
            interactionId = interaction.id;
            previousInteractionId = interaction.id;
          }
          if (typeof interaction?.status === 'string') status = interaction.status;
          const usage = record(interaction?.usage);
          if (typeof usage?.total_tokens === 'number') totalTokens = (totalTokens ?? 0) + usage.total_tokens;
        } else if (eventType === 'error') {
          const error = record(event.error);
          throw new HttpError('UPSTREAM_ERROR', typeof error?.message === 'string' ? error.message : 'The assistant stream failed.');
        } else if (eventType === 'interaction.status_update' || eventType === 'step.stop') {
          // Expected lifecycle events; they carry no content the loop needs.
        } else if (eventType) {
          console.debug(JSON.stringify({ scope: 'assistant_interactions', skipped_event: eventType }));
        }
      }

      if (!interactionId) throw new HttpError('UPSTREAM_ERROR', 'The assistant returned an incomplete response.');
      previousInteractionId = interactionId;
      if (calls.size === 0 || status !== 'requires_action') {
        if (persistedProposal) {
          finalText = proposalAcknowledgement(persistedProposal);
          await options.emit({ type: 'text', delta: finalText });
        }
        return { interactionId, text: finalText, trace, totalTokens, proposalInsightId };
      }
      if (turn + 1 >= stepCap) throw new HttpError('UPSTREAM_ERROR', 'Assistant step limit reached; please ask a narrower follow-up.');

      const functionResults = await Promise.all([...calls.values()].map(async (call) => {
        const started = performance.now();
        let parsedArgs: unknown = {};
        let ok = false;
        const repairResult = (message: string, details?: unknown) => ({
          type: 'function_result', name: call.name, call_id: call.id,
          result: { content: [{ type: 'text', text: JSON.stringify({
            error: 'invalid_arguments', message, details,
            instruction: `Correct the arguments and call ${call.name} again now. Ask the user only if a required fact cannot be inferred from the conversation or read tools.`,
          }) }] },
        });
        try {
          try {
            if (call.argumentsText) {
              parsedArgs = JSON.parse(call.argumentsText);
            } else if (typeof call.initialArguments === 'string') {
              parsedArgs = JSON.parse(call.initialArguments || '{}');
            } else {
              parsedArgs = call.initialArguments ?? {};
            }
          } catch {
            return repairResult('Arguments were not valid JSON. Return one complete JSON object matching the declaration.');
          }
          await options.emit({ type: 'function_call', name: call.name, args: argsPreview(parsedArgs) });
          const dispatched = await dispatchTool(options.registry, call.name, options.context, parsedArgs);
          let result = dispatched.result;
          if (dispatched.kind === 'proposal') {
            if (!options.persistProposal) throw new HttpError('INTERNAL', 'Proposal persistence is unavailable.');
            const persisted = await options.persistProposal(result);
            proposalInsightId = persisted.insight_id;
            persistedProposal = persisted.proposal;
            await options.emit({ type: 'proposal', ...persisted });
            result = {
              status: 'shown_inline', proposal_kind: persisted.proposal_kind,
              instruction: 'The action card is already visible in this conversation. Do not describe app mechanics or repeat its details.',
            };
          }
          ok = true;
          return {
            type: 'function_result', name: call.name, call_id: call.id,
            result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
          };
        } catch (error) {
          if (error instanceof HttpError && error.code === 'VALIDATION_ERROR') {
            return repairResult(error.message, error.details);
          }
          throw error;
        } finally {
          const item = { name: call.name, args_preview: argsPreview(parsedArgs), ms: Math.round(performance.now() - started), ok };
          trace.push(item);
          console.info(JSON.stringify({ scope: 'assistant_step', thread_id: options.threadId, step: turn + 1, tool: call.name, ...item, tokens: totalTokens }));
        }
      }));
      input = functionResults;
    }
    throw new HttpError('UPSTREAM_ERROR', 'Assistant step limit reached; please ask a narrower follow-up.');
  } catch (error) {
    // Re-throw carrying partial progress. Already-wrapped errors pass through.
    if (error instanceof AgentLoopError) throw error;
    if (controller.signal.aborted) {
      throw new AgentLoopError(
        new HttpError('UPSTREAM_ERROR', 'The assistant took too long. Please try again.'),
        partial(),
      );
    }
    if (error instanceof HttpError) throw new AgentLoopError(error, partial());
    throw new AgentLoopError(
      new HttpError('INTERNAL', 'The assistant could not finish that response.', error),
      partial()
    );
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}
