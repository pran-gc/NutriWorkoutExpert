// Auth middleware: verify the caller's Supabase JWT, inject `user` + a
// user-scoped Supabase client (`db`) whose every query runs under the caller's
// RLS. Missing/invalid token → 401 UNAUTHENTICATED. (docs/api.md §1.)
import { createClient } from '@supabase/supabase-js';
import type { MiddlewareHandler } from 'hono';

import type { Env } from '../types.ts';
import { HttpError } from './error.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

export const authMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    throw new HttpError('UNAUTHENTICATED', 'Missing bearer token.');
  }

  // A client bound to the caller's JWT: RLS is enforced on every query it makes.
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError('UNAUTHENTICATED', 'Invalid or expired token.');
  }

  c.set('user', { id: data.user.id, email: data.user.email ?? null });
  c.set('db', db);
  await next();
};
