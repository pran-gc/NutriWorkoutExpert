import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type ColorValue,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

type GlassAccessibility = {
  reduceMotion: boolean;
  reduceTransparency: boolean;
};

const inaccessibleByDefault: GlassAccessibility = {
  reduceMotion: true,
  reduceTransparency: true,
};

const GlassAccessibilityContext = createContext<GlassAccessibility>(inaccessibleByDefault);

/** The only runtime capability check used by application code. */
export function glassAvailable(): boolean {
  return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}

/**
 * Resolves OS accessibility settings once for every Surface in the application.
 * The conservative initial state prevents a transparency or motion flash while
 * React Native reads the user's settings.
 */
export function GlassProvider({ children }: { children: React.ReactNode }) {
  const [accessibility, setAccessibility] = useState(inaccessibleByDefault);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      AccessibilityInfo.isReduceMotionEnabled(),
      AccessibilityInfo.isReduceTransparencyEnabled(),
    ]).then(([reduceMotion, reduceTransparency]) => {
      if (mounted) setAccessibility({ reduceMotion, reduceTransparency });
    }).catch(() => {
      // Keep the accessible opaque/no-motion defaults if the native query fails.
    });

    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduceMotion) => {
      setAccessibility((current) => ({ ...current, reduceMotion }));
    });
    const transparencySubscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (reduceTransparency) => {
      setAccessibility((current) => ({ ...current, reduceTransparency }));
    });

    return () => {
      mounted = false;
      motionSubscription.remove();
      transparencySubscription.remove();
    };
  }, []);

  return (
    <GlassAccessibilityContext.Provider value={accessibility}>
      {children}
    </GlassAccessibilityContext.Provider>
  );
}

export type SurfaceProps = ViewProps & {
  fallbackColor?: ColorValue;
  glassEffectStyle?: 'clear' | 'regular';
  isInteractive?: boolean;
  tintColor?: string;
};

/**
 * Shared material surface. It uses native Liquid Glass only when the runtime
 * and accessibility settings allow it, and otherwise renders an opaque View.
 */
export function Surface({
  children,
  fallbackColor,
  glassEffectStyle = 'regular',
  isInteractive = false,
  style,
  tintColor,
  ...props
}: SurfaceProps) {
  const colorScheme = useColorScheme();
  const { reduceMotion, reduceTransparency } = useContext(GlassAccessibilityContext);
  const colors = Colors[colorScheme];
  const resolvedFallback = fallbackColor ?? colors.surface;
  const resolvedTint = tintColor ?? colors.glassTint;
  const effect = useMemo(() => ({
    style: glassEffectStyle,
    animate: !reduceMotion,
    animationDuration: reduceMotion ? 0 : 0.2,
  }) as const, [glassEffectStyle, reduceMotion]);

  if (!reduceTransparency && glassAvailable()) {
    return (
      <GlassView
        {...props}
        colorScheme={colorScheme}
        glassEffectStyle={effect}
        isInteractive={isInteractive && !reduceMotion}
        style={style as StyleProp<ViewStyle>}
        tintColor={resolvedTint}>
        {children}
      </GlassView>
    );
  }

  return (
    <View {...props} style={[{ backgroundColor: resolvedFallback }, style]}>
      {children}
    </View>
  );
}

export function GlassSheetBackground({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <Surface
      pointerEvents="none"
      style={[style, styles.sheet]}
      glassEffectStyle="regular"
    />
  );
}

const styles = StyleSheet.create({
  sheet: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.28)',
  },
});
