// Recipe editor (NWE-202). Create/edit a composite food: name → ingredient rows
// (name, quantity, per-100g macros) → live total macros + servings → save. Ingredient
// entry is manual here (the standard search flow can be wired in later); the live
// totals use the shared recipeTotals/recipePerServing math.
import { recipePerServing, recipeTotals } from '@shared';
import type { Recipe } from '@shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Card, Input, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { useCreateRecipe, useRecipes, useUpdateRecipe } from '@/lib/hooks';

interface DraftItem {
  name: string;
  quantity_g: string;
  calories_per_100g: string;
  protein_per_100g: string;
  carbs_per_100g: string;
  fat_per_100g: string;
}
const emptyItem = (): DraftItem => ({
  name: '',
  quantity_g: '',
  calories_per_100g: '',
  protein_per_100g: '',
  carbs_per_100g: '',
  fat_per_100g: '',
});

export default function RecipeEditor() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const recipesQuery = useRecipes();
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();

  const existing: Recipe | undefined = id
    ? recipesQuery.data?.find((r) => r.id === id)
    : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [servings, setServings] = useState(String(existing?.servings ?? 1));
  const [items, setItems] = useState<DraftItem[]>(
    existing?.recipe_items && existing.recipe_items.length > 0
      ? existing.recipe_items.map((it) => ({
          name: it.name,
          quantity_g: String(it.quantity_g),
          calories_per_100g: String(it.calories_per_100g),
          protein_per_100g: String(it.protein_per_100g),
          carbs_per_100g: String(it.carbs_per_100g),
          fat_per_100g: String(it.fat_per_100g),
        }))
      : [emptyItem()]
  );

  const parsedItems = items
    .filter((it) => it.name.trim() && parseFloat(it.quantity_g) > 0)
    .map((it) => ({
      name: it.name.trim(),
      quantity_g: parseFloat(it.quantity_g) || 0,
      calories_per_100g: parseFloat(it.calories_per_100g) || 0,
      protein_per_100g: parseFloat(it.protein_per_100g) || 0,
      carbs_per_100g: parseFloat(it.carbs_per_100g) || 0,
      fat_per_100g: parseFloat(it.fat_per_100g) || 0,
    }));

  const total = recipeTotals(parsedItems);
  const per = recipePerServing(parsedItems, parseFloat(servings) || 1);

  const updateItem = (i: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const save = async () => {
    if (!name.trim() || parsedItems.length === 0) {
      Alert.alert('Incomplete', 'Give the recipe a name and at least one ingredient.');
      return;
    }
    const input = { name: name.trim(), servings: parseFloat(servings) || 1, items: parsedItems };
    try {
      if (id && existing) await updateRecipe.mutateAsync({ id, input });
      else await createRecipe.mutateAsync(input);
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const saving = createRecipe.isPending || updateRecipe.isPending;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{id ? 'Edit recipe' : 'New recipe'}</Text>
        <Input placeholder="Recipe name (e.g. Breakfast shake)" value={name} onChangeText={setName} />

        <SectionTitle>Ingredients</SectionTitle>
        {items.map((it, i) => (
          <Card key={i}>
            <View style={styles.itemHeader}>
              <Input style={{ flex: 1 }} placeholder="Ingredient" value={it.name} onChangeText={(v) => updateItem(i, { name: v })} />
              {items.length > 1 && (
                <Pressable onPress={() => setItems((p) => p.filter((_, idx) => idx !== i))} hitSlop={8}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.row}>
              <Input style={{ flex: 1 }} placeholder="Qty (g)" keyboardType="numeric" value={it.quantity_g} onChangeText={(v) => updateItem(i, { quantity_g: v })} />
              <Input style={{ flex: 1 }} placeholder="kcal/100g" keyboardType="numeric" value={it.calories_per_100g} onChangeText={(v) => updateItem(i, { calories_per_100g: v })} />
            </View>
            <View style={styles.row}>
              <Input style={{ flex: 1 }} placeholder="P/100g" keyboardType="numeric" value={it.protein_per_100g} onChangeText={(v) => updateItem(i, { protein_per_100g: v })} />
              <Input style={{ flex: 1 }} placeholder="C/100g" keyboardType="numeric" value={it.carbs_per_100g} onChangeText={(v) => updateItem(i, { carbs_per_100g: v })} />
              <Input style={{ flex: 1 }} placeholder="F/100g" keyboardType="numeric" value={it.fat_per_100g} onChangeText={(v) => updateItem(i, { fat_per_100g: v })} />
            </View>
          </Card>
        ))}
        <Pressable onPress={() => setItems([...items, emptyItem()])}>
          <Text style={styles.addItem}>+ add ingredient</Text>
        </Pressable>

        <Card>
          <View style={styles.row}>
            <Text style={styles.servingsLabel}>Servings</Text>
            <Input style={{ width: 80 }} keyboardType="numeric" value={servings} onChangeText={setServings} />
          </View>
          <Muted>
            Total: {Math.round(total.calories)} kcal · P {Math.round(total.protein_g)} · C{' '}
            {Math.round(total.carbs_g)} · F {Math.round(total.fat_g)}
          </Muted>
          <Text style={styles.perServing}>
            Per serving: {Math.round(per.calories)} kcal · P {Math.round(per.protein_g)} · C{' '}
            {Math.round(per.carbs_g)} · F {Math.round(per.fat_g)}
          </Text>
        </Card>

        <Button title={saving ? 'Saving…' : 'Save recipe'} onPress={save} loading={saving} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: 'bold' },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'transparent' },
  row: { flexDirection: 'row', gap: 8, backgroundColor: 'transparent' },
  remove: { color: Brand.destructive, fontSize: 13 },
  addItem: { color: Brand.accent, fontSize: 14 },
  servingsLabel: { fontSize: 15, fontWeight: '500', flex: 1 },
  perServing: { fontWeight: '600' },
});
