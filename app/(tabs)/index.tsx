import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { useSession } from '@/components/SessionProvider';
import { Text, View } from '@/components/Themed';
import { Card, ProgressBar, SectionTitle } from '@/components/ui';
import { todayISO } from '@/lib/nutrition';
import { supabase } from '@/lib/supabase';
import type { FoodLog, WeightLog, WorkoutSession } from '@/lib/types';

interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export default function DashboardScreen() {
  const { session, profile } = useSession();
  const [totals, setTotals] = useState<DayTotals>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [latestWeight, setLatestWeight] = useState<WeightLog | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const today = todayISO();

    const [foodRes, weightRes, workoutRes] = await Promise.all([
      supabase
        .from('food_logs')
        .select('calories, protein_g, carbs_g, fat_g')
        .eq('user_id', session.user.id)
        .eq('logged_on', today),
      supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('logged_on', { ascending: false })
        .limit(1),
      supabase
        .from('workout_sessions')
        .select('*, workout_sets(*)')
        .eq('user_id', session.user.id)
        .eq('logged_on', today),
    ]);

    const logs = (foodRes.data ?? []) as Pick<
      FoodLog,
      'calories' | 'protein_g' | 'carbs_g' | 'fat_g'
    >[];
    setTotals({
      calories: logs.reduce((s, l) => s + l.calories, 0),
      protein: logs.reduce((s, l) => s + l.protein_g, 0),
      carbs: logs.reduce((s, l) => s + l.carbs_g, 0),
      fat: logs.reduce((s, l) => s + l.fat_g, 0),
    });
    setLatestWeight((weightRes.data?.[0] as WeightLog) ?? null);
    setSessions((workoutRes.data ?? []) as WorkoutSession[]);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

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

      <SectionTitle>Calories</SectionTitle>
      <Card>
        <View style={styles.row}>
          <Text style={styles.bigNumber}>{Math.round(totals.calories)}</Text>
          <Text style={styles.muted}>
            {calorieTarget ? ` / ${calorieTarget} kcal` : ' kcal (set a target in Profile)'}
          </Text>
        </View>
        {calorieTarget != null && (
          <>
            <ProgressBar value={totals.calories} max={calorieTarget} color="#16a34a" />
            <Text style={styles.muted}>
              {totals.calories <= calorieTarget
                ? `${Math.round(calorieTarget - totals.calories)} kcal remaining`
                : `${Math.round(totals.calories - calorieTarget)} kcal over target`}
            </Text>
          </>
        )}
      </Card>

      <SectionTitle>Macros</SectionTitle>
      <Card>
        <MacroRow
          label="Protein"
          value={totals.protein}
          target={profile?.protein_target_g ?? null}
          color="#dc2626"
        />
        <MacroRow
          label="Carbs"
          value={totals.carbs}
          target={profile?.carbs_target_g ?? null}
          color="#f59e0b"
        />
        <MacroRow
          label="Fat"
          value={totals.fat}
          target={profile?.fat_target_g ?? null}
          color="#3b82f6"
        />
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

function MacroRow({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number | null;
  color: string;
}) {
  return (
    <View style={{ gap: 4, backgroundColor: 'transparent' }}>
      <View style={styles.rowBetween}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.muted}>
          {Math.round(value)}
          {target ? ` / ${target}` : ''} g
        </Text>
      </View>
      <ProgressBar value={value} max={target ?? Math.max(value, 1)} color={color} />
    </View>
  );
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
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  macroLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  workoutRow: {
    backgroundColor: 'transparent',
    paddingVertical: 4,
  },
  workoutTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
});
