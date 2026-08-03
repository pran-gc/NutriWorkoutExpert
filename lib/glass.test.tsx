import { act, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';

import { GlassProvider, Surface, glassAvailable } from './glass';

const mockLiquidAvailable = jest.fn(() => true);
const mockApiAvailable = jest.fn(() => true);

jest.mock('expo-glass-effect', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GlassView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, { ...props, testID: 'native-glass' }, children),
    isLiquidGlassAvailable: () => mockLiquidAvailable(),
    isGlassEffectAPIAvailable: () => mockApiAvailable(),
  };
});

beforeEach(() => {
  mockLiquidAvailable.mockReturnValue(true);
  mockApiAvailable.mockReturnValue(true);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
});

test('glassAvailable requires both Liquid Glass and its runtime API', () => {
  expect(glassAvailable()).toBe(true);
  mockApiAvailable.mockReturnValue(false);
  expect(glassAvailable()).toBe(false);
});

test('Surface renders native glass only after accessibility settings allow it', async () => {
  const rendered = await render(<GlassProvider><Surface><Text>Content</Text></Surface></GlassProvider>);
  await waitFor(() => expect(rendered.getByTestId('native-glass')).toBeTruthy());
});

test('Reduce Transparency forces the intentional opaque fallback', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
  const rendered = await render(<GlassProvider><Surface testID="fallback"><Text>Content</Text></Surface></GlassProvider>);
  await act(async () => { await Promise.resolve(); });
  expect(rendered.queryByTestId('native-glass')).toBeNull();
  expect(rendered.getByTestId('fallback')).toBeTruthy();
});
