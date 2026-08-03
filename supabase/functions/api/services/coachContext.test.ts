// Unit tests for the coach-awareness prompt rendering (NWE-118/119 AC).
//   deno test --config supabase/functions/deno.json --allow-env supabase/functions/api/services/coachContext.test.ts
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { coachContextLines } from './coachContext.ts';

Deno.test('coachContextLines renders profile, memory, and decisions into prompt lines', () => {
  const lines = coachContextLines({
    coachingProfile: {
      motivation: 'feel strong on hikes',
      target_event: { name: 'wedding', date: '2026-09-12' },
      dislikes: ['running'],
      injuries: ['left knee'],
      coach_tone: 'direct',
    },
    coachMemory: 'Prefers short sessions.',
    recentDecisions: ['DISMISSED plateau:Bench Press: Training adjustment'],
  }).join('\n');

  assertStringIncludes(lines, 'feel strong on hikes');
  assertStringIncludes(lines, 'wedding on 2026-09-12');
  assertStringIncludes(lines, 'do not program them): running');
  assertStringIncludes(lines, 'work around them): left knee');
  assertStringIncludes(lines, 'tone: direct');
  assertStringIncludes(lines, 'Prefers short sessions.');
  assertStringIncludes(lines, 'DISMISSED plateau:Bench Press');
});

Deno.test('coachContextLines is empty when the coach knows nothing (no prompt noise)', () => {
  assertEquals(coachContextLines({ coachingProfile: null, coachMemory: '', recentDecisions: [] }), []);
});
