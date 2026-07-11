import { describe, expect, it } from 'vitest';

import { fail, isErrorEnvelope, ok, statusForCode } from './envelope.ts';

describe('envelope', () => {
  it('ok() wraps data', () => {
    expect(ok({ x: 1 })).toEqual({ data: { x: 1 } });
    expect(isErrorEnvelope(ok(1))).toBe(false);
  });

  it('fail() wraps a typed error and omits details when absent', () => {
    expect(fail('NOT_FOUND', 'nope')).toEqual({ error: { code: 'NOT_FOUND', message: 'nope' } });
    expect(isErrorEnvelope(fail('INTERNAL', 'boom'))).toBe(true);
  });

  it('fail() includes details when provided', () => {
    expect(fail('VALIDATION_ERROR', 'bad', { field: 'email' })).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'bad', details: { field: 'email' } },
    });
  });

  it('maps each ErrorCode to its documented HTTP status', () => {
    expect(statusForCode('UNAUTHENTICATED')).toBe(401);
    expect(statusForCode('FORBIDDEN')).toBe(403);
    expect(statusForCode('NOT_FOUND')).toBe(404);
    expect(statusForCode('VALIDATION_ERROR')).toBe(400);
    expect(statusForCode('CONFLICT')).toBe(409);
    expect(statusForCode('UPSTREAM_ERROR')).toBe(502);
    expect(statusForCode('RATE_LIMITED')).toBe(429);
    expect(statusForCode('INTERNAL')).toBe(500);
  });
});
