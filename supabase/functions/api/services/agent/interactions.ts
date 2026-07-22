import { HttpError } from '../../middleware/error.ts';
import type { InteractionRequest, InteractionTransport } from './loop.ts';
import { interactionModel } from './model.ts';

const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
let activeMockRaw: string | null = null;
let activeMockSequences: unknown[][] = [];

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseInteractionSseData(data: string): unknown | null {
  const value = data.trim();
  if (!value || value === '[DONE]') return null;
  return JSON.parse(value);
}

export function readGeminiError(body: unknown): { code: string; message: string } {
  const envelope = record(Array.isArray(body) ? body[0] : body);
  const error = record(envelope?.error);
  return {
    code: typeof error?.status === 'string' ? error.status : '',
    message: typeof error?.message === 'string' ? error.message.slice(0, 300) : '',
  };
}

function mockTransport(): InteractionTransport | null {
  const raw = Deno.env.get('GEMINI_MOCK_INTERACTION_SEQUENCE');
  if (!raw) {
    activeMockRaw = null;
    activeMockSequences = [];
    return null;
  }
  if (raw !== activeMockRaw) {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(Array.isArray)) {
      throw new Error('GEMINI_MOCK_INTERACTION_SEQUENCE must be an array of event arrays.');
    }
    activeMockRaw = raw;
    activeMockSequences = [...parsed] as unknown[][];
  }
  return {
    async *create() {
      for (const event of activeMockSequences.shift() ?? []) yield event;
    },
  };
}

async function* parseSseBody(body: ReadableStream<Uint8Array>): AsyncIterable<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const takeBlock = (): string | null => {
    const match = buffer.match(/\r?\n\r?\n/);
    if (match?.index === undefined) return null;
    const block = buffer.slice(0, match.index);
    buffer = buffer.slice(match.index + match[0].length);
    return block;
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let block = takeBlock();
    while (block !== null) {
      const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (data) {
        const event = parseInteractionSseData(data);
        if (event !== null) yield event;
      }
      block = takeBlock();
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const data = buffer.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (data) {
      const event = parseInteractionSseData(data);
      if (event !== null) yield event;
    }
  }
}

export function createInteractionTransport(): InteractionTransport {
  const mock = mockTransport();
  if (mock) return mock;
  return {
    async *create(request: InteractionRequest, signal?: AbortSignal) {
      const key = Deno.env.get('GEMINI_API_KEY');
      if (!key) throw new HttpError('UPSTREAM_ERROR', 'The assistant is unavailable until Gemini is configured.');
      let response: Response;
      try {
        response = await fetch(INTERACTIONS_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(request),
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw new HttpError('UPSTREAM_ERROR', 'The assistant took too long. Please try again.');
        throw new HttpError('UPSTREAM_ERROR', 'The assistant service is unreachable right now.', error);
      }
      if (!response.ok || !response.body) {
        const retryable = response.status === 429;
        let upstreamMessage = '';
        let upstreamCode = '';
        try {
          const parsed = readGeminiError(await response.clone().json());
          upstreamMessage = parsed.message;
          upstreamCode = parsed.code;
        } catch {
          // Some upstream failures have no JSON body; status remains enough to correlate them.
        }
        console.error(JSON.stringify({
          scope: 'gemini_interactions_error', model: request.model, upstream_status: response.status,
          upstream_code: upstreamCode || undefined, upstream_message: upstreamMessage || undefined,
          upstream_request_id: response.headers.get('x-request-id') ?? response.headers.get('x-goog-request-id') ?? undefined,
        }));
        throw new HttpError(retryable ? 'RATE_LIMITED' : 'UPSTREAM_ERROR', retryable
          ? 'The assistant is busy right now. Please try again shortly.'
          : upstreamMessage.toLowerCase().includes('not found') || upstreamMessage.toLowerCase().includes('not supported')
            ? 'The assistant model is misconfigured. Please update the Gemini model setting.'
            : 'The assistant could not respond right now.');
      }
      yield* parseSseBody(response.body);
    },
  };
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const useArray = arrayStart !== -1 && (start === -1 || arrayStart < start);
  const from = useArray ? arrayStart : start;
  const to = useArray ? text.lastIndexOf(']') : text.lastIndexOf('}');
  if (from === -1 || to < from) throw new Error('Interaction response did not contain JSON.');
  return JSON.parse(text.slice(from, to + 1));
}

export interface StructuredInteractionOptions<T> {
  input: string | unknown[];
  parse(value: unknown): T;
  systemInstruction?: string;
  previousInteractionId?: string | null;
  store?: boolean;
  temperature?: number;
  responseSchema?: Record<string, unknown>;
  model?: string;
  /** Injectable only for deterministic transport contract tests. */
  transport?: InteractionTransport;
}

/** Shared structured-output path used by refiners and one-shot generators. */
export async function structuredInteraction<T>(options: StructuredInteractionOptions<T>): Promise<{
  model: string; value: T; interactionId: string | null;
} | null> {
  const model = options.model ?? interactionModel();
  const transport = options.transport ?? createInteractionTransport();
  for (let attempt = 0; attempt < 2; attempt++) {
    let text = '';
    let interactionId: string | null = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const request: InteractionRequest = {
        model, input: options.input, tools: [], system_instruction: options.systemInstruction ?? '',
        generation_config: { temperature: options.temperature ?? 0.6, thinking_level: 'low' },
        response_format: {
          type: 'text', mime_type: 'application/json',
          ...(options.responseSchema ? { schema: options.responseSchema } : {}),
        },
        stream: true, store: options.store ?? false,
        ...(options.previousInteractionId ? { previous_interaction_id: options.previousInteractionId } : {}),
      };
      for await (const raw of transport.create(request, controller.signal)) {
        const event = record(raw);
        if (!event) continue;
        const kind = typeof event.event_type === 'string' ? event.event_type : '';
        if (kind === 'interaction.created' || kind === 'interaction.completed') {
          const interaction = record(event.interaction);
          if (typeof interaction?.id === 'string') interactionId = interaction.id;
          // Non-streaming-compatible mock/proxy responses may put text in outputs.
          const outputs = Array.isArray(interaction?.outputs) ? interaction.outputs : [];
          for (const output of outputs) {
            const row = record(output);
            if (typeof row?.text === 'string') text += row.text;
          }
        } else if (kind === 'step.delta') {
          const delta = record(event.delta);
          if (delta?.type === 'text' && typeof delta.text === 'string') text += delta.text;
        } else if (kind === 'error') {
          throw new HttpError('UPSTREAM_ERROR', 'Gemini could not complete the interaction.');
        }
      }
      if (!text) throw new Error('Interaction returned no structured text.');
      return { model, value: options.parse(extractJson(text)), interactionId };
    } catch (error) {
      if (attempt === 1) {
        console.error(`[interactions] structured call failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}
