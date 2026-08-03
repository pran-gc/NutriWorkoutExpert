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

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const RN = require('react-native');
  return {
    __esModule: true,
    default: {
      View: RN.View,
      Text: RN.Text,
      createAnimatedComponent: (Component) => React.forwardRef((props, ref) => React.createElement(Component, { ...props, ref })),
    },
    useSharedValue: (value) => ({ value }),
    useAnimatedStyle: (factory) => factory(),
    withTiming: (value) => value,
    withSpring: (value) => value,
    withSequence: (...values) => values[values.length - 1],
    createAnimatedComponent: (Component) => React.forwardRef((props, ref) => React.createElement(Component, { ...props, ref })),
  };
});

const mockAsyncStorage = {
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
  clear: jest.fn(async () => undefined),
};

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

jest.mock('@gorhom/bottom-sheet', () => ({
  __esModule: true,
  ...require('@gorhom/bottom-sheet/mock'),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children }) => React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
  };
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
