// API integration tests — run the Hono app in-process via app.fetch(), no port.
//   deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/api/api.test.ts
//
// Covers NWE-113 AC#2: /health (public 200) and /me (401 without a token,
// enveloped). Endpoints that hit the DB get full integration coverage against
// the local stack in their own stories (NWE-114+); the auth-rejection path here
// proves the middleware + error envelope without needing a seeded user.
import { assertEquals } from 'jsr:@std/assert@1';

import { app } from './index.ts';

const BASE = 'http://localhost/api';

Deno.test('GET /health → 200 with version + uptime envelope', async () => {
  const res = await app.request(`${BASE}/health`);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(typeof body.data.version, 'string');
  assertEquals(typeof body.data.uptimeSeconds, 'number');
});

Deno.test('GET /me without a token → 401 UNAUTHENTICATED envelope', async () => {
  const res = await app.request(`${BASE}/me`);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error.code, 'UNAUTHENTICATED');
  assertEquals(typeof body.error.message, 'string');
});

Deno.test('GET /me with a bogus token → 401 (rejected by Supabase verify)', async () => {
  const res = await app.request(`${BASE}/me`, {
    headers: { Authorization: 'Bearer not-a-real-jwt' },
  });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error.code, 'UNAUTHENTICATED');
});

Deno.test('POST /assistant/chat without a token → 401 UNAUTHENTICATED envelope', async () => {
  const res = await app.request(`${BASE}/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello' }),
  });
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error.code, 'UNAUTHENTICATED');
});
