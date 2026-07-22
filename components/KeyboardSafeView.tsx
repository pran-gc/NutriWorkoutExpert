import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  type KeyboardAvoidingViewProps,
} from 'react-native';

type KeyboardSafeViewProps = PropsWithChildren<
  Omit<KeyboardAvoidingViewProps, 'behavior'>
>;

export function keyboardAvoidingBehavior(platform: typeof Platform.OS): 'padding' | 'height' {
  return platform === 'ios' ? 'padding' : 'height';
}

/** One cross-platform keyboard policy for fixed composers and form screens. */
export function KeyboardSafeView({
  children,
  keyboardVerticalOffset = 0,
  style,
  ...props
}: KeyboardSafeViewProps) {
  return (
    <KeyboardAvoidingView
      {...props}
      behavior={keyboardAvoidingBehavior(Platform.OS)}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[{ flex: 1 }, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}
