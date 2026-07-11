// API response envelope + ErrorCode union — the contract both the Hono API and
// the app's typed client (lib/api.ts) speak. Defined ONCE here (docs/api.md §3).
// (NWE-112 AC#3.)
import { z } from 'zod';

/** HTTP status ↔ ErrorCode mapping (docs/api.md). */
export const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  UPSTREAM_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export const errorCodeSchema = z.enum(
  Object.keys(ERROR_STATUS) as [keyof typeof ERROR_STATUS, ...(keyof typeof ERROR_STATUS)[]]
);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Failure envelope: `{ error: { code, message, details? } }`. */
export interface ErrorEnvelope {
  error: ApiError;
}

/** Success envelope: `{ data: T }`. */
export interface DataEnvelope<T> {
  data: T;
}

export type Envelope<T> = DataEnvelope<T> | ErrorEnvelope;

export function isErrorEnvelope<T>(env: Envelope<T>): env is ErrorEnvelope {
  return (env as ErrorEnvelope).error !== undefined;
}

/** Build a success envelope. */
export function ok<T>(data: T): DataEnvelope<T> {
  return { data };
}

/** Build a failure envelope. */
export function fail(code: ErrorCode, message: string, details?: unknown): ErrorEnvelope {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

export function statusForCode(code: ErrorCode): number {
  return ERROR_STATUS[code];
}
