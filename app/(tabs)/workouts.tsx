import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';

import { useSession } from '@/components/SessionProvider';
import { Text, View } from '@/components/Themed';
import { Card, SectionTitle } from '@/components/ui';
import { todayISO } from '@/lib/nutrition';
import { supabase } from '@/lib/supabase';
import type { WorkoutSession } from '@/lib/types';

interface DraftSet {
  exercise: string;
  reps: string;
  weight: string;
}

const emptySet = (): DraftSet => ({ exercise: '', reps: '', weight: '' });

export default function WorkoutsScreen() {
  const { session } = useSession();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [sets, setSets] = useState<DraftSet[]>([emptySet()]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const { data } = await supabase
      .from('workout_sessions')
      .select('*, workout_sets(*)')
      .eq('user_id', session.user.id)
      .gte('logged_on', since.toISOString().slice(0, 10))
      .order('logged_on', { ascending: false })
      .order('created_at', { ascending: false });
    setSessions((data ?? []) as WorkoutSession[]);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const updateSet = (index: number, patch: Partial<DraftSet>) => {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const save = async () => {
    if (!session) return;
    const validSets = sets.filter((s) => s.exercise.trim());
    if (!title.trim() && validSets.length === 0) {
      Alert.alert('Empty workout', 'Give the workout a name or add at least one exercise.');
      return;
    }
    setSaving(true);
    try {
      const { data: created, error } = await supabase
        .from('workout_sessions')
        .insert({
          user_id: session.user.id,
          title: title.trim() || 'Workout',
          notes: notes.trim() || null,
          duration_min: parseInt(duration, 10) || null,
          logged_on: todayISO(),
        })
        .select()
        .single();
      if (error || !created) {
        Alert.alert('Could not save workout', error?.message ?? 'Unknown error');
        return;
      }
      if (validSets.length > 0) {
        const { error: setsError } = await supabase.from('workout_sets').insert(
          validSets.map((s, i) => ({
            session_id: created.id,
            user_id: session.user.id,
            exercise: s.exercise.trim(),
            set_number: i + 1,
            reps: parseInt(s.reps, 10) || null,
            weight_kg: parseFloat(s.weight) || null,
          }))
        );
        if (setsError) {
          Alert.alert('Workout saved, but sets failed', setsError.message);
        }
      }
      setTitle('');
      setDuration('');
      setNotes('');
      setSets([emptySet()]);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const deleteSession = (s: WorkoutSession) => {
    Alert.alert('Delete workout', `Delete "${s.title}" and all its sets?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('workout_sessions').delete().eq('id', s.id);
          await load();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.newButton} onPress={() => setShowForm(!showForm)}>
          <Text style={styles.newButtonText}>
            {showForm ? 'Close' : '+ Log a workout'}
          </Text>
        </Pressable>

        {showForm && (
          <Card>
            <TextInput
              style={styles.input}
              placeholder="Workout name (e.g. Push day)"
              placeholderTextColor="#999"
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={styles.input}
              placeholder="Duration (minutes)"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={duration}
              onChangeText={setDuration}
            />

            <Text style={styles.setsHeading}>Sets</Text>
            {sets.map((s, i) => (
              <View key={i} style={styles.setRow}>
                <TextInput
                  style={[styles.input, { flex: 2 }]}
                  placeholder="Exercise"
                  placeholderTextColor="#999"
                  value={s.exercise}
                  onChangeText={(v) => updateSet(i, { exercise: v })}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Reps"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  value={s.reps}
                  onChangeText={(v) => updateSet(i, { reps: v })}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="kg"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  value={s.weight}
                  onChangeText={(v) => updateSet(i, { weight: v })}
                />
              </View>
            ))}
            <Pressable onPress={() => setSets([...sets, emptySet()])}>
              <Text style={styles.addSetText}>+ Add set</Text>
            </Pressable>

            <TextInput
              style={styles.input}
              placeholder="Notes (optional)"
              placeholderTextColor="#999"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
            <Pressable style={styles.saveButton} onPress={save} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save workout'}</Text>
            </Pressable>
          </Card>
        )}

        <SectionTitle>Last 14 days</SectionTitle>
        {sessions.length === 0 && (
          <Text style={styles.muted}>No workouts yet. Log your first one above! 💪</Text>
        )}
        {sessions.map((s) => (
          <Pressable key={s.id} onLongPress={() => deleteSession(s)}>
            <Card>
              <View style={styles.sessionHeader}>
                <Text style={styles.sessionTitle}>{s.title}</Text>
                <Text style={styles.muted}>
                  {s.logged_on}
                  {s.duration_min ? ` · ${s.duration_min} min` : ''}
                </Text>
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
              {s.notes ? <Text style={styles.muted}>{s.notes}</Text> : null}
            </Card>
          </Pressable>
        ))}

        {sessions.length > 0 && (
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            Long-press a workout to delete it.
          </Text>
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
  newButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  newButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#666',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#888',
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
    color: '#16a34a',
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  muted: {
    fontSize: 13,
    opacity: 0.6,
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
