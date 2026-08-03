import { computeTargets, todayISO } from '@shared';
import type { ActivityLevel, CoachingProfile, GoalType, Sex } from '@shared';

type DietaryStyle = NonNullable<CoachingProfile['dietary_style']>;
const DIETARY_STYLES: DietaryStyle[] = ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'halal', 'kosher', 'other'];
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';

import { useSession } from '@/components/SessionProvider';
import { Text, View } from '@/components/Themed';
import { Button, Card, Chip, ChipRow, Input, Muted, OptionRow } from '@/components/ui';
import { ACTIVITY_LABELS, GOAL_LABELS } from '@shared';
import { Brand } from '@/constants/Colors';
import { useUpdateProfile, useUpsertWeight } from '@/lib/hooks';
import { markOnboardingCompletedLocally } from '@/lib/onboardingState';

const ACTIVITIES = Object.keys(ACTIVITY_LABELS) as ActivityLevel[];
const GOALS = Object.keys(GOAL_LABELS) as GoalType[];
const STEPS = ['welcome', 'body', 'activity', 'goal', 'coach', 'weight', 'done'] as const;

export default function OnboardingWizard() {
  const router = useRouter();
  const { refreshProfile } = useSession();
  const updateProfile = useUpdateProfile();
  const upsertWeight = useUpsertWeight();

  const [step, setStep] = useState(0);
  const [sex, setSex] = useState<Sex | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<GoalType>('maintain');
  const [coachMotivation, setCoachMotivation] = useState('');
  const [coachDislikes, setCoachDislikes] = useState('');
  const [coachTone, setCoachTone] = useState<'gentle' | 'balanced' | 'direct'>('balanced');
  const [dietaryStyle, setDietaryStyle] = useState<DietaryStyle>('omnivore');
  const [allergies, setAllergies] = useState('');
  const [mealsPerDay, setMealsPerDay] = useState(3);
  const [targetWeight, setTargetWeight] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  // Leave onboarding for good: stamp completion (so it never re-shows) and persist
  // whatever the user did fill in. Navigate regardless — a failed write must never
  // trap the user in the wizard.
  const finish = async () => {
    await markOnboardingCompletedLocally();
    try {
      await updateProfile.mutateAsync({
        onboarding_completed_at: new Date().toISOString(),
        ...(sex ? { sex } : {}),
        ...(parseInt(birthYear, 10) ? { birth_year: parseInt(birthYear, 10) } : {}),
        ...(parseFloat(heightCm) ? { height_cm: parseFloat(heightCm) } : {}),
      });
      await refreshProfile();
    } catch {
      // Non-fatal — the guard also completes onboarding once stats exist server-side.
    }
    router.replace('/(tabs)' as Href);
  };

  // Save profile + first weight, compute targets, then advance to the preview.
  const saveAndPreview = async () => {
    setSaving(true);
    try {
      const kg = parseFloat(weight);
      if (kg && kg > 0) await upsertWeight.mutateAsync({ date: todayISO(), weight_kg: kg });
      await updateProfile.mutateAsync({
        onboarding_completed_at: new Date().toISOString(),
        sex,
        birth_year: parseInt(birthYear, 10) || null,
        height_cm: parseFloat(heightCm) || null,
        activity_level: activity,
        goal_type: goal,
        target_weight_kg: parseFloat(targetWeight) || null,
        coaching_profile: {
          motivation: coachMotivation.trim() || null,
          dislikes: coachDislikes.split(',').map((d) => d.trim()).filter(Boolean).slice(0, 10),
          coach_tone: coachTone,
          dietary_style: dietaryStyle,
          allergies: allergies.split(',').map((a) => a.trim()).filter(Boolean).slice(0, 15),
          meals_per_day: mealsPerDay,
        },
      });
      await markOnboardingCompletedLocally();
      await refreshProfile();
      setStep(STEPS.indexOf('done'));
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const previewTargets =
    sex && birthYear && heightCm && weight
      ? computeTargets(
          {
            sex,
            birth_year: parseInt(birthYear, 10),
            height_cm: parseFloat(heightCm),
            activity_level: activity,
            goal_type: goal,
          },
          parseFloat(weight)
        )
      : null;

  const current = STEPS[step];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === step && styles.dotActive]}
                lightColor="rgba(0,0,0,0.15)"
                darkColor="rgba(255,255,255,0.2)"
              />
            ))}
          </View>
          {current !== 'done' && (
            <Pressable onPress={finish} hitSlop={8}>
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          {current === 'welcome' && (
            <>
              <Text style={styles.emoji}>🥗💪</Text>
              <Text style={styles.title}>Welcome to NutriWorkoutExpert</Text>
              <Muted style={styles.lead}>
                Track food, workouts and weight — and get a clear daily picture. Takes a minute.
              </Muted>
              <Card>
                <Text style={styles.privacy}>🔒 Your photos are never stored.</Text>
                <Muted>Meal and progress photos stay on your device.</Muted>
              </Card>
            </>
          )}

          {current === 'body' && (
            <>
              <Text style={styles.title}>About you</Text>
              <Muted style={styles.lead}>We use this to estimate your daily calories.</Muted>
              <ChipRow>
                {(['male', 'female'] as Sex[]).map((s) => (
                  <Chip key={s} label={s === 'male' ? 'Male' : 'Female'} active={sex === s} onPress={() => setSex(s)} />
                ))}
              </ChipRow>
              <Input placeholder="Birth year (e.g. 1994)" keyboardType="numeric" value={birthYear} onChangeText={setBirthYear} />
              <Input placeholder="Height (cm)" keyboardType="numeric" value={heightCm} onChangeText={setHeightCm} />
            </>
          )}

          {current === 'activity' && (
            <>
              <Text style={styles.title}>How active are you?</Text>
              <Card>
                {ACTIVITIES.map((a) => (
                  <OptionRow key={a} label={ACTIVITY_LABELS[a]} active={activity === a} onPress={() => setActivity(a)} />
                ))}
              </Card>
            </>
          )}

          {current === 'goal' && (
            <>
              <Text style={styles.title}>What's your goal?</Text>
              <ChipRow>
                {GOALS.map((g) => (
                  <Chip key={g} label={GOAL_LABELS[g]} active={goal === g} onPress={() => setGoal(g)} />
                ))}
              </ChipRow>
              <Input placeholder="Target weight (kg, optional)" keyboardType="numeric" value={targetWeight} onChangeText={setTargetWeight} />
            </>
          )}

          {current === 'coach' && (
            <>
              <Text style={styles.title}>Tell your coach</Text>
              <Muted style={styles.lead}>
                Optional — this shapes every plan and review your coaches write for you.
              </Muted>
              <Input
                placeholder="What's driving you? (e.g. more energy for my kids)"
                value={coachMotivation}
                onChangeText={setCoachMotivation}
              />
              <Input
                placeholder="Anything you dislike? (e.g. running, burpees)"
                value={coachDislikes}
                onChangeText={setCoachDislikes}
              />
              <ChipRow>
                {(['gentle', 'balanced', 'direct'] as const).map((tone) => (
                  <Chip key={tone} label={tone} active={coachTone === tone} onPress={() => setCoachTone(tone)} />
                ))}
              </ChipRow>
              <Muted style={styles.lead}>How you eat (your nutritionist plans around this):</Muted>
              <ChipRow>
                {DIETARY_STYLES.map((style) => (
                  <Chip key={style} label={style} active={dietaryStyle === style} onPress={() => setDietaryStyle(style)} />
                ))}
              </ChipRow>
              <Input
                placeholder="Allergies, comma-separated (never put in a plan)"
                value={allergies}
                onChangeText={setAllergies}
              />
              <Muted>Meals per day</Muted>
              <ChipRow>
                {[2, 3, 4, 5].map((n) => (
                  <Chip key={n} label={`${n}`} active={mealsPerDay === n} onPress={() => setMealsPerDay(n)} />
                ))}
              </ChipRow>
            </>
          )}

          {current === 'weight' && (
            <>
              <Text style={styles.title}>Your current weight</Text>
              <Muted style={styles.lead}>We'll track your trend from here.</Muted>
              <Input placeholder="Weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} />
            </>
          )}

          {current === 'done' && (
            <>
              <Text style={styles.title}>Here's your daily picture</Text>
              {previewTargets ? (
                <Card>
                  <Text style={styles.bigTarget}>{previewTargets.calories} kcal / day</Text>
                  <View style={styles.macroPreview}>
                    <MacroDot color={Brand.protein} label={`P ${previewTargets.proteinG} g`} />
                    <MacroDot color={Brand.carbs} label={`C ${previewTargets.carbsG} g`} />
                    <MacroDot color={Brand.fat} label={`F ${previewTargets.fatG} g`} />
                  </View>
                  <Muted>You can fine-tune these anytime in Profile.</Muted>
                </Card>
              ) : (
                <Muted>Add your details to see your targets — or set them later in Profile.</Muted>
              )}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {current === 'welcome' && <Button title="Get started" onPress={() => setStep(step + 1)} />}
          {(current === 'body' || current === 'activity' || current === 'goal' || current === 'coach') && (
            <Button title="Continue" onPress={() => setStep(step + 1)} />
          )}
          {current === 'weight' && (
            <Button title="See my targets" onPress={saveAndPreview} loading={saving} />
          )}
          {current === 'done' && <Button title="Start tracking" onPress={finish} />}
        </View>
      </View>
    </View>
  );
}

function MacroDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.macroDotRow}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  dots: { flexDirection: 'row', gap: 8, backgroundColor: 'transparent' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: Brand.accent, width: 20 },
  skip: { color: Brand.accent, fontSize: 15, fontWeight: '600' },
  page: { gap: 14, paddingVertical: 24, flexGrow: 1 },
  emoji: { fontSize: 56, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: 'bold' },
  lead: { fontSize: 15 },
  privacy: { fontSize: 15, fontWeight: '600' },
  footer: { paddingBottom: 32, paddingTop: 8, backgroundColor: 'transparent' },
  bigTarget: { fontSize: 28, fontWeight: 'bold' },
  macroPreview: { flexDirection: 'row', gap: 16, marginVertical: 8, backgroundColor: 'transparent' },
  macroDotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'transparent' },
  macroDot: { width: 12, height: 12, borderRadius: 6 },
});
