import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { z } from 'zod';

import { buildSystemInstruction, runAgentLoop, type InteractionRequest, type InteractionTransport } from './loop.ts';
import type { ReadToolRegistry, ToolContext, ToolRegistry } from './registry.ts';

function events(id: string, calls: Array<{ id: string; name: string; fragments: string[]; startArguments?: unknown }> = [], text = '') {
  return [
    { event_type: 'interaction.created', interaction: { id, status: 'in_progress' } },
    ...calls.flatMap((call, index) => [
      { event_type: 'step.start', index, step: {
        id: call.id, type: 'function_call', name: call.name,
        ...(call.startArguments !== undefined ? { arguments: call.startArguments } : {}),
      } },
      ...call.fragments.map((argumentsPart) => ({
        event_type: 'step.delta', index, delta: { type: 'arguments_delta', arguments: argumentsPart },
      })),
      { event_type: 'step.stop', index },
    ]),
    ...(text ? [{ event_type: 'step.delta', index: calls.length, delta: { type: 'text', text } }] : []),
    { event_type: 'future.unknown', value: true },
    { event_type: 'interaction.completed', interaction: { id, status: calls.length ? 'requires_action' : 'completed', usage: { total_tokens: 12 } } },
  ];
}

class FakeTransport implements InteractionTransport {
  requests: InteractionRequest[] = [];
  constructor(private readonly sequences: unknown[][]) {}
  async *create(request: InteractionRequest): AsyncIterable<unknown> {
    this.requests.push(request);
    for (const event of this.sequences.shift() ?? []) yield event;
  }
}

Deno.test('agent prompt gives the model an explicit current date for log proposals', () => {
  const instruction = buildSystemInstruction(new Date('2026-07-22T01:02:03Z'));
  assertStringIncludes(instruction, 'The current date is 2026-07-22');
  assertStringIncludes(instruction, 'Use it for “today”');
  assertStringIncludes(instruction, 'ask only one concise follow-up question');
  assertStringIncludes(instruction, 'Never say “in the app”');
  assertEquals(instruction.includes('Explain that the user stays in control'), false);
});

Deno.test('agent loop aggregates split args, runs parallel reads, and continues by interaction id', async () => {
  let active = 0;
  let maxActive = 0;
  const registry: ToolRegistry = {
    first: {
      type: 'function', name: 'first', description: 'first', parameters: { type: 'object', properties: {} },
      kind: 'read', args: z.object({}).passthrough(), limits: { maxRows: 200, maxRangeDays: 365 },
      run: async () => { active++; maxActive = Math.max(maxActive, active); await Promise.resolve(); active--; return { first: true }; },
    },
    second: {
      type: 'function', name: 'second', description: 'second', parameters: { type: 'object', properties: {} },
      kind: 'read', args: z.object({}).passthrough(), limits: { maxRows: 200, maxRangeDays: 365 },
      run: async () => { active++; maxActive = Math.max(maxActive, active); await Promise.resolve(); active--; return { second: true }; },
    },
  };
  const transport = new FakeTransport([
    events('interaction-1', [
      { id: 'call-1', name: 'first', startArguments: {}, fragments: ['{"x":', '1}'] },
      { id: 'call-2', name: 'second', fragments: ['{}'] },
    ]),
    events('interaction-2', [], 'Use a steady progression.'),
  ]);
  const emitted: unknown[] = [];
  const result = await runAgentLoop({
    input: 'Help', context: {} as ToolContext, registry, transport,
    emit: (event) => { emitted.push(event); },
  });

  assertEquals(result.interactionId, 'interaction-2');
  assertEquals(result.text, 'Use a steady progression.');
  assertEquals(maxActive, 2);
  assertEquals(transport.requests[0].generation_config.tool_choice, 'validated');
  assertEquals(transport.requests[1].previous_interaction_id, 'interaction-1');
  assertEquals((transport.requests[1].input as unknown[]).length, 2);
  assertEquals(emitted.some((event) => typeof event === 'object' && event !== null &&
    'type' in event && event.type === 'function_call' && 'name' in event && event.name === 'first'), true);
});

