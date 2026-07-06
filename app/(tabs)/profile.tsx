import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  computeTargets,
  todayISO,
} from '@/lib/nutrition';
import { supabase } from '@/lib/supabase';
import type { ActivityLevel, GoalType, Sex, WeightLog } from '@/lib/types';

const ACTIVITIES = Object.keys(ACTIVITY_LABELS) as ActivityLevel[];
const GOALS = Object.keys(GOAL_LABELS) as GoalType[];

export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useSession();

  const [displayName, setDisplayName] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<GoalType>('maintain');
  const [targetWeight, setTargetWeight] = useState('');
  const [newWeight, setNewWeight] = useState('');
  const [latestWeight, setLatestWeight] = useState<WeightLog | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setSex(profile.sex);
    setBirthYear(profile.birth_year?.toString() ?? '');
    setHeightCm(profile.height_cm?.toString() ?? '');
    setActivity(profile.activity_level);
    setGoal(profile.goal_type);
    setTargetWeight(profile.target_weight_kg?.toString() ?? '');
  }, [profile]);

  const loadWeight = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('weight_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .order('logged_on', { ascending: false })
      .limit(1);
    setLatestWeight((data?.[0] as WeightLog) ?? null);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadWeight();
    }, [loadWeight])
  );

  const logWeight = async () => {
    if (!session) return;
    const kg = parseFloat(newWeight);
    if (!kg || kg <= 0) {
      Alert.alert('Invalid weight', 'Enter your weight in kg.');
      return;
    }
    const { error } = await supabase
      .from('weight_logs')
      .upsert(
        { user_id: session.user.id, weight_kg: kg, logged_on: todayISO() },
        { onConflict: 'user_id,logged_on' }
      );
    if (error) {
      Alert.alert('Could not log weight', error.message);
      return;
    }
    setNewWeight('');
    await loadWeight();
  };

  const saveProfile = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const parsedSex = sex;
      const parsedBirthYear = parseInt(birthYear, 10) || null;
      const parsedHeight = parseFloat(heightCm) || null;

      // Recompute targets whenever we have enough data
      const weightForTargets = latestWeight?.weight_kg ?? null;
      const targets =
        parsedSex && parsedBirthYear && parsedHeight && weightForTargets
          ? computeTargets(
              {
                sex: parsedSex,
                birth_year: parsedBirthYear,
                height_cm: parsedHeight,
                activity_level: activity,
                goal_type: goal,
              },
              weightForTargets
            )
          : null;

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null,
          sex: parsedSex,
          birth_year: parsedBirthYear,
          height_cm: parsedHeight,
          activity_level: activity,
          goal_type: goal,
          target_weight_kg: parseFloat(targetWeight) || null,
          ...(targets && {
            calorie_target: targets.calories,
            protein_target_g: targets.proteinG,
            carbs_target_g: targets.carbsG,
            fat_target_g: targets.fatG,
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id);

      if (error) {
        Alert.alert('Could not save profile', error.message);
        return;
      }
      await refreshProfile();
      Alert.alert(
        'Profile saved',
        targets
          ? `Daily targets updated: ${targets.calories} kcal · P ${targets.proteinG} g · C ${targets.carbsG} g · F ${targets.fatG} g`
          : 'Log a weight and fill in sex, birth year and height to get automatic calorie targets.'
      );
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <SectionTitle>Today's weight</SectionTitle>
        <Card>
          {latestWeight && (
            <Text style={styles.muted}>
              Last logged: {latestWeight.weight_kg} kg on {latestWeight.logged_on}
            </Text>
          )}
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Weight (kg)"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={newWeight}
              onChangeText={setNewWeight}
            />
            <Pressable style={styles.button} onPress={logWeight}>
              <Text style={styles.buttonText}>Log</Text>
            </Pressable>
          </View>
        </Card>

        <SectionTitle>About you</SectionTitle>
        <Card>
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor="#999"
            value={displayName}
            onChangeText={setDisplayName}
          />
          <View style={styles.chipRow}>
            {(['male', 'female'] as Sex[]).map((s) => (
              <Pressable
                key={s}
                style={[styles.chip, sex === s && styles.chipActive]}
                onPress={() => setSex(s)}>
                <Text style={sex === s ? styles.chipTextActive : styles.chipText}>
                  {s === 'male' ? 'Male' : 'Female'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Birth year"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={birthYear}
              onChangeText={setBirthYear}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Height (cm)"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={heightCm}
              onChangeText={setHeightCm}
            />
          </View>
        </Card>

        <SectionTitle>Activity level</SectionTitle>
        <Card>
          {ACTIVITIES.map((a) => (
            <Pressable
              key={a}
              style={[styles.optionRow, activity === a && styles.optionRowActive]}
              onPress={() => setActivity(a)}>
              <Text style={activity === a ? styles.optionTextActive : undefined}>
                {ACTIVITY_LABELS[a]}
              </Text>
            </Pressable>
          ))}
        </Card>

        <SectionTitle>Goal</SectionTitle>
        <Card>
          <View style={styles.chipRow}>
            {GOALS.map((g) => (
              <Pressable
                key={g}
                style={[styles.chip, goal === g && styles.chipActive]}
                onPress={() => setGoal(g)}>
                <Text style={goal === g ? styles.chipTextActive : styles.chipText}>
                  {GOAL_LABELS[g]}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Target weight (kg, optional)"
            placeholderTextColor="#999"
            keyboardType="numeric"
            value={targetWeight}
            onChangeText={setTargetWeight}
          />
        </Card>

        {profile?.calorie_target != null && (
          <>
            <SectionTitle>Current daily targets</SectionTitle>
            <Card>
              <Text>
                {profile.calorie_target} kcal · Protein {profile.protein_target_g ?? '—'} g ·
                Carbs {profile.carbs_target_g ?? '—'} g · Fat {profile.fat_target_g ?? '—'} g
              </Text>
              <Text style={styles.muted}>
                Recalculated automatically when you save your profile (Mifflin-St Jeor formula).
              </Text>
            </Card>
          </>
        )}

        <Pressable style={styles.button} onPress={saveProfile} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save profile & update targets'}</Text>
        </Pressable>

        <Pressable style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 10,
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
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: 'transparent',
  },
  chip: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: '#16a34a',
  },
  chipText: {
    fontSize: 14,
    color: '#16a34a',
  },
  chipTextActive: {
    fontSize: 14,
    color: '#fff',
  },
  optionRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  optionRowActive: {
    backgroundColor: '#16a34a',
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  muted: {
    fontSize: 13,
    opacity: 0.6,
  },
  signOutButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 24,
  },
  signOutText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '500',
  },
});
