import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View
      style={[styles.card, style]}
      lightColor="rgba(0,0,0,0.04)"
      darkColor="rgba(255,255,255,0.07)">
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View
      style={styles.track}
      lightColor="rgba(0,0,0,0.08)"
      darkColor="rgba(255,255,255,0.12)">
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 8,
  },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
});
