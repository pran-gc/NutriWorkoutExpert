import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { createProposalToolRegistry, createReadToolRegistry, createToolRegistry, dispatchReadTool, dispatchTool, interactionToolDeclarations } from './registry.ts';

Deno.test('read registry is MCP-shaped, capped, and has no proposal or mutation dispatcher', () => {
  const registry = createReadToolRegistry();
  assertEquals(Object.keys(registry).length, 13);
  for (const [name, tool] of Object.entries(registry)) {
    assertEquals(tool.name, name);
    assertEquals(tool.type, 'function');
    assertEquals(tool.kind, 'read');
    assertEquals(tool.limits.maxRows <= 200, true);
    assertEquals(tool.limits.maxRangeDays <= 365, true);
    assertEquals(typeof tool.parameters, 'object');
  }
  assertEquals('dispatchProposalTool' in ({ dispatchReadTool }), false);
});

Deno.test('proposal registry validates artifacts and performs zero database writes', async () => {
  let writes = 0;
  const db = new Proxy({}, { get: () => () => { writes++; throw new Error('proposal dispatcher touched db'); } });
  const registry = createProposalToolRegistry();
  assertEquals(Object.keys(registry).length, 6);
  for (const [name, tool] of Object.entries(registry)) {
    assertEquals(tool.name, name);
    assertEquals(tool.kind, 'proposal');
  }
  const result = await dispatchTool(registry, 'propose_target_change', { db: db as never, userId: crypto.randomUUID() }, {
    title: 'Adjust targets', current: { calorie_target: 2100 }, changes: { calorie_target: 2200 }, rationale: 'Current goal',
  });
  assertEquals(result.kind, 'proposal');
  assertEquals(writes, 0);
});

Deno.test('rich proposal registry exposes recipe reads and workout/recipe proposals without writes', async () => {
  let writes = 0;
  const rows = [{ id: crypto.randomUUID(), name: 'Curry', servings: 4, recipe_items: [] }];
  const chain = new Proxy({}, { get: (_target, key) => {
    if (['insert', 'update', 'delete', 'upsert'].includes(String(key))) return () => { writes++; throw new Error('write attempted'); };
    if (key === 'then') return (resolve: (value: unknown) => void) => resolve({ data: rows, error: null });
    return () => chain;
  } });
  const db = { from: () => chain };
  const registry = createToolRegistry();
  for (const name of ['get_recipes', 'get_recipe']) assertEquals(registry[name]?.kind, 'read');
  for (const name of ['propose_workout_log', 'propose_recipe']) assertEquals(registry[name]?.kind, 'proposal');
  await dispatchTool(registry, 'get_recipes', { db: db as never, userId: crypto.randomUUID() }, {});
  await dispatchTool(registry, 'propose_workout_log', { db: db as never, userId: crypto.randomUUID() }, {
    title: 'Push day', logged_on: '2026-07-22', exercises: [{ name: 'Bench', kind: 'strength', sets: [{ count: 1, reps: 8, weight_kg: 80 }] }],
  });
  assertEquals(writes, 0);
  assertEquals(Object.keys(registry).length, 19);
  const declarationBytes = new TextEncoder().encode(JSON.stringify(interactionToolDeclarations(registry))).byteLength;
  assertEquals(declarationBytes < 30_000, true);
});

Deno.test('workout proposal tool requires exact model arguments and only expands explicit set counts', async () => {
  const registry = createProposalToolRegistry();
  await assertRejects(
    () => dispatchTool(registry, 'propose_workout_log', { db: {} as never, userId: crypto.randomUUID() }, {
      exercises: [{ name: 'Seated Rows', sets: [{ count: 3, reps: 12, weight_kg: 80 }] }],
    }),
    Error,
    'Invalid arguments',
  );
  const dispatched = await dispatchTool(registry, 'propose_workout_log', { db: {} as never, userId: crypto.randomUUID() }, {
    title: 'Seated Rows workout', logged_on: '2026-07-22',
    exercises: [{ name: 'Seated Rows', kind: 'strength', sets: [{ count: 3, reps: 12, weight_kg: 80 }] }],
  });
  const proposal = dispatched.result as {
    kind: string; title: string; logged_on: string;
    exercises: Array<{ kind: string; sets: Array<{ reps: number; weight_kg: number }> }>;
  };
  assertEquals(proposal.kind, 'workout_log');
  assertEquals(proposal.title, 'Seated Rows workout');
  assertEquals(proposal.logged_on, '2026-07-22');
  assertEquals(proposal.exercises[0]?.kind, 'strength');
  assertEquals(proposal.exercises[0]?.sets, [
    { reps: 12, weight_kg: 80 }, { reps: 12, weight_kg: 80 }, { reps: 12, weight_kg: 80 },
  ]);
});

