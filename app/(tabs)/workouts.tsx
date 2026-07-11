import { todayISO } from '@shared';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Card, EmptyState, Input, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { useCreateWorkout, useDeleteWorkout, useWorkouts } from '@/lib/hooks';

interface DraftSet {
  exercise: string;
  reps: string;
  weight: string;
}

const emptySet = (): DraftSet => ({ exercise: '', reps: '', weight: '' });

function rangeStart(): string {
  const since = new Date();
  since.setDate(since.getDate() - 14);
  return `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(
    since.getDate()
  ).padStart(2, '0')}`;
}

export default function WorkoutsScreen() {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [sets, setSets] = useState<DraftSet[]>([emptySet()]);

  const workoutsQuery = useWorkouts({ from: rangeStart(), to: todayISO() });
  const createWorkout = useCreateWorkout();
  const deleteWorkout = useDeleteWorkout();
  const sessions = workoutsQuery.data ?? [];

  const updateSet = (index: number, patch: Partial<DraftSet>) => {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const save = async () => {
    const validSets = sets.filter((s) => s.exercise.trim());
    if (!title.trim() && validSets.length === 0) {
      Alert.alert('Empty workout', 'Give the workout a name or add at least one exercise.');
      return;
    }
    try {
      await createWorkout.mutateAsync({
        title: title.trim() || 'Workout',
        notes: notes.trim() || null,
        duration_min: parseInt(duration, 10) || null,
        logged_on: todayISO(),
        sets: validSets.map((s, i) => ({
          exercise: s.exercise.trim(),
          set_number: i + 1,
          reps: parseInt(s.reps, 10) || null,
          weight_kg: parseFloat(s.weight) || null,
        })),
      });
      setTitle('');
      setDuration('');
      setNotes('');
      setSets([emptySet()]);
      setShowForm(false);
    } catch (e) {
      Alert.alert('Could not save workout', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const confirmDelete = (id: string, sessionTitle: string) => {
    Alert.alert('Delete workout', `Delete "${sessionTitle}" and all its sets?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout.mutate(id) },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Button
          title={showForm ? 'Close' : '+ Log a workout'}
          onPress={() => setShowForm(!showForm)}
        />

        {showForm && (
          <Card>
            <Input placeholder="Workout name (e.g. Push day)" value={title} onChangeText={setTitle} />
            <Input placeholder="Duration (minutes)" keyboardType="numeric" value={duration} onChangeText={setDuration} />

            <Text style={styles.setsHeading}>Sets</Text>
            {sets.map((s, i) => (
              <View key={i} style={styles.setRow}>
                <Input style={{ flex: 2 }} placeholder="Exercise" value={s.exercise} onChangeText={(v) => updateSet(i, { exercise: v })} />
                <Input style={{ flex: 1 }} placeholder="Reps" keyboardType="numeric" value={s.reps} onChangeText={(v) => updateSet(i, { reps: v })} />
                <Input style={{ flex: 1 }} placeholder="kg" keyboardType="numeric" value={s.weight} onChangeText={(v) => updateSet(i, { weight: v })} />
              </View>
            ))}
            <Pressable onPress={() => setSets([...sets, emptySet()])}>
              <Text style={styles.addSetText}>+ Add set</Text>
            </Pressable>

            <Input placeholder="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
            <Button title="Save workout" onPress={save} loading={createWorkout.isPending} style={{ marginTop: 4 }} />
          </Card>
        )}

        <SectionTitle>Last 14 days</SectionTitle>
        {workoutsQuery.isLoading && <ActivityIndicator style={{ marginVertical: 8 }} />}
        {!workoutsQuery.isLoading && sessions.length === 0 && (
          <EmptyState text="No workouts yet. Log your first one above! 💪" />
        )}
        {sessions.map((s) => (
          <Pressable key={s.id} onLongPress={() => confirmDelete(s.id, s.title)}>
            <Card>
              <View style={styles.sessionHeader}>
                <Text style={styles.sessionTitle}>{s.title}</Text>
                <Muted>
                  {s.logged_on}
                  {s.duration_min ? ` · ${s.duration_min} min` : ''}
                </Muted>
              </View>
              {(s.workout_sets ?? [])
                .sort((a, b) => a.set_number - b.set_number)
                .map((set) => (
                  <Text key={set.id} style={styles.setLine}>
                    {set.exercise}
                    {set.reps != null ? ` — ${set.reps} reps` : ''}
                    {set.weight_kg != null ? ` @ ${set.weight_kg} kg` : ''}
                  </Text>
                ))}
              {s.notes ? <Muted>{s.notes}</Muted> : null}
            </Card>
          </Pressable>
        ))}

        {sessions.length > 0 && (
          <Muted style={{ textAlign: 'center' }}>Long-press a workout to delete it.</Muted>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 10,
  },
  setsHeading: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  setRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'transparent',
  },
  addSetText: {
    color: Brand.accent,
    fontSize: 14,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    backgroundColor: 'transparent',
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  setLine: {
    fontSize: 14,
  },
});
