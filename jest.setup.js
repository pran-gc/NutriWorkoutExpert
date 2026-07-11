// Jest setup for app component tests (jest-expo + React Native Testing Library).
/* eslint-disable no-undef */

// RNTL 14 renders concurrently (React 19). Clean up after each test so `screen`
// starts fresh. NB: an async happy-path submit can wedge test-renderer@1.2.0 for
// later tests in the SAME file (RN 0.86/React 19 bug) — isolate such assertions
// in their own file (see app/(auth)/sign-in.submit.test.tsx).
const { cleanup } = require('@testing-library/react-native');
afterEach(async () => {
  await cleanup();
});

// Mock the Supabase client so components never hit the network in unit tests.
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signInWithPassword: jest.fn(async () => ({ error: null })),
      signUp: jest.fn(async () => ({ error: null })),
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signOut: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn(async () => ({ data: [] })),
      single: jest.fn(async () => ({ data: null })),
    })),
  },
}));
