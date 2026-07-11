import { Stack } from 'expo-router';

// Onboarding is a full-screen flow with no header (its own progress dots + Skip).
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
