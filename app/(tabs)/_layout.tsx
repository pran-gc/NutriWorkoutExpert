import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { AssistantFab } from '@/components/assistant/AssistantFab';
import { Brand } from '@/constants/Colors';

const tabs = [
  { name: 'index', label: 'Today', accessibilityLabel: 'Today tab', sf: { default: 'chart.bar', selected: 'chart.bar.fill' }, md: { default: 'monitoring', selected: 'monitoring' } },
  { name: 'food', label: 'Food', accessibilityLabel: 'Food tab', sf: { default: 'fork.knife', selected: 'fork.knife' }, md: { default: 'restaurant', selected: 'restaurant' } },
  { name: 'workouts', label: 'Workouts', accessibilityLabel: 'Workouts tab', sf: { default: 'figure.strengthtraining.traditional', selected: 'figure.strengthtraining.traditional' }, md: { default: 'fitness_center', selected: 'fitness_center' } },
  { name: 'insights', label: 'Insights', accessibilityLabel: 'Insights tab', sf: { default: 'sparkles', selected: 'sparkles' }, md: { default: 'auto_awesome', selected: 'auto_awesome' } },
  { name: 'profile', label: 'Profile', accessibilityLabel: 'Profile tab', sf: { default: 'person', selected: 'person.fill' }, md: { default: 'person', selected: 'person' } },
] as const;

export default function TabLayout() {
  return (
    <>
      <NativeTabs
        tintColor={Brand.accent}
        backBehavior="history"
        labelVisibilityMode="labeled"
        tabBarRespectsIMEInsets
        disableTransparentOnScrollEdge>
        {tabs.map((tab) => (
          <NativeTabs.Trigger
            key={tab.name}
            name={tab.name}
            unstable_nativeProps={{ tabBarItemAccessibilityLabel: tab.accessibilityLabel }}>
            <NativeTabs.Trigger.Icon sf={{ ...tab.sf }} md={{ ...tab.md }} />
            <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
      <AssistantFab />
    </>
  );
}
