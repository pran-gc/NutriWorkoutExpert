import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { BarList, LineChart } from '@/components/analytics';
import { Text } from '@/components/Themed';
import { Card, Chip, ChipRow, EmptyState, Muted, SectionTitle } from '@/components/ui';
import { useExerciseHistory } from '@/lib/hooks';

export default function ExerciseDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const [range, setRange] = useState<'30' | '90' | 'all'>('90');
  const query = useExerciseHistory(params.id ?? null, range);
  const rows = query.data ?? [];
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{params.name ?? 'Exercise'}</Text>
      <ChipRow>
        <Chip label="30" active={range === '30'} onPress={() => setRange('30')} />
        <Chip label="90" active={range === '90'} onPress={() => setRange('90')} />
        <Chip label="All" active={range === 'all'} onPress={() => setRange('all')} />
      </ChipRow>
      {query.isLoading && <ActivityIndicator />}
      {query.isError && <Muted>Couldn't load exercise history — pull to retry.</Muted>}
      {!query.isLoading && !query.isError && rows.length === 0 ? <EmptyState text="Log this exercise a few times to see progress." /> : null}
      {rows.length && !query.isError ? (
        <>
          <SectionTitle>Best set e1RM</SectionTitle>
          <Card>
            <LineChart points={rows.map((r) => ({ logged_on: r.logged_on, value: r.best_e1rm }))} />
          </Card>
          <SectionTitle>Session volume</SectionTitle>
          <Card>
            <BarList rows={rows.map((r) => ({ label: r.logged_on.slice(5), value: r.volume }))} />
          </Card>
          <SectionTitle>History</SectionTitle>
          <Card>
            {rows.map((row) => (
              <Muted key={row.logged_on}>{row.logged_on} · {row.summary}</Muted>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700' },
});
