// AI meal planner (NWE-121) — the nutritionist. Pick a day → generate a plan →
// refine it in chat → "Review changes" bottom sheet approves a revision → save a
// recipe or log "I had this" straight to the food log.
import { mealPlanTotals } from '@shared';
import type { MealPlan, MealType } from '@shared';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';

import { useSession } from '@/components/SessionProvider';
import { Text, View } from '@/components/Themed';
import { Button, Card, Chip, ChipRow, Input, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import {
  useCreateRecipe,
  useGenerateMealPlan,
  useLogPlannedMeal,
  useRefineMealPlan,
} from '@/lib/hooks';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isoForWeekday(weekdayMon0: number): string {
  const now = new Date();
  const todayMon0 = (now.getUTCDay() + 6) % 7;
  const diff = weekdayMon0 - todayMon0;
  const d = new Date();
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface ChatTurn {
  role: 'user' | 'coach';
  text: string;
}

export default function MealPlanScreen() {
  const { profile } = useSession();
  const [dayIndex, setDayIndex] = useState((new Date().getUTCDay() + 6) % 7);
  const date = isoForWeekday(dayIndex);

  const generate = useGenerateMealPlan();
  const refine = useRefineMealPlan();
  const createRecipe = useCreateRecipe();
  const logMeal = useLogPlannedMeal(date);

  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [insightId, setInsightId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [pendingRevision, setPendingRevision] = useState<MealPlan | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const targets = {
    calories: profile?.calorie_target ?? null,
    protein_g: profile?.protein_target_g ?? null,
    carbs_g: profile?.carbs_target_g ?? null,
    fat_g: profile?.fat_target_g ?? null,
  };
  const totals = useMemo(() => (plan ? mealPlanTotals(plan.meals) : null), [plan]);

  const generatePlan = async () => {
    setPlan(null);
    setTurns([]);
    setPendingRevision(null);
    try {
      const res = await generate.mutateAsync({ date });
      setPlan(res.plan);
      setInsightId(res.insight_id);
    } catch (e) {
      Alert.alert('Could not plan meals', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const send = async () => {
    const message = chatInput.trim();
    if (!message || !insightId || refine.isPending) return;
    setChatInput('');
    setTurns((prev) => [...prev, { role: 'user', text: message }]);
    try {
      const res = await refine.mutateAsync({ insight_id: insightId, message });
      setTurns((prev) => [...prev, { role: 'coach', text: res.reply }]);
      if (res.updated_plan) setPendingRevision(res.updated_plan);
    } catch (e) {
      setTurns((prev) => [...prev, { role: 'coach', text: e instanceof Error ? e.message : 'Try again in a moment.' }]);
    }
  };

  const approveRevision = () => {
    if (pendingRevision) setPlan(pendingRevision);
    setPendingRevision(null);
    setSheetOpen(false);
  };

  const saveRecipe = async (mealIndex: number) => {
    if (!plan) return;
    const meal = plan.meals[mealIndex];
    try {
      await createRecipe.mutateAsync({
        name: meal.name,
        servings: 1,
        items: (meal.recipe?.ingredients ?? []).map((ing) => ({
          name: ing,
          quantity_g: 100,
          calories_per_100g: 0,
          protein_per_100g: 0,
          carbs_per_100g: 0,
          fat_per_100g: 0,
        })),
      });
      Alert.alert('Recipe saved', `"${meal.name}" is in your recipes.`);
    } catch (e) {
      Alert.alert('Could not save recipe', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const hadThis = async (mealIndex: number) => {
    if (!insightId) return;
    try {
      await logMeal.mutateAsync({ insight_id: insightId, meal_index: mealIndex, logged_on: date });
      Alert.alert('Logged', `Added ${plan?.meals[mealIndex].name} to your food log.`);
    } catch (e) {
      Alert.alert('Could not log', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Plan my meals</Text>
      <Muted>Pick a day and your nutritionist plans it around your goals and training.</Muted>

      <ChipRow>
        {DAYS.map((d, i) => (
          <Chip key={d} label={d} active={dayIndex === i} onPress={() => setDayIndex(i)} />
        ))}
      </ChipRow>

      <Button
        title={generate.isPending ? 'Planning…' : `Plan meals for ${DAYS[dayIndex]}`}
        onPress={generatePlan}
        loading={generate.isPending}
      />

      {plan && (
        <>
          <SectionTitle>{plan.title}</SectionTitle>
          {totals && (
            <Card>
              <Text style={styles.totalsLine}>
                Day total: {Math.round(totals.calories)} kcal · P {Math.round(totals.protein_g)} · C{' '}
                {Math.round(totals.carbs_g)} · F {Math.round(totals.fat_g)}
              </Text>
              {targets.calories != null && (
                <Muted>
                  Target: {targets.calories} kcal · P {targets.protein_g} · C {targets.carbs_g} · F {targets.fat_g}
                </Muted>
              )}
            </Card>
          )}

          {plan.meals.map((meal, i) => (
            <Card key={`${meal.name}-${i}`}>
              <Pressable onPress={() => setExpanded(expanded === i ? null : i)}>
                <Text style={styles.mealName}>
                  {meal.name} <Muted>· {meal.meal_type}</Muted>
                </Text>
                <Muted>
                  {Math.round(meal.macros.calories)} kcal · P {Math.round(meal.macros.protein_g)} · C{' '}
                  {Math.round(meal.macros.carbs_g)} · F {Math.round(meal.macros.fat_g)}
                </Muted>
              </Pressable>
              {expanded === i && (
                <View style={styles.recipe}>
                  {(meal.recipe?.ingredients ?? []).length > 0 && (
                    <>
                      <Text style={styles.recipeHeading}>Ingredients</Text>
                      {meal.recipe!.ingredients.map((ing, j) => (
                        <Text key={j} style={styles.recipeLine}>• {ing}</Text>
                      ))}
                    </>
                  )}
                  {(meal.recipe?.steps ?? []).length > 0 && (
                    <>
                      <Text style={styles.recipeHeading}>Steps</Text>
                      {meal.recipe!.steps.map((step, j) => (
                        <Text key={j} style={styles.recipeLine}>{j + 1}. {step}</Text>
                      ))}
                    </>
                  )}
                </View>
              )}
              <View style={styles.mealActions}>
                <Button title="I had this" onPress={() => hadThis(i)} loading={logMeal.isPending} style={{ flex: 1 }} />
                <Pressable style={styles.saveRecipe} onPress={() => saveRecipe(i)}>
                  <Text style={styles.saveRecipeText}>Save recipe</Text>
                </Pressable>
              </View>
            </Card>
          ))}

          {/* Refinement chat */}
          <SectionTitle>Ask the nutritionist</SectionTitle>
          {turns.map((t, i) => (
            <View
              key={i}
              style={[styles.bubble, t.role === 'user' ? styles.userBubble : styles.coachBubble]}
              lightColor={t.role === 'user' ? 'rgba(22,163,74,0.12)' : 'rgba(0,0,0,0.05)'}
              darkColor={t.role === 'user' ? 'rgba(22,163,74,0.25)' : 'rgba(255,255,255,0.08)'}>
              <Text style={styles.bubbleText}>{t.text}</Text>
            </View>
          ))}
          {refine.isPending && <ActivityIndicator style={{ alignSelf: 'flex-start' }} />}

          {pendingRevision && (
            <Button title="Review changes" onPress={() => setSheetOpen(true)} />
          )}

          <View style={styles.chatRow}>
            <Input
              style={{ flex: 1 }}
              placeholder="e.g. no dairy, and make lunch higher protein"
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <Button title="Send" onPress={send} disabled={refine.isPending || !chatInput.trim()} />
          </View>
        </>
      )}

      {/* Review-changes bottom sheet */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetInner}>
              <Text style={styles.title}>Proposed plan</Text>
              <Muted>Review the nutritionist's revision, then approve or keep chatting.</Muted>
              <ScrollView style={{ maxHeight: 340 }}>
                {pendingRevision?.meals.map((m, i) => (
                  <View key={i} style={styles.revMeal}>
                    <Text style={styles.mealName}>{m.name} <Muted>· {m.meal_type}</Muted></Text>
                    <Muted>
                      {Math.round(m.macros.calories)} kcal · P {Math.round(m.macros.protein_g)} · C{' '}
                      {Math.round(m.macros.carbs_g)} · F {Math.round(m.macros.fat_g)}
                    </Muted>
                  </View>
                ))}
              </ScrollView>
              <Button title="Approve changes" onPress={approveRevision} />
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={8}>
                <Text style={styles.keepChatting}>Close and keep chatting</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: 'bold' },
  totalsLine: { fontSize: 15, fontWeight: '600' },
  mealName: { fontSize: 16, fontWeight: '600' },
  recipe: { gap: 3, marginTop: 6, backgroundColor: 'transparent' },
  recipeHeading: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  recipeLine: { fontSize: 14 },
  mealActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, backgroundColor: 'transparent' },
  saveRecipe: { paddingHorizontal: 8, justifyContent: 'center' },
  saveRecipeText: { color: Brand.accent, fontWeight: '600' },
  bubble: { borderRadius: 12, padding: 10, maxWidth: '88%' },
  userBubble: { alignSelf: 'flex-end' },
  coachBubble: { alignSelf: 'flex-start' },
  bubbleText: { fontSize: 14 },
  chatRow: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'transparent' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  sheetInner: { padding: 20, gap: 10, backgroundColor: '#1c1c1e', paddingBottom: 36 },
  revMeal: { paddingVertical: 6, backgroundColor: 'transparent' },
  keepChatting: { color: Brand.accent, textAlign: 'center', fontSize: 14 },
});
