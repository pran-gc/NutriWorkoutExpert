import { todayISO } from '@shared';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { BarList } from '@/components/analytics';
import { Text, View } from '@/components/Themed';
import { Card, Chip, ChipRow, EmptyState, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { useFoodAnalytics } from '@/lib/hooks';

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function FoodAnalyticsScreen() {
  const [range, setRange] = useState<7 | 30>(7);
  const query = useFoodAnalytics({ from: daysAgo(range), to: todayISO() });
  const data = query.data;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Food analytics</Text>
        <ChipRow>
          <Chip label="7d" active={range === 7} onPress={() => setRange(7)} />
          <Chip label="30d" active={range === 30} onPress={() => setRange(30)} />
        </ChipRow>
      </View>
      {query.isLoading && <FoodAnalyticsSkeleton />}
      {query.isError && <Muted>Couldn't load food analytics — pull to retry.</Muted>}
      {!query.isLoading && (!data || data.daily.length === 0) && <EmptyState text="Log a few meals to see food patterns." />}
      {data && !query.isError ? (
        <>
          <SectionTitle>Adherence</SectionTitle>
          <Card>
            <View style={styles.heatmap}>
              {Array.from({ length: range }).map((_, i) => {
                const d = daysAgo(range - i - 1);
                const row = data.daily.find((x: any) => x.date === d);
                return (
                  <View
                    key={d}
                    testID={row ? `food-heatmap-logged-${i}` : `food-heatmap-empty-${i}`}
                    style={[
                      styles.cell,
                      { backgroundColor: row ? `rgba(22,163,74,${0.18 + (row.closeness ?? 0) * 0.72})` : 'rgba(142,142,147,.16)' },
                    ]}
                  />
                );
              })}
            </View>
            <Muted>Blank cells mean no log, not a missed target.</Muted>
          </Card>
          <SectionTitle>Daily macros</SectionTitle>
          <Card>
            <BarList rows={data.daily.map((d: any) => ({ label: d.date.slice(5), value: d.protein_g + d.carbs_g + d.fat_g }))} color={Brand.protein} />
          </Card>
          <SectionTitle>Avg day</SectionTitle>
          <Card>
            <Text style={styles.big}>{Math.round(data.avg.calories)} kcal</Text>
            <Muted>P {Math.round(data.avg.protein_g)} g · C {Math.round(data.avg.carbs_g)} g · F {Math.round(data.avg.fat_g)} g</Muted>
          </Card>
          <SectionTitle>Where calories come from</SectionTitle>
          <Card>
            <BarList rows={data.byMeal.map((m: any) => ({ label: m.meal_type, value: m.calories }))} color={Brand.carbs} />
          </Card>
          <SectionTitle>Top foods</SectionTitle>
          <Card>
            {data.topFoods.map((f: any) => (
              <View key={f.name} style={styles.row}>
                <Text>{f.name}</Text>
                <Muted>{f.count}x · {Math.round(f.calories)} kcal</Muted>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function FoodAnalyticsSkeleton() {
  return (
    <Card>
      <View style={styles.skeletonRow}>
        {Array.from({ length: 7 }).map((_, index) => (
          <View key={index} style={styles.skeletonCell} />
        ))}
      </View>
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, { width: '62%' }]} />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  header: { gap: 8, backgroundColor: 'transparent' },
  title: { fontSize: 24, fontWeight: '700' },
  heatmap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, backgroundColor: 'transparent' },
  cell: { width: 22, height: 22, borderRadius: 5 },
  big: { fontSize: 28, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, backgroundColor: 'transparent' },
  skeletonRow: { flexDirection: 'row', gap: 6, backgroundColor: 'transparent' },
  skeletonCell: { width: 22, height: 22, borderRadius: 5, backgroundColor: 'rgba(142,142,147,.22)' },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: 'rgba(142,142,147,.22)', width: '82%' },
});
