import { describe, expect, it } from 'vitest';

import {
  COACH_MEMORY_MAX_CHARS,
  coachMemorySchema,
  coachingProfileSchema,
  refineProgramResponseSchema,
} from './contracts.ts';

describe('coachingProfileSchema (NWE-118)', () => {
  it('accepts a full profile', () => {
    const parsed = coachingProfileSchema.parse({
      motivation: 'feel confident hiking with friends',
      target_event: { name: 'wedding', date: '2026-09-12' },
      preferences: ['short sessions', 'mornings'],
      dislikes: ['running'],
      injuries: ['left knee — avoid deep lunges'],
      coach_tone: 'direct',
    });
    expect(parsed.dislikes).toEqual(['running']);
    expect(parsed.target_event?.name).toBe('wedding');
  });

  it('accepts an empty object (everything optional)', () => {
    expect(coachingProfileSchema.parse({})).toEqual({});
  });

  it('rejects an unbounded motivation and unknown tone', () => {
    expect(coachingProfileSchema.safeParse({ motivation: 'x'.repeat(300) }).success).toBe(false);
    expect(coachingProfileSchema.safeParse({ coach_tone: 'shouty' }).success).toBe(false);
  });

  it('caps list lengths', () => {
    expect(coachingProfileSchema.safeParse({ dislikes: Array(11).fill('x') }).success).toBe(false);
  });
});

describe('coachMemorySchema (NWE-119)', () => {
  it('defaults to empty text', () => {
    expect(coachMemorySchema.parse({}).text).toBe('');
  });
  it('enforces the hard cap', () => {
    expect(coachMemorySchema.safeParse({ text: 'x'.repeat(COACH_MEMORY_MAX_CHARS + 1) }).success).toBe(false);
    expect(coachMemorySchema.safeParse({ text: 'x'.repeat(COACH_MEMORY_MAX_CHARS) }).success).toBe(true);
  });
});

describe('refineProgramResponseSchema (NWE-120 two-channel output)', () => {
  const program = {
    title: 'P',
    days: [{ name: 'Day 1', exercises: [{ name: 'Squat', sets: 3, reps: '8-12' }] }],
  };

  it('accepts a reply-only turn (question answered, no change)', () => {
    const parsed = refineProgramResponseSchema.parse({ reply: 'Lat pulldowns balance pressing.' });
    expect(parsed.updated_program ?? null).toBeNull();
  });

  it('accepts a reply with a revised program', () => {
    const parsed = refineProgramResponseSchema.parse({ reply: 'Swapped it.', updated_program: program });
    expect(parsed.updated_program?.days).toHaveLength(1);
  });

  it('rejects a turn without a reply (prose channel is mandatory)', () => {
    expect(refineProgramResponseSchema.safeParse({ updated_program: program }).success).toBe(false);
  });
});
