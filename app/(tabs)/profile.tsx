import { ACTIVITY_LABELS, GOAL_LABELS, todayISO } from '@shared';
import type { ActivityLevel, CoachingProfile, GoalType, Sex } from '@shared';

type DietaryStyle = NonNullable<CoachingProfile['dietary_style']>;
type CookTimePref = NonNullable<CoachingProfile['cook_time_pref']>;
const DIETARY_STYLES: DietaryStyle[] = ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'halal', 'kosher', 'other'];
const COOK_TIME_PREFS: CookTimePref[] = ['quick', 'moderate', 'any'];
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet } from 'react-native';

import { useSession } from '@/components/SessionProvider';
import { KeyboardSafeView } from '@/components/KeyboardSafeView';
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
  const [targetsLocked, setTargetsLocked] = useState(false);
  const [calorieTarget, setCalorieTarget] = useState('');
  const [proteinTarget, setProteinTarget] = useState('');
  const [carbsTarget, setCarbsTarget] = useState('');
  const [fatTarget, setFatTarget] = useState('');
  const [newWeight, setNewWeight] = useState('');

  const { latest: latestWeight } = useLatestWeight();
  const upsertWeight = useUpsertWeight();
  const updateProfile = useUpdateProfile();
  const exportData = useExportData();
  const changePassword = useChangePassword();
  const [coachMotivation, setCoachMotivation] = useState('');
  const [coachDislikes, setCoachDislikes] = useState('');
  const [coachInjuries, setCoachInjuries] = useState('');
  const [coachTone, setCoachTone] = useState<'gentle' | 'balanced' | 'direct'>('balanced');
  const [dietaryStyle, setDietaryStyle] = useState<DietaryStyle>('omnivore');
  const [allergies, setAllergies] = useState('');
  const [dislikedFoods, setDislikedFoods] = useState('');
  const [mealsPerDay, setMealsPerDay] = useState(3);
  const [cookTimePref, setCookTimePref] = useState<CookTimePref>('any');
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
    setTargetsLocked(profile.targets_locked);
    setCalorieTarget(profile.calorie_target?.toString() ?? '');
    setProteinTarget(profile.protein_target_g?.toString() ?? '');
    setCarbsTarget(profile.carbs_target_g?.toString() ?? '');
    setFatTarget(profile.fat_target_g?.toString() ?? '');
    const coach = (profile.coaching_profile ?? {}) as CoachingProfile & {
      motivation?: string; dislikes?: string[]; injuries?: string[]; coach_tone?: 'gentle' | 'balanced' | 'direct';
    };
    setCoachMotivation(coach.motivation ?? '');
    setCoachDislikes((coach.dislikes ?? []).join(', '));
    setCoachInjuries((coach.injuries ?? []).join(', '));
    setCoachTone(coach.coach_tone ?? 'balanced');
    setDietaryStyle(coach.dietary_style ?? 'omnivore');
    setAllergies((coach.allergies ?? []).join(', '));
    setDislikedFoods((coach.disliked_foods ?? []).join(', '));
    setMealsPerDay(coach.meals_per_day ?? 3);
    setCookTimePref(coach.cook_time_pref ?? 'any');
  }, [profile]);

  const parseList = (raw: string) =>
    raw.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 10);

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
        targets_locked: targetsLocked,
        coaching_profile: {
          motivation: coachMotivation.trim() || null,
          dislikes: parseList(coachDislikes),
          injuries: parseList(coachInjuries),
          coach_tone: coachTone,
          dietary_style: dietaryStyle,
          allergies: parseList(allergies),
          disliked_foods: parseList(dislikedFoods),
          meals_per_day: mealsPerDay,
          cook_time_pref: cookTimePref,
        },
        ...(targetsLocked
          ? {
              calorie_target: parseInt(calorieTarget, 10) || null,
              protein_target_g: parseInt(proteinTarget, 10) || null,
              carbs_target_g: parseInt(carbsTarget, 10) || null,
              fat_target_g: parseInt(fatTarget, 10) || null,
            }
          : {}),
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

  const coachMemoryText = ((profile?.coach_memory ?? {}) as { text?: string }).text ?? '';

  const clearCoachMemory = () => {
    Alert.alert('Clear coach memory?', 'Your coach will forget everything it has learned from working with you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateProfile.mutateAsync({ coach_memory: null });
            await refreshProfile();
          } catch (e) {
            Alert.alert('Could not clear memory', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  const signOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  return (
    <KeyboardSafeView>
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
          <Pressable
            accessibilityLabel="Goal progress"
            style={styles.accountRow}
            onPress={() => router.push('/goal-analytics')}>
            <Text style={styles.redoText}>View progress →</Text>
          </Pressable>
          <Input
            placeholder="Water target (ml, default 2000)"
            keyboardType="numeric"
            value={waterTarget}
            onChangeText={setWaterTarget}
          />
        </Card>

        <SectionTitle>Current daily targets</SectionTitle>
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Target lock toggle"
            style={styles.lockRow}
            onPress={() => setTargetsLocked((v) => !v)}>
            <View style={styles.lockHeader}>
              <Text style={styles.lockTitle}>{targetsLocked ? 'Custom targets' : 'Auto targets'}</Text>
              <Text style={[styles.targetPill, targetsLocked ? styles.targetPillCustom : styles.targetPillAuto]}>
                {targetsLocked ? 'custom' : 'auto'}
              </Text>
            </View>
            <Muted>{targetsLocked ? 'Tap to resume auto targets.' : 'Auto · Mifflin-St Jeor'}</Muted>
          </Pressable>
          {targetsLocked ? (
            <>
              <Input placeholder="Calories" keyboardType="numeric" value={calorieTarget} onChangeText={setCalorieTarget} />
              <View style={styles.row}>
                <Input style={{ flex: 1 }} placeholder="Protein g" keyboardType="numeric" value={proteinTarget} onChangeText={setProteinTarget} />
                <Input style={{ flex: 1 }} placeholder="Carbs g" keyboardType="numeric" value={carbsTarget} onChangeText={setCarbsTarget} />
                <Input style={{ flex: 1 }} placeholder="Fat g" keyboardType="numeric" value={fatTarget} onChangeText={setFatTarget} />
              </View>
              <Muted>Auto-recompute is off while custom targets are locked.</Muted>
            </>
          ) : (
            <>
              <Input
                placeholder="Calories"
                value={`${profile?.calorie_target ?? '—'} kcal`}
                editable={false}
              />
              <View style={styles.row}>
                <Input style={{ flex: 1 }} placeholder="Protein g" value={`${profile?.protein_target_g ?? '—'} g`} editable={false} />
                <Input style={{ flex: 1 }} placeholder="Carbs g" value={`${profile?.carbs_target_g ?? '—'} g`} editable={false} />
                <Input style={{ flex: 1 }} placeholder="Fat g" value={`${profile?.fat_target_g ?? '—'} g`} editable={false} />
              </View>
              <Muted>Recalculated automatically when you save your profile.</Muted>
            </>
          )}
        </Card>

        <Button
          title={updateProfile.isPending ? 'Saving…' : 'Save profile & update targets'}
          onPress={saveProfile}
          disabled={updateProfile.isPending}
        />

        <Pressable onPress={() => router.push('/(onboarding)')} style={styles.redoButton}>
          <Text style={styles.redoText}>Redo setup</Text>
        </Pressable>

        <SectionTitle>Your coach</SectionTitle>
        <Card>
          <Muted>This is everything your coach knows about you. Edit it anytime.</Muted>
          <Input
            placeholder="What's driving you? (e.g. feel confident hiking)"
            value={coachMotivation}
            onChangeText={setCoachMotivation}
          />
          <Input
            placeholder="Dislikes, comma-separated (e.g. running, burpees)"
            value={coachDislikes}
            onChangeText={setCoachDislikes}
          />
          <Input
            placeholder="Injuries/constraints, comma-separated"
            value={coachInjuries}
            onChangeText={setCoachInjuries}
          />
          <ChipRow>
            {(['gentle', 'balanced', 'direct'] as const).map((tone) => (
              <Chip key={tone} label={tone} active={coachTone === tone} onPress={() => setCoachTone(tone)} />
            ))}
          </ChipRow>

          <Text style={styles.memoryHeading}>Nutrition preferences</Text>
          <Muted>Used every time your nutritionist plans meals.</Muted>
          <ChipRow>
            {DIETARY_STYLES.map((style) => (
              <Chip key={style} label={style} active={dietaryStyle === style} onPress={() => setDietaryStyle(style)} />
            ))}
          </ChipRow>
          <Input
            placeholder="Allergies, comma-separated (kept out of every plan)"
            value={allergies}
            onChangeText={setAllergies}
          />
          <Input
            placeholder="Foods you dislike, comma-separated"
            value={dislikedFoods}
            onChangeText={setDislikedFoods}
          />
          <Muted>Meals per day</Muted>
          <ChipRow>
            {[2, 3, 4, 5].map((n) => (
              <Chip key={n} label={`${n}`} active={mealsPerDay === n} onPress={() => setMealsPerDay(n)} />
            ))}
          </ChipRow>
          <Muted>Cooking time</Muted>
          <ChipRow>
            {COOK_TIME_PREFS.map((pref) => (
              <Chip key={pref} label={pref} active={cookTimePref === pref} onPress={() => setCookTimePref(pref)} />
            ))}
          </ChipRow>

          {coachMemoryText ? (
            <>
              <Text style={styles.memoryHeading}>What your coach remembers</Text>
              <Muted>{coachMemoryText}</Muted>
              <Pressable onPress={clearCoachMemory} hitSlop={8}>
                <Text style={styles.clearMemory}>Clear memory</Text>
              </Pressable>
            </>
          ) : (
            <Muted>Your coach builds a memory as you log and review weeks together.</Muted>
          )}
          <Muted>Saved with "Save profile" below.</Muted>
        </Card>

        <Card>
          <Text style={styles.memoryHeading}>AI conversation privacy</Text>
          <Muted>
            AI Hub conversations are processed and briefly retained by Google to provide responses. Photos are never sent to the Hub; progress-photo analysis remains a separate, opt-in flow.
          </Muted>
        </Card>

        <SectionTitle>Account</SectionTitle>
        <Card>
          <Pressable
            accessibilityLabel="Progress photos"
            onPress={() => router.push('/progress-photos')}
            style={styles.accountRow}>
            <Text>Progress photos</Text>
            <Muted>Photos stay on this device.</Muted>
          </Pressable>
          <Pressable
            accessibilityLabel="Notifications"
            onPress={() => router.push('/notifications')}
            style={styles.accountRow}>
            <Text>Notifications</Text>
            <Muted>Reminders, quiet hours, weekly review pushes.</Muted>
          </Pressable>
          <Pressable
            accessibilityLabel="Badges"
            onPress={() => router.push('/badges')}
            style={styles.accountRow}>
            <Text>Badges</Text>
            <Muted>Earned from logged actions.</Muted>
          </Pressable>
          <Pressable
            accessibilityLabel="AI photo consent"
            onPress={() => router.push('/physique-compare')}
            style={styles.accountRow}>
            <Text>AI photo consent</Text>
            <Muted>Review or revoke physique compare consent.</Muted>
          </Pressable>
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
    </KeyboardSafeView>
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
  lockRow: {
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  lockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: 'transparent',
  },
  lockTitle: {
    fontWeight: '600',
  },
  targetPill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: '700',
  },
  targetPillAuto: {
    color: Brand.accent,
    backgroundColor: 'rgba(22,163,74,.12)',
  },
  targetPillCustom: {
    color: '#fff',
    backgroundColor: Brand.accent,
  },
  deleteText: {
    color: Brand.destructive,
    fontWeight: '500',
  },
  cancelInline: {
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  memoryHeading: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  clearMemory: { color: Brand.destructive, fontSize: 13 },
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
