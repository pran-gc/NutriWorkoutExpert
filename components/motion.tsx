import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text, View } from '@/components/Themed';
import { Brand } from '@/constants/Colors';
import { Motion } from '@/constants/motion';

export function AnimatedCheck({ checked }: { checked: boolean }) {
  const scale = useSharedValue(checked ? 1 : 0.82);
  const fill = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(checked ? 1 : 0, { duration: Motion.duration.normal });
    scale.value = checked
      ? withSequence(withSpring(Motion.scale.pop), withSpring(1))
      : withTiming(0.82, { duration: Motion.duration.fast });
  }, [checked, fill, scale]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: checked ? 1 : 0.62,
    backgroundColor: fill.value > 0.5 ? Brand.accent : 'transparent',
  }));

  return (
    <Animated.View accessibilityRole="image" accessibilityLabel={checked ? 'Complete' : 'Incomplete'} style={[styles.check, boxStyle]}>
      {checked && <Text style={styles.checkText}>✓</Text>}
    </Animated.View>
  );
}

export function PulseRing({ active, children }: { active: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (active) scale.value = withSequence(withSpring(Motion.scale.pop), withSpring(1));
  }, [active, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export function CountUpText({ value, suffix = '' }: { value: number; suffix?: string }) {
  return <Text style={styles.count}>{value}{suffix}</Text>;
}

export function BadgeBurst({ visible }: { visible: boolean }) {
  const scale = useSharedValue(visible ? 1 : 0.9);
  useEffect(() => {
    if (visible) scale.value = withSequence(withSpring(1.08), withSpring(1));
  }, [visible, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: visible ? 1 : 0.35 }));
  return (
    <Animated.View style={[styles.burst, style]} accessibilityLabel={visible ? 'Badge celebration' : 'Badge locked'}>
      <View style={styles.spark} />
      <View style={[styles.spark, styles.sparkTwo]} />
      <View style={[styles.spark, styles.sparkThree]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  count: { fontSize: 16, fontWeight: '800' },
  burst: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  spark: { width: 18, height: 18, borderRadius: 9, backgroundColor: Brand.accent, opacity: 0.18, position: 'absolute' },
  sparkTwo: { width: 28, height: 28, borderRadius: 14, opacity: 0.12 },
  sparkThree: { width: 38, height: 38, borderRadius: 19, opacity: 0.08 },
});
