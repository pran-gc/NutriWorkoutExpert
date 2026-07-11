// Typed API client — the ONE way the app reads/writes data (docs/api.md §4).
// Wraps Hono RPC `hc<AppType>`, attaches the current session's JWT, and unwraps
// the `{ data } / { error }` envelope into a typed result or a thrown ApiError.
//
// `AppType` is imported type-only from the Deno edge function. That folder is
// excluded from the app's own compilation, but TS still resolves the type across
// the boundary — a contract change on either side fails `tsc`. (NWE-113 AC#3.)
import { hc } from 'hono/client';

import { type ApiError, isErrorEnvelope } from '@shared';

import { supabase } from '@/lib/supabase';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import type { AppType } from '../supabase/functions/api/index.ts';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

// Supabase serves the function at /functions/v1/api; the Hono app's basePath is '/api'.
const API_BASE = `${SUPABASE_URL}/functions/v1`;

/** Error thrown by the client when the API returns a failure envelope. */
export class ApiClientError extends Error {
  code: ApiError['code'];
  details?: unknown;
  constructor(err: ApiError) {
    super(err.message);
    this.name = 'ApiClientError';
    this.code = err.code;
    this.details = err.details;
  }
}

// The RPC client. `fetch` is wrapped to attach the current access token.
// `AppType` gives full path + response inference; we call it through the small
// typed `api` facade below (input types come from @shared contracts, the single
// source of truth — sidestepping Hono-RPC's cross-runtime input-inference quirks).
export const rpc = hc<AppType>(API_BASE, {
  async fetch(input: RequestInfo | URL, init?: RequestInit) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers = new Headers(init?.headers);
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }
    return fetch(input, { ...init, headers });
  },
});

/** Minimal shape we need from a fetch/Hono-RPC response. */
type RpcResponse = {
  json: () => Promise<unknown>;
  status?: number;
  ok?: boolean;
};
type AwaitableResponse = Promise<RpcResponse> | RpcResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Unwrap a Hono RPC response into typed data or throw a typed ApiClientError.
 * Accepts the client's response promise directly. Every screen hook funnels
 * through this so error handling is uniform (NWE-105).
 */
export async function unwrap<T>(res: AwaitableResponse): Promise<T> {
  const resolved = await res;
  let body: unknown;
  try {
    body = await resolved.json();
  } catch {
    throw new ApiClientError({ code: 'INTERNAL', message: 'Malformed response from server.' });
  }
  if (isRecord(body) && isErrorEnvelope(body as never)) {
    throw new ApiClientError((body as { error: ApiError }).error);
  }
  if (isRecord(body) && 'data' in body && body.data !== undefined) {
    return body.data as T;
  }
  throw new ApiClientError({
    code: 'INTERNAL',
    message: 'Unexpected response from server.',
    details: { status: resolved.status, ok: resolved.ok },
  });
}
