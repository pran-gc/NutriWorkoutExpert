// Edit-entry panel (NWE-205). Tapping a food-log row opens this in place of the
// add panel. Manual entries expose name + macro fields; searched/AI entries expose
// quantity + meal only, with macros rescaled live as the quantity changes (using
// the same shared math the server applies on save).
import type { FoodLog, MealType } from '@shared';
import { rescaleMacros } from '@shared';
import { useState } from 'react';
import { Alert, StyleSheet, View as RNView } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Card, Chip, ChipRow, Input, Muted } from '@/components/ui';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export function EditEntryPanel({
  entry,
  onSave,
  onDelete,
  onCancel,
  saving,
}: {
  entry: FoodLog;
  onSave: (patch: {
    food_name?: string;
    meal_type?: MealType;
    quantity_g?: number;
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  }) => void;
  onDelete: () => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const isManual = entry.source === 'manual';
  const [meal, setMeal] = useState<MealType>(entry.meal_type);
  const [quantity, setQuantity] = useState(String(entry.quantity_g));
  const [name, setName] = useState(entry.food_name);
  const [calories, setCalories] = useState(String(entry.calories));
  const [protein, setProtein] = useState(String(entry.protein_g));
  const [carbs, setCarbs] = useState(String(entry.carbs_g));
  const [fat, setFat] = useState(String(entry.fat_g));

  // Live rescale preview for searched/AI entries.
  const previewQty = parseFloat(quantity) || 0;
  const preview = rescaleMacros(
    {
      calories: entry.calories,
      protein_g: entry.protein_g,
      carbs_g: entry.carbs_g,
      fat_g: entry.fat_g,
    },
    entry.quantity_g,
    previewQty
  );

  const save = () => {
    if (isManual) {
      if (!name.trim() || !calories) {
        Alert.alert('Missing info', 'A name and calories are required.');
        return;
      }
      onSave({
        food_name: name.trim(),
        meal_type: meal,
        quantity_g: parseFloat(quantity) || entry.quantity_g,
        calories: parseFloat(calories) || 0,
        protein_g: parseFloat(protein) || 0,
        carbs_g: parseFloat(carbs) || 0,
        fat_g: parseFloat(fat) || 0,
      });
    } else {
      const grams = parseFloat(quantity);
      if (!grams || grams <= 0) {
        Alert.alert('Invalid quantity', 'Enter the amount in grams.');
        return;
      }
      onSave({ meal_type: meal, quantity_g: grams });
    }
  };

  return (
    <Card>
      <Text style={styles.title}>Edit entry</Text>

      {isManual ? (
        <>
          <Input placeholder="Food name" value={name} onChangeText={setName} />
          <RNView style={styles.row}>
            <Input style={{ flex: 1 }} placeholder="kcal" keyboardType="numeric" value={calories} onChangeText={setCalories} />
            <Input style={{ flex: 1 }} placeholder="Protein g" keyboardType="numeric" value={protein} onChangeText={setProtein} />
          </RNView>
          <RNView style={styles.row}>
            <Input style={{ flex: 1 }} placeholder="Carbs g" keyboardType="numeric" value={carbs} onChangeText={setCarbs} />
            <Input style={{ flex: 1 }} placeholder="Fat g" keyboardType="numeric" value={fat} onChangeText={setFat} />
          </RNView>
        </>
      ) : (
        <>
          <Text style={styles.name}>{entry.food_name}</Text>
          <Input placeholder="Amount (g)" keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
          <Muted>
            {Math.round(preview.calories)} kcal · P {Math.round(preview.protein_g)} · C{' '}
            {Math.round(preview.carbs_g)} · F {Math.round(preview.fat_g)}
          </Muted>
        </>
      )}

      <ChipRow>
        {MEALS.map((m) => (
          <Chip key={m} label={MEAL_LABELS[m]} active={meal === m} onPress={() => setMeal(m)} />
        ))}
      </ChipRow>

      <View style={styles.actions}>
        <Button title="Save" onPress={save} loading={saving} style={{ flex: 1 }} />
        <Button title="Delete" variant="destructive" onPress={onDelete} style={{ flex: 1 }} />
      </View>
      <Button title="Cancel" onPress={onCancel} style={styles.cancel} />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '600' },
  name: { fontSize: 15, fontWeight: '500' },
  row: { flexDirection: 'row', gap: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  cancel: { backgroundColor: '#6b7280' },
});
