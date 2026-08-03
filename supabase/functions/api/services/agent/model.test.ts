import { assertEquals } from 'jsr:@std/assert@1';

import { interactionModel } from './model.ts';

Deno.test('assistant model resolution uses supported fallback and respects configured models', () => {
  assertEquals(interactionModel(() => undefined), 'gemini-3.5-flash');
  assertEquals(interactionModel((name) => name === 'GEMINI_MODEL' ? 'gemini-2.5-flash' : undefined), 'gemini-2.5-flash');
  assertEquals(interactionModel((name) => name === 'GEMINI_INTERACTIONS_MODEL' ? 'gemini-3.5-flash' : 'gemini-2.5-flash'), 'gemini-3.5-flash');
});
