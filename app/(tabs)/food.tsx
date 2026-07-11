import { todayISO } from '@shared';
import type { FoodLog, FoodSearchResult, MealType } from '@shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { DateBar } from '@/components/food/DateBar';
import { EditEntryPanel } from '@/components/food/EditEntryPanel';
import { FavoritesRecents, type PickedFood } from '@/components/food/FavoritesRecents';
import { PhotoThumbnail } from '@/components/food/PhotoThumbnail';
import { RecipesSection } from '@/components/food/RecipesSection';
import { useRouter } from 'expo-router';
import { capturePhoto, deletePhoto, pickPhoto } from '@/lib/photos';
import { Text, View } from '@/components/Themed';
import { Button, Card, Chip, ChipRow, EmptyState, Input, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import type { FavoriteFood, RecentFood } from '@shared';
import {
  useAddFavorite,
  useCreateFoodLog,
  useDeleteFoodLog,
  useFavorites,
  useFoodLogs,
  useFoodSearch,
  useLogRecipe,
  useRecentFoods,
  useRecipes,
  useRemoveFavorite,
  useUpdateFoodLog,
} from '@/lib/hooks';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export default function FoodScreen() {
  const router = useRouter();
  // Selected day (NWE-206). Defaults to today; DateBar changes it. Survives within-
  // session tab switches, but resets to today when the tab is left and re-entered.
  const [date, setDate] = useState(todayISO());
  useFocusEffect(
    useCallback(() => {
      // On blur, arrange to reset to today for the next visit.
      return () => setDate(todayISO());
    }, [])
  );
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [quantity, setQuantity] = useState('100');
  const [mealType, setMealType] = useState<MealType>('snack');
  const [showManual, setShowManual] = useState(false);
  const [editing, setEditing] = useState<FoodLog | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  const logsQuery = useFoodLogs(date);
  const searchQuery = useFoodSearch(query.trim());
  const createLog = useCreateFoodLog();
  const updateLog = useUpdateFoodLog(date);
  const deleteLog = useDeleteFoodLog(date);
  const favoritesQuery = useFavorites();
  const recentsQuery = useRecentFoods();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();
  const recipesQuery = useRecipes();
  const logRecipe = useLogRecipe(date);

  const logRecipeById = async (recipeId: string, servings: number, meal: MealType) => {
    try {
      await logRecipe.mutateAsync({ id: recipeId, input: { meal_type: meal, servings, logged_on: date } });
    } catch (e) {
      Alert.alert('Could not log recipe', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const logs = logsQuery.data ?? [];
  const results = searchQuery.data ?? [];
  const showBrowse = query.trim().length === 0 && !selected && !editing;

  // Pre-fill the add panel from a favorite/recent (NWE-201).
  const pickFood = (food: PickedFood) => {
    setSelected({
      id: food.source_id ?? food.name,
      name: food.name,
      brand: food.brand,
      caloriesPer100g: food.caloriesPer100g,
      proteinPer100g: food.proteinPer100g,
      carbsPer100g: food.carbsPer100g,
      fatPer100g: food.fatPer100g,
    });
    setQuantity(String(food.quantity_g));
    if (food.meal_type) setMealType(food.meal_type);
  };

  const toggleFavorite = (item: FavoriteFood | RecentFood, existing?: FavoriteFood) => {
    if (existing) {
      removeFavorite.mutate(existing.id);
      return;
    }
    // Star a recent → create a favorite with per-100g macros.
    const r = item as RecentFood;
    const q = r.quantity_g || 100;
    addFavorite.mutate({
      name: r.food_name,
      brand: r.brand,
      calories_per_100g: (r.calories * 100) / q,
      protein_per_100g: (r.protein_g * 100) / q,
      carbs_per_100g: (r.carbs_g * 100) / q,
      fat_per_100g: (r.fat_g * 100) / q,
      source: r.source === 'openfoodfacts' ? 'openfoodfacts' : 'manual',
      source_id: r.source_id,
      last_quantity_g: q,
    });
  };

  const addSelected = async () => {
    if (!selected) return;
    const grams = parseFloat(quantity);
    if (!grams || grams <= 0) {
      Alert.alert('Invalid quantity', 'Please enter the amount in grams.');
      return;
    }
    const factor = grams / 100;
    try {
      await createLog.mutateAsync({
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
        photo_path: photoPath,
        logged_on: date,
      });
      setPhotoPath(null);
      // If this food is a favorite, remember the quantity just used (NWE-201 AC#4).
      const fav = (favoritesQuery.data ?? []).find(
        (f) =>
          f.name.toLowerCase() === selected.name.toLowerCase() &&
          (f.brand ?? '').toLowerCase() === (selected.brand ?? '').toLowerCase()
      );
      if (fav && fav.last_quantity_g !== grams) {
        addFavorite.mutate({
          name: fav.name,
          brand: fav.brand,
          calories_per_100g: fav.calories_per_100g,
          protein_per_100g: fav.protein_per_100g,
          carbs_per_100g: fav.carbs_per_100g,
          fat_per_100g: fav.fat_per_100g,
          source: fav.source,
          source_id: fav.source_id,
          last_quantity_g: grams,
        });
      }
      setSelected(null);
      setQuery('');
    } catch (e) {
      Alert.alert('Could not log food', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const confirmDelete = (log: FoodLog) => {
    Alert.alert('Delete entry', `Remove "${log.food_name}" from this day's log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteLog.mutate(log.id);
          if (log.photo_path) deletePhoto(log.photo_path); // wipe the on-device file too (NWE-204)
        },
      },
    ]);
  };

  const saveEdit = async (patch: Parameters<typeof updateLog.mutate>[0]['patch']) => {
    if (!editing) return;
    try {
      await updateLog.mutateAsync({ id: editing.id, patch });
      setEditing(null);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const deleteEditing = () => {
    if (!editing) return;
    const { id, photo_path } = editing;
    setEditing(null);
    deleteLog.mutate(id);
    if (photo_path) deletePhoto(photo_path);
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
        <DateBar date={date} onChange={setDate} />

        {editing && (
          <EditEntryPanel
            entry={editing}
            onSave={saveEdit}
            onDelete={deleteEditing}
            onCancel={() => setEditing(null)}
            saving={updateLog.isPending}
          />
        )}

        <Input
          placeholder="Search foods (e.g. greek yogurt)…"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />

        {searchQuery.isFetching && <ActivityIndicator style={{ marginVertical: 8 }} />}
        {searchQuery.isError && (
          <Muted>Couldn't search right now — check your connection.</Muted>
        )}

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
                  {r.brand ? <Muted> · {r.brand}</Muted> : null}
                </Text>
                <Muted>
                  {Math.round(r.caloriesPer100g)} kcal · P {Math.round(r.proteinPer100g)} · C{' '}
                  {Math.round(r.carbsPer100g)} · F {Math.round(r.fatPer100g)} (per 100 g)
                </Muted>
              </Pressable>
            ))}
          </Card>
        )}

        {selected && (
          <Card>
            <Text style={styles.resultName}>{selected.name}</Text>
            <Muted>{Math.round(selected.caloriesPer100g)} kcal per 100 g</Muted>
            <ChipRow>
              {MEALS.map((m) => (
                <Chip
                  key={m}
                  label={MEAL_LABELS[m]}
                  active={mealType === m}
                  onPress={() => setMealType(m)}
                />
              ))}
            </ChipRow>
            <Pressable
              style={styles.photoRow}
              onPress={async () => {
                const f = await capturePhoto();
                if (f) setPhotoPath(f);
              }}
              onLongPress={async () => {
                const f = await pickPhoto();
                if (f) setPhotoPath(f);
              }}>
              <Text style={styles.photoIcon}>📷</Text>
              <Muted>{photoPath ? 'Photo attached · stays on device' : 'Add photo (long-press for library)'}</Muted>
            </Pressable>
            <View style={styles.quantityRow}>
              <Input
                style={{ flex: 1 }}
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="Amount (g)"
              />
              <Button title="Add" onPress={addSelected} loading={createLog.isPending} />
              <Pressable style={styles.cancelButton} onPress={() => setSelected(null)}>
                <Muted>Cancel</Muted>
              </Pressable>
            </View>
          </Card>
        )}

        <Pressable onPress={() => setShowManual(!showManual)}>
          <Text style={styles.manualToggle}>
            {showManual ? '− Hide manual entry' : "+ Can't find it? Add manually"}
          </Text>
        </Pressable>
        {showManual && <ManualEntryForm defaultMeal={mealType} date={date} />}

        {showBrowse && (
          <>
            <FavoritesRecents
              favorites={favoritesQuery.data ?? []}
              recents={recentsQuery.data ?? []}
              onPick={pickFood}
              onToggleFavorite={toggleFavorite}
            />
            <RecipesSection
              recipes={recipesQuery.data ?? []}
              onLog={logRecipeById}
              logging={logRecipe.isPending}
            />
          </>
        )}

        <SectionTitle>
          {Math.round(totals.calories)} kcal · P {Math.round(totals.protein)} · C{' '}
          {Math.round(totals.carbs)} · F {Math.round(totals.fat)}
        </SectionTitle>

        {logsQuery.isLoading && <ActivityIndicator style={{ marginVertical: 8 }} />}

        {MEALS.map((meal) => {
          const mealLogs = logs.filter((l) => l.meal_type === meal);
          if (mealLogs.length === 0) return null;
          return (
            <View key={meal} style={{ gap: 6 }}>
              <Text style={styles.mealHeading}>{MEAL_LABELS[meal]}</Text>
              <Card>
                {mealLogs.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => setEditing(l)}
                    onLongPress={() => confirmDelete(l)}
                    style={styles.logRow}>
                    <PhotoThumbnail
                      filename={l.photo_path}
                      onPress={() =>
                        router.push({
                          pathname: '/photo-viewer',
                          params: { filename: l.photo_path ?? '', logId: l.id, date },
                        })
                      }
                    />
                    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                      <Text numberOfLines={1}>{l.food_name}</Text>
                      <Muted>
                        {l.quantity_g} g · P {Math.round(l.protein_g)} · C {Math.round(l.carbs_g)}{' '}
                        · F {Math.round(l.fat_g)}
                      </Muted>
                    </View>
                    <Text style={styles.logCalories}>{Math.round(l.calories)} kcal</Text>
                  </Pressable>
                ))}
              </Card>
            </View>
          );
        })}

        {!logsQuery.isLoading && logs.length === 0 && (
          <EmptyState text="Nothing logged today. Search above or add manually. Long-press an entry to delete it." />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ManualEntryForm({ defaultMeal, date }: { defaultMeal: MealType; date: string }) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const createLog = useCreateFoodLog();

  const add = async () => {
    if (!name.trim() || !calories) {
      Alert.alert('Missing info', 'A name and calories are required.');
      return;
    }
    try {
      await createLog.mutateAsync({
        food_name: name.trim(),
        meal_type: meal,
        quantity_g: 100,
        calories: parseFloat(calories) || 0,
        protein_g: parseFloat(protein) || 0,
        carbs_g: parseFloat(carbs) || 0,
        fat_g: parseFloat(fat) || 0,
        source: 'manual',
        logged_on: date,
      });
      setName('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
    } catch (e) {
      Alert.alert('Could not log food', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <Card>
      <Input placeholder="Food name" value={name} onChangeText={setName} />
      <View style={styles.quantityRow}>
        <Input style={{ flex: 1 }} placeholder="kcal" keyboardType="numeric" value={calories} onChangeText={setCalories} />
        <Input style={{ flex: 1 }} placeholder="Protein g" keyboardType="numeric" value={protein} onChangeText={setProtein} />
      </View>
      <View style={styles.quantityRow}>
        <Input style={{ flex: 1 }} placeholder="Carbs g" keyboardType="numeric" value={carbs} onChangeText={setCarbs} />
        <Input style={{ flex: 1 }} placeholder="Fat g" keyboardType="numeric" value={fat} onChangeText={setFat} />
      </View>
      <ChipRow>
        {MEALS.map((m) => (
          <Chip key={m} label={MEAL_LABELS[m]} active={meal === m} onPress={() => setMeal(m)} />
        ))}
      </ChipRow>
      <Button title="Log food" onPress={add} loading={createLog.isPending} />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 10,
  },
  resultRow: {
    paddingVertical: 6,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '500',
  },
  quantityRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  cancelButton: {
    paddingHorizontal: 8,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoIcon: {
    fontSize: 20,
  },
  manualToggle: {
    color: Brand.accent,
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
