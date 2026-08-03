// Slide-down error banner (NWE-105): appears under the header on network/server
// failures, dismisses on tap or when a retry succeeds. Amber background, white
// text, retry button. Driven by a lightweight global store the query cache feeds.
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { subscribeBanner, type BannerState } from '@/lib/errorBanner';

export function ErrorBanner() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<BannerState | null>(null);
  const translateY = useRef(new Animated.Value(-80)).current;

  useEffect(() => subscribeBanner(setState), []);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: state ? 0 : -80,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [state, translateY]);

  if (!state) return null;

  return (
    <Animated.View
      style={[styles.banner, { paddingTop: insets.top + 10, transform: [{ translateY }] }]}
      accessibilityLiveRegion="polite">
      {/* Dismiss and Retry are sibling press targets — not nested — so tapping
          Retry never bubbles up to the dismiss handler (RN press events bubble). */}
      <View style={styles.content}>
        <Pressable style={styles.messageTarget} onPress={state.dismiss} accessibilityRole="button">
          <Text style={styles.text}>{state.message}</Text>
        </Pressable>
        {state.retry && (
          <Pressable onPress={state.retry} hitSlop={8} accessibilityRole="button">
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#d97706', // amber-600
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 1000,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  messageTarget: {
    flex: 1,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  retry: {
    color: '#fff',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
