import { todayISO } from '@shared';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { BarList, LineChart } from '@/components/analytics';
import { Text, View } from '@/components/Themed';
import { Card, Chip, ChipRow, EmptyState, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { useTrainingAnalytics } from '@/lib/hooks';

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function GymAnalyticsScreen() {
  const [range, setRange] = useState<30 | 90>(30);
  const query = useTrainingAnalytics({ from: daysAgo(range), to: todayISO() });
  const data = query.data;
  const groupTotals = new Map<string, number>();
  for (const week of data?.weeklyVolume ?? []) {
    for (const [group, value] of Object.entries(week.groups)) groupTotals.set(group, (groupTotals.get(group) ?? 0) + Number(value));
  }
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gym analytics</Text>
        <ChipRow>
          <Chip label="30d" active={range === 30} onPress={() => setRange(30)} />
          <Chip label="90d" active={range === 90} onPress={() => setRange(90)} />
        </ChipRow>
      </View>
      {query.isLoading && <ActivityIndicator />}
      {query.isError && <Muted>Couldn't load gym analytics — pull to retry.</Muted>}
      {!query.isLoading && (!data || data.consistency.sessions === 0) && <EmptyState text="Log workouts to see training trends." />}
      {data && !query.isError ? (
        <>
          <SectionTitle>Weekly volume</SectionTitle>
          <Card>
            {[...groupTotals.entries()].length === 0 ? (
              <Muted>No strength volume in this range.</Muted>
            ) : (
              <BarList rows={[...groupTotals.entries()].map(([label, value]) => ({ label, value }))} color={Brand.accent} />
            )}
          </Card>
          <SectionTitle>Consistency</SectionTitle>
          <Card>
            <Text style={styles.big}>{data.consistency.sessionsPerWeek}/week</Text>
            <Muted>{data.consistency.sessions} sessions · longest active span {data.consistency.longestWeekStreak} weeks</Muted>
          </Card>
          <SectionTitle>Recent PRs</SectionTitle>
          <Card>
            {data.prs.length === 0 ? <Muted>No PRs in this range yet.</Muted> : null}
            {data.prs.map((pr: any) => (
              <View key={`${pr.exercise}-${pr.date}-${pr.e1rm}`} style={styles.row}>
                <Text>🎉 {pr.exercise}</Text>
                <Muted>{pr.e1rm} kg · {pr.date}</Muted>
              </View>
            ))}
          </Card>
          <SectionTitle>Cardio</SectionTitle>
          <Card>
            {data.cardio.length === 0 ? (
              <Muted>No cardio logged in this range.</Muted>
            ) : (
              <LineChart points={data.cardio.map((c: any) => ({ logged_on: c.date, value: c.minutes }))} color={Brand.fat} />
            )}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  header: { gap: 8, backgroundColor: 'transparent' },
  title: { fontSize: 24, fontWeight: '700' },
  big: { fontSize: 28, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, backgroundColor: 'transparent' },
});
