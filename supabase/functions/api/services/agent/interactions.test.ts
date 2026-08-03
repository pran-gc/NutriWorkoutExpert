import { assertEquals } from 'jsr:@std/assert@1';

import type { InteractionRequest, InteractionTransport } from './loop.ts';
import { parseInteractionSseData, readGeminiError, structuredInteraction } from './interactions.ts';

class CaptureTransport implements InteractionTransport {
  requests: InteractionRequest[] = [];
  async *create(request: InteractionRequest): AsyncIterable<unknown> {
    this.requests.push(request);
    yield { event_type: 'interaction.created', interaction: { id: 'interaction-next' } };
    yield { event_type: 'step.delta', delta: { type: 'text', text: '{"reply":"done"}' } };
    yield { event_type: 'interaction.completed', interaction: { id: 'interaction-next', status: 'completed' } };
  }
}

Deno.test('structured Interactions requests preserve continuation and store policy', async () => {
  const refineTransport = new CaptureTransport();
  const refine = await structuredInteraction({
    input: 'refine', parse: (value) => value as { reply: string }, previousInteractionId: 'interaction-prev',
    store: true, transport: refineTransport,
  });
  assertEquals(refine?.interactionId, 'interaction-next');
  assertEquals(refineTransport.requests[0].previous_interaction_id, 'interaction-prev');
  assertEquals(refineTransport.requests[0].store, true);
  assertEquals(refineTransport.requests[0].response_format?.mime_type, 'application/json');

  const oneShotTransport = new CaptureTransport();
  await structuredInteraction({ input: 'one shot', parse: (value) => value, store: false, transport: oneShotTransport });
  assertEquals(oneShotTransport.requests[0].store, false);
  assertEquals(oneShotTransport.requests[0].previous_interaction_id, undefined);
});

Deno.test('Interactions SSE parser ignores the terminal DONE sentinel', () => {
  assertEquals(parseInteractionSseData('[DONE]'), null);
  assertEquals(parseInteractionSseData('{"event_type":"interaction.completed"}'), {
    event_type: 'interaction.completed',
  });
});

Deno.test('Gemini error reader supports streamed array error bodies', () => {
  assertEquals(readGeminiError([{ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid.' } }]), {
    code: 'INVALID_ARGUMENT',
    message: 'API key not valid.',
  });
});
