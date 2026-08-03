import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { AccessibilityInfo, Animated, Pressable, StyleSheet } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { buildMacroRings, movingAverage7 } from '@shared';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Brand } from '@/constants/Colors';

const MACRO_COLORS = {
  protein: Brand.protein,
  carbs: Brand.carbs,
  fat: Brand.fat,
} as const;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function MacroRings({
  calories,
  calorieTarget,
  protein,
  proteinTarget,
  carbs,
  carbsTarget,
  fat,
  fatTarget,
  onSetTargets,
}: {
  calories: number;
  calorieTarget: number | null;
  protein: number;
  proteinTarget: number | null;
  carbs: number;
  carbsTarget: number | null;
  fat: number;
  fatTarget: number | null;
  onSetTargets?: () => void;
}) {
  const textColor = useThemeColor({}, 'text');
  const [reduceMotion, setReduceMotion] = useState(true);
  const progress = useRef(new Animated.Value(1)).current;
  const rings = buildMacroRings([
    { key: 'protein', value: protein, target: proteinTarget },
    { key: 'carbs', value: carbs, target: carbsTarget },
    { key: 'fat', value: fat, target: fatTarget },
  ]);
  const hasTargets = rings.some((r) => r.hasTarget);
  const radii = [62, 48, 34];
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!mounted) return;
        setReduceMotion(enabled);
        progress.setValue(enabled ? 1 : 0);
        if (!enabled) {
          Animated.timing(progress, {
            toValue: 1,
            duration: 600,
            easing: (t) => 1 - Math.pow(1 - t, 3),
            useNativeDriver: false,
          }).start();
        }
      })
      .catch(() => {
        if (mounted) progress.setValue(1);
      });
    return () => {
      mounted = false;
    };
  }, [progress]);
  return (
    <View style={styles.ringWrap}>
      <Svg width={172} height={172} viewBox="0 0 172 172">
        <G rotation="-90" origin="86,86">
          {rings.map((ring, index) => {
            const radius = radii[index];
            const circumference = 2 * Math.PI * radius;
            const visible = Math.min(1, ring.fraction);
            return (
              <G key={ring.key}>
                <Circle cx="86" cy="86" r={radius} stroke="rgba(142,142,147,.24)" strokeWidth="11" fill="none" />
                <AnimatedCircle
                  testID={`macro-ring-${ring.key}`}
                  accessibilityLabel={`${ring.key} ${Math.round(ring.value)} of ${ring.target ?? 0} grams`}
                  cx="86"
                  cy="86"
                  r={radius}
                  stroke={ring.hasTarget ? MACRO_COLORS[ring.key] : 'rgba(142,142,147,.55)'}
                  strokeWidth="11"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={reduceMotion ? circumference * (1 - visible) : progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [circumference, circumference * (1 - visible)],
                  })}
                />
                {ring.fraction > 1 && (
                  <Circle
                    testID={`macro-lap-${ring.key}`}
                    cx={86 + Math.cos(2 * Math.PI * ring.lapFraction) * radius}
                    cy={86 + Math.sin(2 * Math.PI * ring.lapFraction) * radius}
                    r="5"
                    fill={MACRO_COLORS[ring.key]}
                    stroke="#fff"
                    strokeWidth="2"
                  />
                )}
              </G>
            );
          })}
        </G>
        <SvgText x="86" y="83" textAnchor="middle" fontSize="25" fontWeight="700" fill={textColor}>
          {Math.round(calories)}
        </SvgText>
        <SvgText x="86" y="103" textAnchor="middle" fontSize="12" fill={textColor}>
          {calorieTarget ? `of ${calorieTarget} kcal` : 'kcal today'}
        </SvgText>
      </Svg>
      <View style={styles.legend}>
        {rings.map((ring) => (
          <View key={ring.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: ring.hasTarget ? MACRO_COLORS[ring.key] : '#8e8e93' }]} />
            <Text style={styles.legendText}>
              {ring.key[0].toUpperCase()} {Math.round(ring.value)}/{ring.target ?? 0} g
            </Text>
          </View>
        ))}
      </View>
      {!hasTargets && (
        <Pressable onPress={onSetTargets}>
          <Text style={styles.targetLink}>Set your targets →</Text>
        </Pressable>
      )}
    </View>
  );
}

export function LineChart({
  points,
  color = Brand.accent,
  target,
}: {
  points: { logged_on: string; value: number }[];
  color?: string;
  target?: number | null;
}) {
  const width = 320;
  const height = 120;
  const allValues = [...points.map((p) => p.value), ...(target ? [target] : [])];
  const min = allValues.length ? Math.min(...allValues) : 0;
  const max = allValues.length ? Math.max(...allValues) : 1;
  const span = Math.max(1, max - min);
  const xy = (value: number, index: number, count: number) => ({
    x: count <= 1 ? width / 2 : (index / (count - 1)) * width,
    y: height - ((value - min) / span) * (height - 20) - 10,
  });
  const avg = movingAverage7(points);
  const path = avg
    .map((p, i) => {
      const point = xy(p.value, i, avg.length);
      return `${i === 0 ? 'M' : 'L'}${point.x},${point.y}`;
    })
    .join(' ');
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {target ? (
        <Line
          testID="line-chart-target"
          x1="0"
          x2={width}
          y1={xy(target, 0, 1).y}
          y2={xy(target, 0, 1).y}
          stroke="rgba(142,142,147,.7)"
          strokeWidth="1.5"
          strokeDasharray="5 5"
        />
      ) : null}
      {path ? <Path testID="line-chart-average" d={path} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" /> : null}
      {points.map((p, i) => {
        const point = xy(p.value, i, points.length);
        return <Circle key={`${p.logged_on}-${i}`} cx={point.x} cy={point.y} r="4" fill={color} />;
      })}
    </Svg>
  );
}

export function BarList({
  rows,
  color = Brand.accent,
}: {
  rows: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 8, backgroundColor: 'transparent' }}>
      {rows.map((row) => (
        <View key={row.label} style={{ gap: 3, backgroundColor: 'transparent' }}>
          <View style={styles.barLabel}>
            <Text style={styles.small}>{row.label}</Text>
            <Text style={styles.small}>{Math.round(row.value)}</Text>
          </View>
          <Svg width="100%" height={12}>
            <Rect x="0" y="0" width="100%" height="12" rx="6" fill="rgba(142,142,147,.18)" />
            <Rect x="0" y="0" width={`${(row.value / max) * 100}%`} height="12" rx="6" fill={color} />
          </Svg>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center', gap: 8, backgroundColor: 'transparent' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, backgroundColor: 'transparent' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'transparent' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 13 },
  targetLink: { color: Brand.accent, fontWeight: '600' },
  barLabel: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'transparent' },
  small: { fontSize: 13 },
});
