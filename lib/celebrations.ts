import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { CelebrationKind } from '@/constants/motion';

export async function shouldReduceMotion(): Promise<boolean> {
  return AccessibilityInfo.isReduceMotionEnabled();
}

export async function celebrate(kind: CelebrationKind): Promise<{ animated: boolean }> {
  const reduceMotion = await shouldReduceMotion();
  if (!reduceMotion) {
    const feedback =
      kind === 'badge' || kind === 'pr'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning;
    await Haptics.notificationAsync(feedback).catch(() => undefined);
  }
  return { animated: !reduceMotion };
}
