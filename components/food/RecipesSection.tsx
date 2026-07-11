// "My recipes" section on the empty-search Food tab (NWE-202). Cards show name +
// per-serving kcal; tapping opens a servings multiplier row (0.5× / 1× / 2× + free
// input) then logs ONE food_log via onLog. "+ New recipe" and edit routes handled
// by the parent.
import { recipePerServing } from '@shared';
import type { MealType, Recipe } from '@shared';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button, Card, Chip, ChipRow, Input, Muted } from '@/components/ui';
import { Brand } from '@/constants/Colors';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function RecipesSection({
  recipes,
  onLog,
  logging,
}: {
  recipes: Recipe[];
  onLog: (recipeId: string, servings: number, meal: MealType) => void;
  logging?: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [mult, setMult] = useState('1');
  const [meal, setMeal] = useState<MealType>('snack');

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>My recipes</Text>
      <View style={styles.cards}>
        {recipes.map((r) => {
          const per = recipePerServing(
            (r.recipe_items ?? []).map((it) => ({
              quantity_g: it.quantity_g,
              calories_per_100g: it.calories_per_100g,
              protein_per_100g: it.protein_per_100g,
              carbs_per_100g: it.carbs_per_100g,
              fat_per_100g: it.fat_per_100g,
            })),
            r.servings
          );
          const open = openId === r.id;
          return (
            <Card key={r.id} style={styles.card}>
              <Pressable
                onPress={() => setOpenId(open ? null : r.id)}
                onLongPress={() => router.push({ pathname: '/recipe-editor', params: { id: r.id } })}>
                <Text style={styles.name}>{r.name}</Text>
                <Muted>{Math.round(per.calories)} kcal / serving · long-press to edit</Muted>
              </Pressable>
              {open && (
                <>
                  <ChipRow>
                    {['0.5', '1', '2'].map((m) => (
                      <Chip key={m} label={`${m}×`} active={mult === m} onPress={() => setMult(m)} />
                    ))}
                  </ChipRow>
                  <Input placeholder="servings" keyboardType="numeric" value={mult} onChangeText={setMult} />
                  <ChipRow>
                    {MEALS.map((m) => (
                      <Chip key={m} label={m} active={meal === m} onPress={() => setMeal(m)} />
                    ))}
                  </ChipRow>
                  <Button
                    title="Log recipe"
                    loading={logging}
                    onPress={() => {
                      onLog(r.id, parseFloat(mult) || 1, meal);
                      setOpenId(null);
                    }}
                  />
                </>
              )}
            </Card>
          );
        })}
      </View>
      <Pressable onPress={() => router.push({ pathname: '/recipe-editor' })}>
        <Text style={styles.newRecipe}>+ New recipe</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  heading: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  cards: { gap: 8 },
  card: { gap: 8 },
  name: { fontSize: 15, fontWeight: '500' },
  newRecipe: { color: Brand.accent, fontSize: 14 },
});
