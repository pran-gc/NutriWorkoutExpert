import { render } from '@testing-library/react-native';

import TabLayout from './_layout';

jest.mock('expo-router/unstable-native-tabs', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  const Trigger = ({ children, name, unstable_nativeProps }: { children: React.ReactNode; name: string; unstable_nativeProps: { tabBarItemAccessibilityLabel: string } }) =>
    React.createElement(View, { testID: `tab-${name}`, accessibilityLabel: unstable_nativeProps.tabBarItemAccessibilityLabel }, children);
  Trigger.Icon = () => null;
  Trigger.Label = ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children);
  const NativeTabs = ({ children }: { children: React.ReactNode }) => React.createElement(View, { testID: 'native-tabs' }, children);
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});

jest.mock('@/components/assistant/AssistantFab', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    AssistantFab: () => React.createElement(View, { testID: 'assistant-fab' }, React.createElement(Text, null, 'Assistant')),
  };
});

test('native tabs preserve all labels and accessibility names', async () => {
  const screen = await render(<TabLayout />);
  expect(screen.getByTestId('native-tabs')).toBeTruthy();
  for (const label of ['Today', 'Food', 'Workouts', 'Insights', 'Profile']) {
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByLabelText(`${label} tab`)).toBeTruthy();
  }
  expect(screen.getByTestId('assistant-fab')).toBeTruthy();
});
