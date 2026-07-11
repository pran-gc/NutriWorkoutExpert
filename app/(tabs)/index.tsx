import { sharedGreeting, todayISO } from '@shared';
import { useEffect, useMemo, useRef } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { LineChart, MacroRings } from '@/components/analytics';
import { AnimatedCheck, CountUpText, PulseRing } from '@/components/motion';
import { useSession } from '@/components/SessionProvider';
import { Text, View } from '@/components/Themed';
import { Card, SectionTitle } from '@/components/ui';
import { WaterCard } from '@/components/WaterCard';
import { celebrate } from '@/lib/celebrations';
import { useDayTotals, useLatestWeight, useQuests, useStreaks, useWeights, useWorkouts } from '@/lib/hooks';

// NWE-110 cross-runtime proof (Metro half): the SAME function runs in the Deno
// edge function `supabase/functions/proof`. Logged once at module load.
if (__DEV__) console.log(sharedGreeting('Expo (Metro)'));

export default function DashboardScreen() {
  const { profile } = useSession();
  const router = useRouter();
  const today = todayISO();

  const totalsQuery = useDayTotals(today);
  const { latest: latestWeight, refetch: refetchWeight } = useLatestWeight();
  const weightSeries = useWeights({ from: daysAgo(90), to: today });
  const workoutsQuery = useWorkouts({ from: today, to: today });
  const streaksQuery = useStreaks(today);
  const questsQuery = useQuests(today);
  const celebratedQuestKey = useRef<string | null>(null);
  const completedQuestKey = useMemo(
    () => (questsQuery.data ?? []).filter((quest) => quest.complete).map((quest) => quest.id).sort().join('|'),
    [questsQuery.data]
  );

  useEffect(() => {
    if (completedQuestKey && celebratedQuestKey.current !== completedQuestKey) {
      celebratedQuestKey.current = completedQuestKey;
      celebrate('quest').catch(() => undefined);
    }
  }, [completedQuestKey]);

  const totals = totalsQuery.data ?? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const sessions = workoutsQuery.data ?? [];

  const onRefresh = () => {
    totalsQuery.refetch();
    refetchWeight();
    weightSeries.refetch();
    workoutsQuery.refetch();
    streaksQuery.refetch();
    questsQuery.refetch();
  };
  const refreshing =
    totalsQuery.isRefetching || workoutsQuery.isRefetching;

  const calorieTarget = profile?.calorie_target ?? null;
  const name = profile?.display_name ?? 'there';

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.greeting}>Hi {name} 👋</Text>
      <Text style={styles.date}>
        {new Date().toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      </Text>

      <Card>
        <MacroRings
          calories={totals.calories}
          calorieTarget={calorieTarget}
          protein={totals.protein_g}
          proteinTarget={profile?.protein_target_g ?? null}
          carbs={totals.carbs_g}
          carbsTarget={profile?.carbs_target_g ?? null}
          fat={totals.fat_g}
          fatTarget={profile?.fat_target_g ?? null}
          onSetTargets={() => router.push('/(tabs)/profile')}
        />
      </Card>

      <WaterCard targetMl={profile?.water_target_ml ?? 2000} />

      <SectionTitle>Momentum</SectionTitle>
      <Card>
        <CountUpText value={streaksQuery.data?.food.current ?? 0} suffix=" day food streak" />
        <Text style={styles.muted}>Longest: {streaksQuery.data?.food.longest ?? 0} days</Text>
        {(questsQuery.data ?? []).map((quest) => (
          <PulseRing key={quest.id} active={quest.complete}>
            <View style={styles.questRow}>
              <AnimatedCheck checked={quest.complete} />
              <View style={styles.questCopy}>
                <Text style={styles.questTitle}>{quest.complete ? 'Done' : 'Next'} · {quest.title}</Text>
                <Text style={styles.muted}>
                  {quest.progress}/{quest.target}
                </Text>
              </View>
            </View>
          </PulseRing>
        ))}
      </Card>

      <SectionTitle>Weight</SectionTitle>
      <Card>
        {latestWeight ? (
          <>
            <View style={styles.row}>
              <Text style={styles.bigNumber}>{latestWeight.weight_kg}</Text>
              <Text style={styles.muted}> kg — logged {latestWeight.logged_on}</Text>
            </View>
            {profile?.target_weight_kg != null && (
              <Text style={styles.muted}>
                {Math.abs(latestWeight.weight_kg - profile.target_weight_kg).toFixed(1)} kg from
                your {profile.target_weight_kg} kg target
              </Text>
            )}
            <LineChart
              points={(weightSeries.data ?? []).map((w) => ({ logged_on: w.logged_on, value: w.weight_kg }))}
              target={profile?.target_weight_kg ?? null}
            />
          </>
        ) : (
          <Text style={styles.muted}>No weight logged yet — add one in the Profile tab.</Text>
        )}
      </Card>

      <SectionTitle>Today's workouts</SectionTitle>
      <Card>
        {sessions.length === 0 ? (
          <Text style={styles.muted}>Nothing logged today. Rest day or time to move? 💪</Text>
        ) : (
          sessions.map((s) => (
            <View key={s.id} style={styles.workoutRow}>
              <Text style={styles.workoutTitle}>{s.title}</Text>
              <Text style={styles.muted}>
                {s.workout_sets?.length ?? 0} sets
                {s.duration_min ? ` · ${s.duration_min} min` : ''}
              </Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 10,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  date: {
    fontSize: 14,
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: 'transparent',
  },
  bigNumber: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  muted: {
    fontSize: 14,
    opacity: 0.6,
  },
  workoutRow: {
    backgroundColor: 'transparent',
    paddingVertical: 4,
  },
  workoutTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  questRow: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
  },
  questCopy: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  questTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
});
