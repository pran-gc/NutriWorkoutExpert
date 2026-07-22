import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  type Edge,
} from 'react-native-safe-area-context';

import { useThemeColor } from '@/components/Themed';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';

const ALL_EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];

type AppScreenProps = PropsWithChildren<{
  /** Native modals need a provider rooted in their own screen hierarchy. */
  modal?: boolean;
  /** Native headers already manage system insets, but still need keyboard avoidance. */
  safeArea?: boolean;
  keyboardVerticalOffset?: number;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Shared boundary for screens that draw their own chrome instead of using a
 * native Stack header. Root navigation applies this automatically to known
 * headerless routes; standalone React Native modals can use it directly.
 */
export function AppScreen({
  children,
  modal = false,
  safeArea = true,
  keyboardVerticalOffset = 0,
  edges = ALL_EDGES,
  style,
}: AppScreenProps) {
  const backgroundColor = useThemeColor({}, 'background');
  const keyboardSafeContent = (
    <KeyboardSafeView keyboardVerticalOffset={keyboardVerticalOffset}>
      {children}
    </KeyboardSafeView>
  );
  const screen = safeArea ? (
    <SafeAreaView style={[{ flex: 1, backgroundColor }, style]} edges={edges}>
      {keyboardSafeContent}
    </SafeAreaView>
  ) : (
    <KeyboardSafeView
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[{ flex: 1, backgroundColor }, style]}>
      {children}
    </KeyboardSafeView>
  );

  return modal ? <SafeAreaProvider>{screen}</SafeAreaProvider> : screen;
}
