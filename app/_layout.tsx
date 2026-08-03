import { QueryClientProvider } from '@tanstack/react-query';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AppScreen } from '@/components/AppScreen';
import { ErrorBanner } from '@/components/ErrorBanner';
import { SessionProvider, useSession } from '@/components/SessionProvider';
import { View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { initAuthDeepLinks } from '@/lib/authDeepLink';
import { hasOnboardingCompletedLocally } from '@/lib/onboardingState';
import { queryClient } from '@/lib/queryClient';
import { GlassProvider } from '@/lib/glass';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// The outer native Stack only applies this boundary to routes that render
// custom chrome. Nested navigators and native headers already own their insets.
const HEADERLESS_SAFE_AREA_ROUTES = new Set([
  '(auth)/sign-in',
  '(auth)/reset-password',
  '(onboarding)',
  'assistant',
  'photo-viewer',
]);
const FULL_SCREEN_MODAL_ROUTES = new Set(['assistant', 'photo-viewer']);

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <GlassProvider>
            <BottomSheetModalProvider>
              <SessionProvider>
                <RootLayoutNav />
              </SessionProvider>
            </BottomSheetModalProvider>
          </GlassProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
  const [checkingLocalOnboarding, setCheckingLocalOnboarding] = useState(true);
  const [localOnboardingCompleted, setLocalOnboardingCompleted] = useState(false);

  // The onboarding wizard shows exactly once: until the user finishes or skips it
  // (server stamps onboarding_completed_at then, and also once core stats exist).
  // Falls back to the body-stats check for rows predating the flag (0006 backfills
  // those, but a stale in-memory profile might not carry it yet).
  const profileIncomplete =
    !!profile &&
    !profile.onboarding_completed_at &&
    !localOnboardingCompleted &&
    (!profile.sex || !profile.birth_year || !profile.height_cm);

  // Catch Supabase auth deep links (email confirmation, password reset) — on
  // native, supabase-js can't auto-detect them, so we establish the session here.
  useEffect(() => {
    return initAuthDeepLinks(() => {
      setRecovering(true);
      router.replace('/(auth)/reset-password');
    });
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const userId = session?.user.id;
    if (!userId) {
      setLocalOnboardingCompleted(false);
      setCheckingLocalOnboarding(false);
      return;
    }
    setCheckingLocalOnboarding(true);
    hasOnboardingCompletedLocally(userId)
      .then((completed) => {
        if (!cancelled) setLocalOnboardingCompleted(completed);
      })
      .finally(() => {
        if (!cancelled) setCheckingLocalOnboarding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (loading || recovering || checkingLocalOnboarding) return; // don't fight the recovery redirect
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)' as Href);
    } else if (session && !profileIncomplete && inOnboarding) {
      router.replace('/(tabs)' as Href);
    } else if (session && profileIncomplete && !inOnboarding) {
      // Signed in but never set up → the wizard (skippable from within).
      router.replace('/(onboarding)');
    }
  }, [session, loading, segments, profileIncomplete, recovering, checkingLocalOnboarding]);

  // Hold on a neutral splash until the session resolves, so no tab flashes its
  // empty/wrong state before the auth redirect runs (NWE-101 AC#3).
  if (loading || checkingLocalOnboarding) {
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
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenLayout={({ children, route }) => {
          // Tab form screens already manage keyboard resizing inside their nested
          // navigator. Every root route gets one keyboard boundary here.
          if (route.name === '(tabs)') return children;
          return (
            <AppScreen
              modal={FULL_SCREEN_MODAL_ROUTES.has(route.name)}
              safeArea={HEADERLESS_SAFE_AREA_ROUTES.has(route.name)}>
              {children}
            </AppScreen>
          );
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
        <Stack.Screen name="food-analytics" options={{ title: 'Food analytics' }} />
        <Stack.Screen name="gym-analytics" options={{ title: 'Gym analytics' }} />
        <Stack.Screen name="goal-analytics" options={{ title: 'Goal progress' }} />
        <Stack.Screen name="progress-photos" options={{ title: 'Progress photos' }} />
        <Stack.Screen name="assistant" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="exercise-detail" options={{ title: 'Exercise progress' }} />
        <Stack.Screen name="recipe-editor" options={{ presentation: 'modal', title: 'Recipe' }} />
        <Stack.Screen name="photo-viewer" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      <ErrorBanner />
    </ThemeProvider>
  );
}
