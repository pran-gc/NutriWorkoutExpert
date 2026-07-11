import { ACTIVITY_LABELS, GOAL_LABELS, todayISO } from '@shared';
import type { ActivityLevel, GoalType, Sex } from '@shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet } from 'react-native';

import { useSession } from '@/components/SessionProvider';
import { Text, View } from '@/components/Themed';
import {
  Button,
  Card,
  Chip,
  ChipRow,
  Input,
  Muted,
  OptionRow,
  SectionTitle,
} from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import {
  useChangePassword,
  useExportData,
  useLatestWeight,
  useUpdateProfile,
  useUpsertWeight,
} from '@/lib/hooks';

const ACTIVITIES = Object.keys(ACTIVITY_LABELS) as ActivityLevel[];
const GOALS = Object.keys(GOAL_LABELS) as GoalType[];

export default function ProfileScreen() {
  const { profile, refreshProfile } = useSession();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<GoalType>('maintain');
  const [targetWeight, setTargetWeight] = useState('');
  const [waterTarget, setWaterTarget] = useState('');
  const [newWeight, setNewWeight] = useState('');

  const { latest: latestWeight } = useLatestWeight();
  const upsertWeight = useUpsertWeight();
  const updateProfile = useUpdateProfile();
  const exportData = useExportData();
  const changePassword = useChangePassword();
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setSex(profile.sex);
    setBirthYear(profile.birth_year?.toString() ?? '');
    setHeightCm(profile.height_cm?.toString() ?? '');
    setActivity(profile.activity_level);
    setGoal(profile.goal_type);
    setTargetWeight(profile.target_weight_kg?.toString() ?? '');
    setWaterTarget(profile.water_target_ml?.toString() ?? '2000');
  }, [profile]);

  const logWeight = async () => {
    const kg = parseFloat(newWeight);
    if (!kg || kg <= 0) {
      Alert.alert('Invalid weight', 'Enter your weight in kg.');
      return;
    }
    try {
      await upsertWeight.mutateAsync({ date: todayISO(), weight_kg: kg });
      setNewWeight('');
    } catch (e) {
      Alert.alert('Could not log weight', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const saveProfile = async () => {
    try {
      const updated = await updateProfile.mutateAsync({
        display_name: displayName.trim() || null,
        sex,
        birth_year: parseInt(birthYear, 10) || null,
        height_cm: parseFloat(heightCm) || null,
        activity_level: activity,
        goal_type: goal,
        target_weight_kg: parseFloat(targetWeight) || null,
        water_target_ml: parseInt(waterTarget, 10) || 2000,
      });
      await refreshProfile();
      Alert.alert(
        'Profile saved',
        updated.calorie_target != null
          ? `Daily targets updated: ${updated.calorie_target} kcal · P ${updated.protein_target_g} g · C ${updated.carbs_target_g} g · F ${updated.fat_target_g} g`
          : 'Log a weight and fill in sex, birth year and height to get automatic calorie targets.'
      );
    } catch (e) {
      Alert.alert('Could not save profile', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const exportMyData = async () => {
    try {
      const bundle = await exportData.mutateAsync();
      await Share.share({
        title: 'My NutriWorkoutExpert data',
        message: JSON.stringify(bundle, null, 2),
      });
    } catch (e) {
      Alert.alert('Could not export', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const doChangePassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Too short', 'Use at least 8 characters.');
      return;
    }
    try {
      await changePassword.mutateAsync(newPassword);
      setNewPassword('');
      setShowPassword(false);
      Alert.alert('Password updated', 'Your password has been changed.');
    } catch (e) {
      Alert.alert('Could not change password', e instanceof Error ? e.message : 'Please try again.');
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
            <Muted>
              Last logged: {latestWeight.weight_kg} kg on {latestWeight.logged_on}
            </Muted>
          )}
          <View style={styles.row}>
            <Input
              style={{ flex: 1 }}
              placeholder="Weight (kg)"
              keyboardType="numeric"
              value={newWeight}
              onChangeText={setNewWeight}
            />
            <Button title="Log" onPress={logWeight} loading={upsertWeight.isPending} />
          </View>
        </Card>

        <SectionTitle>About you</SectionTitle>
        <Card>
          <Input placeholder="Display name" value={displayName} onChangeText={setDisplayName} />
          <ChipRow>
            {(['male', 'female'] as Sex[]).map((s) => (
              <Chip
                key={s}
                label={s === 'male' ? 'Male' : 'Female'}
                active={sex === s}
                onPress={() => setSex(s)}
              />
            ))}
          </ChipRow>
          <View style={styles.row}>
            <Input
              style={{ flex: 1 }}
              placeholder="Birth year"
              keyboardType="numeric"
              value={birthYear}
              onChangeText={setBirthYear}
            />
            <Input
              style={{ flex: 1 }}
              placeholder="Height (cm)"
              keyboardType="numeric"
              value={heightCm}
              onChangeText={setHeightCm}
            />
          </View>
        </Card>

        <SectionTitle>Activity level</SectionTitle>
        <Card>
          {ACTIVITIES.map((a) => (
            <OptionRow
              key={a}
              label={ACTIVITY_LABELS[a]}
              active={activity === a}
              onPress={() => setActivity(a)}
            />
          ))}
        </Card>

        <SectionTitle>Goal</SectionTitle>
        <Card>
          <ChipRow>
            {GOALS.map((g) => (
              <Chip key={g} label={GOAL_LABELS[g]} active={goal === g} onPress={() => setGoal(g)} />
            ))}
          </ChipRow>
          <Input
            placeholder="Target weight (kg, optional)"
            keyboardType="numeric"
            value={targetWeight}
            onChangeText={setTargetWeight}
          />
          <Input
            placeholder="Water target (ml, default 2000)"
            keyboardType="numeric"
            value={waterTarget}
            onChangeText={setWaterTarget}
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
              <Muted>
                Recalculated automatically when you save your profile (Mifflin-St Jeor formula).
              </Muted>
            </Card>
          </>
        )}

        <Button
          title={updateProfile.isPending ? 'Saving…' : 'Save profile & update targets'}
          onPress={saveProfile}
          disabled={updateProfile.isPending}
        />

        <Pressable onPress={() => router.push('/(onboarding)')} style={styles.redoButton}>
          <Text style={styles.redoText}>Redo setup</Text>
        </Pressable>

        <SectionTitle>Account</SectionTitle>
        <Card>
          {showPassword ? (
            <>
              <Input
                placeholder="New password"
                secureTextEntry
                autoComplete="new-password"
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <View style={styles.row}>
                <Button
                  title={changePassword.isPending ? 'Saving…' : 'Save password'}
                  onPress={doChangePassword}
                  disabled={changePassword.isPending}
                  style={{ flex: 1 }}
                />
                <Pressable style={styles.cancelInline} onPress={() => setShowPassword(false)}>
                  <Muted>Cancel</Muted>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable onPress={() => setShowPassword(true)} style={styles.accountRow}>
              <Text>Change password</Text>
            </Pressable>
          )}
          <Pressable
            onPress={exportMyData}
            style={styles.accountRow}
            disabled={exportData.isPending}>
            <Text>{exportData.isPending ? 'Preparing…' : 'Export my data'}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/delete-account')} style={styles.accountRow}>
            <Text style={styles.deleteText}>Delete account</Text>
          </Pressable>
        </Card>

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
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  redoButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  redoText: {
    color: Brand.accent,
    fontSize: 15,
    fontWeight: '500',
  },
  accountRow: {
    paddingVertical: 10,
  },
  deleteText: {
    color: Brand.destructive,
    fontWeight: '500',
  },
  cancelInline: {
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  signOutButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 24,
  },
  signOutText: {
    color: Brand.destructive,
    fontSize: 15,
    fontWeight: '500',
  },
});