Deno.test('every model-facing declaration fully describes nested objects and closes declared properties', () => {
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const schema = value as Record<string, unknown>;
    if (schema.type === 'object' && schema.properties) {
      assertEquals(schema.additionalProperties, false, `${path} must reject undeclared properties`);
    }
    if (schema.type === 'array') assertEquals(typeof schema.items, 'object', `${path} must declare array items`);
    for (const [key, child] of Object.entries(schema)) {
      if (key === 'properties') {
        for (const [name, property] of Object.entries(child as Record<string, unknown>)) visit(property, `${path}.${name}`);
      } else if (key === 'items') visit(child, `${path}[]`);
      else if (key === 'oneOf' && Array.isArray(child)) child.forEach((option, index) => visit(option, `${path}.oneOf[${index}]`));
    }
  };
  for (const declaration of interactionToolDeclarations(createToolRegistry())) {
    const tool = declaration as { name: string; parameters: unknown };
    visit(tool.parameters, tool.name);
  }
});

Deno.test('all proposal tools accept their exact public contract and reject undeclared fields', async () => {
  const ingredient = {
    name: 'Rice', quantity_g: 100, calories_per_100g: 130, protein_per_100g: 2.7,
    carbs_per_100g: 28, fat_per_100g: 0.3, source: 'usda',
  };
  const samples: Record<string, Record<string, unknown>> = {
    propose_program_revision: {
      title: 'Updated plan', routine_id: crypto.randomUUID(),
      days: [{ name: 'Pull', exercises: [{ name: 'Seated row', sets: 3, reps: '8-12', rest_seconds: 90 }] }],
    },
    propose_meal_plan: {
      title: 'Tomorrow meals', date: '2026-07-23', meals: [{
        name: 'Oats', meal_type: 'breakfast', macros: { calories: 400, protein_g: 25, carbs_g: 55, fat_g: 10 },
        recipe: { ingredients: ['80 g oats', '250 ml milk'], steps: ['Combine and cook.'] },
      }],
    },
    propose_food_logs: {
      title: 'Log lunch', entries: [{
        food_name: 'Rice', meal_type: 'lunch', quantity_g: 100, calories: 130,
        protein_g: 2.7, carbs_g: 28, fat_g: 0.3, logged_on: '2026-07-22', ingredients: [ingredient],
      }],
    },
    propose_target_change: {
      title: 'Adjust targets', current: { calorie_target: 2100 }, changes: { calorie_target: 2200 }, rationale: 'Match the current goal.',
    },
    propose_workout_log: {
      title: 'Pull workout', logged_on: '2026-07-22',
      exercises: [{ name: 'Seated row', kind: 'strength', sets: [{ count: 3, reps: 12, weight_kg: 80 }] }],
    },
    propose_recipe: { title: 'Save rice', name: 'Rice', servings: 1, ingredients: [ingredient] },
  };
  const registry = createProposalToolRegistry();
  for (const [name, args] of Object.entries(samples)) {
    const valid = await dispatchTool(registry, name, { db: {} as never, userId: crypto.randomUUID() }, args);
    assertEquals(valid.kind, 'proposal');
    await assertRejects(
      () => dispatchTool(registry, name, { db: {} as never, userId: crypto.randomUUID() }, { ...args, undeclared: true }),
      Error,
      'Invalid arguments',
    );
  }
  await assertRejects(
    () => dispatchTool(registry, 'propose_food_logs', { db: {} as never, userId: crypto.randomUUID() }, {
      ...samples.propose_food_logs,
      entries: [{ ...(samples.propose_food_logs.entries as Record<string, unknown>[])[0], ingredients: [{ ...ingredient, undeclared: true }] }],
    }),
    Error,
    'Invalid arguments',
  );
});

Deno.test('all read tools reject undeclared arguments before executing', async () => {
  const samples: Record<string, Record<string, unknown>> = {
    get_profile_and_targets: {}, get_workout_trends: { days: 30 },
    get_workouts: { from: '2026-07-01', to: '2026-07-22', limit: 20 },
    get_exercise_history: { exercise_id: crypto.randomUUID() }, get_routines: {},
    get_food_logs: { date: '2026-07-22' }, get_nutrition_trends: { days: 30 },
    get_weight_trend: { days: 30 }, get_coach_memory: {}, get_recipes: {},
    get_recipe: { id: crypto.randomUUID() }, search_foods: { q: 'rice' },
    resolve_macros: { items: [{ name: 'rice', quantity_g: 100 }] },
  };
  const registry = createReadToolRegistry();
  for (const [name, args] of Object.entries(samples)) {
    await assertRejects(
      () => dispatchReadTool(registry, name, { db: {} as never, userId: crypto.randomUUID() }, { ...args, undeclared: true }),
      Error,
      'Invalid arguments',
    );
  }
  await assertRejects(
    () => dispatchReadTool(registry, 'resolve_macros', { db: {} as never, userId: crypto.randomUUID() }, {
      items: [{ name: 'rice', quantity_g: 100, undeclared: true }],
    }),
    Error,
    'Invalid arguments',
  );
});
