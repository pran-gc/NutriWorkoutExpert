// Integration-test helpers: spin up real users against the local Supabase stack
// and drive the API with their JWTs. Requires `supabase start` to be running.
//
//   deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/api/*.integration.test.ts
//
// Env (from `supabase status -o env`):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';

import { app } from './index.ts';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

let counter = 0;

/** Create a confirmed test user and return an access token for API calls. */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${Date.now()}-${counter++}@example.com`;
  const password = 'password123!';
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created.user) throw new Error(`createUser failed: ${error?.message}`);

  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr || !signIn.session) throw new Error(`sign-in failed: ${signErr?.message}`);

  return { id: created.user.id, email, token: signIn.session.access_token };
}

export async function deleteTestUser(id: string): Promise<void> {
  await admin.auth.admin.deleteUser(id);
}

/** Call the API as a given user; returns the parsed JSON body + status. */
export async function apiAs(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(`http://localhost/api${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}
