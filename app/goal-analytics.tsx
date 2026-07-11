import { ScrollView, StyleSheet } from 'react-native';

import { LineChart } from '@/components/analytics';
import { Text } from '@/components/Themed';
import { Card, EmptyState, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { useGoalAnalytics } from '@/lib/hooks';

export default function GoalAnalyticsScreen() {
  const query = useGoalAnalytics();
  const projection = query.data?.projection;
  const weights = query.data?.weights ?? [];
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Goal progress</Text>
      {query.isLoading && <Muted>Loading goal analytics…</Muted>}
      {query.isError && <Muted>Couldn't load goal analytics — pull to retry.</Muted>}
      {!query.isLoading && !projection && <EmptyState text="Log more weight entries to see goal progress." />}
      <SectionTitle>Projection</SectionTitle>
      <Card>
        {projection?.state === 'projected' ? (
          <>
            <Text style={styles.big}>~{projection.eta}</Text>
            <Muted>At your current pace. Estimates change as you log.</Muted>
          </>
        ) : projection?.state === 'at-goal' ? (
          <Text style={styles.big}>At goal</Text>
        ) : projection?.state === 'moving-away' ? (
          <Muted>Your current trend is moving away from the target. A few more logs will sharpen this.</Muted>
        ) : (
          <Muted>Log more to see this.</Muted>
        )}
      </Card>
      <SectionTitle>Pace</SectionTitle>
      <Card>
        <Text style={styles.big}>{projection?.kgPerWeek ?? 0} kg/week</Text>
        <Muted>Actual trend from logged weights. Not AI-generated.</Muted>
      </Card>
      <SectionTitle>Adherence ↔ progress</SectionTitle>
      <Card>
        {weights.length ? (
          <LineChart points={weights.map((w: any) => ({ logged_on: w.logged_on, value: w.weight_kg }))} color={Brand.accent} />
        ) : (
          <Muted>No weight logs yet.</Muted>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700' },
  big: { fontSize: 28, fontWeight: '700' },
});
