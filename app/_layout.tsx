import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import 'react-native-reanimated';

import { ErrorBanner } from '@/components/ErrorBanner';
import { SessionProvider, useSession } from '@/components/SessionProvider';
import { View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { initAuthDeepLinks } from '@/lib/authDeepLink';
import { queryClient } from '@/lib/queryClient';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RootLayoutNav />
      </SessionProvider>
    </QueryClientProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, profile, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  // True while handling a password-recovery deep link — the user has a (recovery)
  // session but must set a new password before entering the app.
  const [recovering, setRecovering] = useState(false);

  // A profile is "incomplete" until the core body stats exist (NWE-104).
  const profileIncomplete =
    !!profile && (!profile.sex || !profile.birth_year || !profile.height_cm);

  // Catch Supabase auth deep links (email confirmation, password reset) — on
  // native, supabase-js can't auto-detect them, so we establish the session here.
  useEffect(() => {
    return initAuthDeepLinks(() => {
      setRecovering(true);
      router.replace('/(auth)/reset-password');
    });
  }, [router]);

  useEffect(() => {
    if (loading || recovering) return; // don't fight the recovery redirect
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    } else if (session && profileIncomplete && !inOnboarding) {
      // Signed in but never set up → the wizard (skippable from within).
      router.replace('/(onboarding)');
    }
  }, [session, loading, segments, profileIncomplete, recovering]);

  // Hold on a neutral splash until the session resolves, so no tab flashes its
  // empty/wrong state before the auth redirect runs (NWE-101 AC#3).
  if (loading) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
        <Stack.Screen name="food-analytics" options={{ title: 'Food analytics' }} />
        <Stack.Screen name="gym-analytics" options={{ title: 'Gym analytics' }} />
        <Stack.Screen name="goal-analytics" options={{ title: 'Goal progress' }} />
        <Stack.Screen name="progress-photos" options={{ title: 'Progress photos' }} />
        <Stack.Screen name="exercise-detail" options={{ title: 'Exercise progress' }} />
        <Stack.Screen name="recipe-editor" options={{ presentation: 'modal', title: 'Recipe' }} />
        <Stack.Screen name="photo-viewer" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      <ErrorBanner />
    </ThemeProvider>
  );
}
