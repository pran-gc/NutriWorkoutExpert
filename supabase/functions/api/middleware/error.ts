// Error-envelope middleware + the HttpError routes throw. Every failure leaves
// the API as `{ error: { code, message, details? } }` with the mapped status
// (docs/api.md §3). Raw DB/upstream errors never leak — they become INTERNAL.
import type { Context, ErrorHandler } from 'hono';

import { type ErrorCode, fail, statusForCode } from '../../_shared/index.ts';

/** Throwable typed error. Routes/services throw this; onError renders it. */
export class HttpError extends Error {
  code: ErrorCode;
  details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** Hono error handler: every thrown error becomes an enveloped response. */
export const onError: ErrorHandler = (err, c) => renderError(c, err);

export function renderError(c: Context, err: unknown): Response {
  if (err instanceof HttpError) {
    return c.json(fail(err.code, err.message, err.details), statusForCode(err.code) as never);
  }
  // Never leak internals.
  console.error('Unhandled API error:', err);
  return c.json(fail('INTERNAL', 'Something went wrong.'), 500);
}
