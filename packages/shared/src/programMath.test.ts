import { describe, expect, it } from 'vitest';

import { parseRepTarget, parseSetCount } from './programMath.ts';

describe('parseSetCount', () => {
  it('passes through positive integers and rounds floats', () => {
    expect(parseSetCount(3)).toBe(3);
    expect(parseSetCount(3.6)).toBe(4);
  });
  it('extracts the count from strings', () => {
    expect(parseSetCount('3')).toBe(3);
    expect(parseSetCount('3-4 sets')).toBe(3);
  });
  it('falls back to 3 and clamps to ≥1', () => {
    expect(parseSetCount(null)).toBe(3);
    expect(parseSetCount('warmup')).toBe(3);
    expect(parseSetCount(0)).toBe(1);
  });
});

describe('parseRepTarget', () => {
  it('takes the lower bound of a range ("8-12" → 8)', () => {
    expect(parseRepTarget('8-12')).toBe(8);
    expect(parseRepTarget('10-15 per leg')).toBe(10);
  });
  it('passes through plain numbers', () => {
    expect(parseRepTarget(8)).toBe(8);
    expect(parseRepTarget('12')).toBe(12);
  });
  it('returns null for AMRAP / timed / open-ended prescriptions', () => {
    expect(parseRepTarget('AMRAP')).toBeNull();
    expect(parseRepTarget('30-60 seconds hold')).toBeNull();
    expect(parseRepTarget('to max')).toBeNull();
    expect(parseRepTarget('1x20 minutes')).toBeNull();
    expect(parseRepTarget(null)).toBeNull();
    expect(parseRepTarget(0)).toBeNull();
  });
});