Deno.test('agent loop replaces post-proposal narration with a short in-chat acknowledgement', async () => {
  const proposal = {
    kind: 'workout_log' as const,
    title: 'Lower body workout',
    logged_on: '2026-07-22',
    exercises: [{ name: 'RDL', kind: 'strength' as const, sets: [{ reps: 8, weight_kg: 20 }] }],
  };
  const registry: ToolRegistry = {
    propose_workout_log: {
      type: 'function', name: 'propose_workout_log', description: 'proposal', parameters: { type: 'object', properties: {} },
      kind: 'proposal', args: z.object({}).passthrough(), limits: { maxRows: 200, maxRangeDays: 365 }, run: async () => proposal,
    },
  };
  const transport = new FakeTransport([
    events('proposal-call', [{ id: 'call-proposal', name: 'propose_workout_log', startArguments: {}, fragments: [] }]),
    events('proposal-done', [], 'You will find the complete proposal in your app, ready for review and approval.'),
  ]);
  const emitted: unknown[] = [];
  const result = await runAgentLoop({
    input: 'Log this workout', context: {} as ToolContext, registry, transport,
    persistProposal: async () => ({ insight_id: '00000000-0000-4000-8000-000000000010', proposal_kind: 'workout_log', proposal }),
    emit: (event) => { emitted.push(event); },
  });

  assertEquals(result.text, 'I’ve put the workout together below.');
  assertEquals(emitted.some((event) => typeof event === 'object' && event !== null && 'type' in event && event.type === 'proposal'), true);
  assertEquals(emitted.some((event) => typeof event === 'object' && event !== null && 'delta' in event && String(event.delta).includes('in your app')), false);
});

Deno.test('agent loop returns invalid tool arguments to the model for an automatic corrected retry', async () => {
  const proposal = {
    kind: 'workout_log' as const, title: 'Seated Rows workout', logged_on: '2026-07-22',
    exercises: [{ name: 'Seated Rows', kind: 'strength' as const, sets: [{ reps: 12, weight_kg: 80 }] }],
  };
  const registry: ToolRegistry = {
    propose_workout_log: {
      type: 'function', name: 'propose_workout_log', description: 'proposal', parameters: { type: 'object', properties: {} },
      kind: 'proposal', args: z.object({ reps: z.number().int() }), limits: { maxRows: 200, maxRangeDays: 365 }, run: async () => proposal,
    },
  };
  const transport = new FakeTransport([
    events('invalid-call', [{ id: 'bad', name: 'propose_workout_log', startArguments: {}, fragments: [] }]),
    events('corrected-call', [{ id: 'good', name: 'propose_workout_log', startArguments: { reps: 12 }, fragments: [] }]),
    events('corrected-done', [], 'The proposal is in your app for review and approval.'),
  ]);
  const result = await runAgentLoop({
    input: 'Add seated rows', context: {} as ToolContext, registry, transport, emit: () => {},
    persistProposal: async () => ({ insight_id: '00000000-0000-4000-8000-000000000010', proposal_kind: 'workout_log', proposal }),
  });

  assertEquals(transport.requests.length, 3);
  assertEquals(result.trace.map((item) => item.ok), [false, true]);
  assertEquals(result.text, 'I’ve put the workout together below.');
  const repairInput = transport.requests[1]?.input as Array<{ result?: { content?: Array<{ text?: string }> } }>;
  assertEquals(repairInput[0]?.result?.content?.[0]?.text?.includes('invalid_arguments'), true);
});

Deno.test('agent loop enforces the configured step cap', async () => {
  const registry: ReadToolRegistry = {
    again: {
      type: 'function', name: 'again', description: 'again', parameters: { type: 'object', properties: {} },
      kind: 'read', args: z.object({}).passthrough(), limits: { maxRows: 200, maxRangeDays: 365 }, run: async () => ({}),
    },
  };
  const transport = new FakeTransport([
    events('one', [{ id: 'a', name: 'again', fragments: ['{}'] }]),
    events('two', [{ id: 'b', name: 'again', fragments: ['{}'] }]),
  ]);
  await assertRejects(
    () => runAgentLoop({ input: 'loop', context: {} as ToolContext, registry, transport, emit: () => {}, stepCap: 1 }),
    Error,
    'step limit',
  );
});

Deno.test('agent loop reports a response-body abort as an upstream timeout', async () => {
  const transport: InteractionTransport = {
    async *create(_request, signal) {
      yield { event_type: 'interaction.created', interaction: { id: 'slow-interaction', status: 'in_progress' } };
      await new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    },
  };
  await assertRejects(
    () => runAgentLoop({
      input: 'slow', context: {} as ToolContext, registry: {}, transport, emit: () => {}, budgetMs: 1,
    }),
    Error,
    'took too long',
  );
});
