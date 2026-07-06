import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { searchFoods } from '@/lib/food-api';
import { todayISO } from '@/lib/nutrition';
import { supabase } from '@/lib/supabase';
import type { FoodLog, FoodSearchResult, MealType } from '@/lib/types';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export default function FoodScreen() {
  const { session } = useSession();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [quantity, setQuantity] = useState('100');
  const [mealType, setMealType] = useState<MealType>('snack');
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [showManual, setShowManual] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadLogs = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('logged_on', todayISO())
      .order('created_at');
    setLogs((data ?? []) as FoodLog[]);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadLogs();
    }, [loadLogs])
  );

  // Debounced search
  useEffect(() => {
    abortRef.current?.abort();
    if (query.trim().length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchFoods(query.trim(), controller.signal);
        if (!controller.signal.aborted) setResults(found);
      } catch (e) {
        if (!(e instanceof Error && e.name === 'AbortError')) {
          console.warn('Food search error', e);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const addSelected = async () => {
    if (!session || !selected) return;
    const grams = parseFloat(quantity);
    if (!grams || grams <= 0) {
      Alert.alert('Invalid quantity', 'Please enter the amount in grams.');
      return;
    }
    const factor = grams / 100;
    const { error } = await supabase.from('food_logs').insert({
      user_id: session.user.id,
      food_name: selected.name,
      brand: selected.brand,
      meal_type: mealType,
      quantity_g: grams,
      calories: Math.round(selected.caloriesPer100g * factor * 10) / 10,
      protein_g: Math.round(selected.proteinPer100g * factor * 10) / 10,
      carbs_g: Math.round(selected.carbsPer100g * factor * 10) / 10,
      fat_g: Math.round(selected.fatPer100g * factor * 10) / 10,
      source: 'openfoodfacts',
      source_id: selected.id,
      logged_on: todayISO(),
    });
    if (error) {
      Alert.alert('Could not log food', error.message);
      return;
    }
    setSelected(null);
    setQuery('');
    setResults([]);
    await loadLogs();
  };

  const deleteLog = (log: FoodLog) => {
    Alert.alert('Delete entry', `Remove "${log.food_name}" from today's log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('food_logs').delete().eq('id', log.id);
          await loadLogs();
        },
      },
    ]);
  };

  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein: acc.protein + l.protein_g,
      carbs: acc.carbs + l.carbs_g,
      fat: acc.fat + l.fat_g,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.input}
          placeholder="Search foods (e.g. greek yogurt)…"
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />

        {searching && <ActivityIndicator style={{ marginVertical: 8 }} />}

        {results.length > 0 && !selected && (
          <Card>
            {results.slice(0, 10).map((r) => (
              <Pressable
                key={r.id}
                style={styles.resultRow}
                onPress={() => {
                  setSelected(r);
                  setQuantity('100');
                }}>
                <Text style={styles.resultName} numberOfLines={1}>
                  {r.name}
                  {r.brand ? <Text style={styles.muted}> · {r.brand}</Text> : null}
                </Text>
                <Text style={styles.muted}>
                  {Math.round(r.caloriesPer100g)} kcal · P {Math.round(r.proteinPer100g)} · C{' '}
                  {Math.round(r.carbsPer100g)} · F {Math.round(r.fatPer100g)} (per 100 g)
                </Text>
              </Pressable>
            ))}
          </Card>
        )}

        {selected && (
          <Card>
            <Text style={styles.resultName}>{selected.name}</Text>
            <Text style={styles.muted}>
              {Math.round(selected.caloriesPer100g)} kcal per 100 g
            </Text>
            <View style={styles.mealRow}>
              {MEALS.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.mealChip, mealType === m && styles.mealChipActive]}
                  onPress={() => setMealType(m)}>
                  <Text style={mealType === m ? styles.mealChipTextActive : styles.mealChipText}>
                    {MEAL_LABELS[m]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.quantityRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="Amount (g)"
                placeholderTextColor="#999"
              />
              <Pressable style={styles.addButton} onPress={addSelected}>
                <Text style={styles.addButtonText}>Add</Text>
              </Pressable>
              <Pressable style={styles.cancelButton} onPress={() => setSelected(null)}>
                <Text style={styles.muted}>Cancel</Text>
              </Pressable>
            </View>
          </Card>
        )}

        <Pressable onPress={() => setShowManual(!showManual)}>
          <Text style={styles.manualToggle}>
            {showManual ? '− Hide manual entry' : "+ Can't find it? Add manually"}
          </Text>
        </Pressable>
        {showManual && <ManualEntryForm onAdded={loadLogs} defaultMeal={mealType} />}

        <SectionTitle>
          Today · {Math.round(totals.calories)} kcal · P {Math.round(totals.protein)} · C{' '}
          {Math.round(totals.carbs)} · F {Math.round(totals.fat)}
        </SectionTitle>

        {MEALS.map((meal) => {
          const mealLogs = logs.filter((l) => l.meal_type === meal);
          if (mealLogs.length === 0) return null;
          return (
            <View key={meal} style={{ gap: 6 }}>
              <Text style={styles.mealHeading}>{MEAL_LABELS[meal]}</Text>
              <Card>
                {mealLogs.map((l) => (
                  <Pressable key={l.id} onLongPress={() => deleteLog(l)} style={styles.logRow}>
                    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                      <Text numberOfLines={1}>{l.food_name}</Text>
                      <Text style={styles.muted}>
                        {l.quantity_g} g · P {Math.round(l.protein_g)} · C {Math.round(l.carbs_g)}{' '}
                        · F {Math.round(l.fat_g)}
                      </Text>
                    </View>
                    <Text style={styles.logCalories}>{Math.round(l.calories)} kcal</Text>
                  </Pressable>
                ))}
              </Card>
            </View>
          );
        })}

        {logs.length === 0 && (
          <Text style={[styles.muted, { textAlign: 'center', marginTop: 16 }]}>
            Nothing logged today. Search above or add manually. Long-press an entry to delete it.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ManualEntryForm({
  onAdded,
  defaultMeal,
}: {
  onAdded: () => Promise<void>;
  defaultMeal: MealType;
}) {
  const { session } = useSession();
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [meal, setMeal] = useState<MealType>(defaultMeal);

  const add = async () => {
    if (!session) return;
    if (!name.trim() || !calories) {
      Alert.alert('Missing info', 'A name and calories are required.');
      return;
    }
    const { error } = await supabase.from('food_logs').insert({
      user_id: session.user.id,
      food_name: name.trim(),
      meal_type: meal,
      quantity_g: 100,
      calories: parseFloat(calories) || 0,
      protein_g: parseFloat(protein) || 0,
      carbs_g: parseFloat(carbs) || 0,
      fat_g: parseFloat(fat) || 0,
      source: 'manual',
      logged_on: todayISO(),
    });
    if (error) {
      Alert.alert('Could not log food', error.message);
      return;
    }
    setName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    await onAdded();
  };

  return (
    <Card>
      <TextInput
        style={styles.input}
        placeholder="Food name"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
      />
      <View style={styles.quantityRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="kcal"
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={calories}
          onChangeText={setCalories}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Protein g"
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={protein}
          onChangeText={setProtein}
        />
      </View>
      <View style={styles.quantityRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Carbs g"
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={carbs}
          onChangeText={setCarbs}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Fat g"
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={fat}
          onChangeText={setFat}
        />
      </View>
      <View style={styles.mealRow}>
        {MEALS.map((m) => (
          <Pressable
            key={m}
            style={[styles.mealChip, meal === m && styles.mealChipActive]}
            onPress={() => setMeal(m)}>
            <Text style={meal === m ? styles.mealChipTextActive : styles.mealChipText}>
              {MEAL_LABELS[m]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.addButton} onPress={add}>
        <Text style={styles.addButtonText}>Log food</Text>
      </Pressable>
    </Card>
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
  resultRow: {
    paddingVertical: 6,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '500',
  },
  muted: {
    fontSize: 13,
    opacity: 0.6,
  },
  mealRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: 'transparent',
  },
  mealChip: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mealChipActive: {
    backgroundColor: '#16a34a',
  },
  mealChipText: {
    fontSize: 13,
    color: '#16a34a',
  },
  mealChipTextActive: {
    fontSize: 13,
    color: '#fff',
  },
  quantityRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  addButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: 8,
  },
  manualToggle: {
    color: '#16a34a',
    fontSize: 14,
  },
  mealHeading: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  logCalories: {
    fontSize: 14,
    fontWeight: '600',
  },
});
