// Favorites + Recent sections shown above the day log when the search box is
// empty (NWE-201). Tapping a card/row pre-fills the add panel via onPick; the star
// toggles favorite state. Recents are read-only rows with a star to save them.
import type { FavoriteFood, MealType, RecentFood } from '@shared';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Card, Muted } from '@/components/ui';
import { Brand } from '@/constants/Colors';

export interface PickedFood {
  name: string;
  brand: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source: 'manual' | 'openfoodfacts';
  source_id: string | null;
  quantity_g: number;
  meal_type?: MealType;
}

function Star({ filled, onPress }: { filled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel={filled ? 'Unfavorite' : 'Favorite'}>
      <Text style={[styles.star, filled && styles.starFilled]}>{filled ? '★' : '☆'}</Text>
    </Pressable>
  );
}

export function FavoritesRecents({
  favorites,
  recents,
  onPick,
  onToggleFavorite,
}: {
  favorites: FavoriteFood[];
  recents: RecentFood[];
  onPick: (food: PickedFood) => void;
  onToggleFavorite: (food: FavoriteFood | RecentFood, existing?: FavoriteFood) => void;
}) {
  // A recent is "starred" if a favorite with the same name+brand exists.
  const favByKey = new Map(
    favorites.map((f) => [`${f.name.toLowerCase()}|${(f.brand ?? '').toLowerCase()}`, f])
  );

  if (favorites.length === 0 && recents.length === 0) {
    return <Muted style={styles.empty}>Log a few foods and your favorites & recents show here.</Muted>;
  }

  return (
    <View style={styles.wrap}>
      {favorites.length > 0 && (
        <>
          <Text style={styles.heading}>★ Favorites</Text>
          <View style={styles.cardRow}>
            {favorites.map((f) => (
              <Pressable
                key={f.id}
                style={styles.favCard}
                onPress={() =>
                  onPick({
                    name: f.name,
                    brand: f.brand,
                    caloriesPer100g: f.calories_per_100g,
                    proteinPer100g: f.protein_per_100g,
                    carbsPer100g: f.carbs_per_100g,
                    fatPer100g: f.fat_per_100g,
                    source: f.source,
                    source_id: f.source_id,
                    quantity_g: f.last_quantity_g,
                  })
                }>
                <Text numberOfLines={1} style={styles.favName}>
                  {f.name}
                </Text>
                <Muted>
                  {Math.round((f.calories_per_100g * f.last_quantity_g) / 100)} kcal ·{' '}
                  {f.last_quantity_g} g
                </Muted>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {recents.length > 0 && (
        <>
          <Text style={styles.heading}>Recent</Text>
          <Card>
            {recents.map((r, i) => {
              const key = `${r.food_name.toLowerCase()}|${(r.brand ?? '').toLowerCase()}`;
              const fav = favByKey.get(key);
              return (
                <Pressable
                  key={`${key}-${i}`}
                  style={styles.recentRow}
                  onPress={() =>
                    onPick({
                      name: r.food_name,
                      brand: r.brand,
                      caloriesPer100g: (r.calories * 100) / (r.quantity_g || 100),
                      proteinPer100g: (r.protein_g * 100) / (r.quantity_g || 100),
                      carbsPer100g: (r.carbs_g * 100) / (r.quantity_g || 100),
                      fatPer100g: (r.fat_g * 100) / (r.quantity_g || 100),
                      source: r.source === 'openfoodfacts' ? 'openfoodfacts' : 'manual',
                      source_id: r.source_id,
                      quantity_g: r.quantity_g,
                      meal_type: r.meal_type,
                    })
                  }>
                  <View style={styles.recentText}>
                    <Text numberOfLines={1}>
                      {r.food_name}
                      {r.brand ? <Muted> · {r.brand}</Muted> : null}
                    </Text>
                    <Muted>
                      {r.quantity_g} g · {Math.round(r.calories)} kcal
                    </Muted>
                  </View>
                  <Star filled={!!fav} onPress={() => onToggleFavorite(r, fav)} />
                </Pressable>
              );
            })}
          </Card>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  empty: { textAlign: 'center', marginVertical: 8 },
  heading: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: 'transparent' },
  favCard: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Brand.accent,
    backgroundColor: 'transparent',
  },
  favName: { fontSize: 15, fontWeight: '500' },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  recentText: { flex: 1, backgroundColor: 'transparent' },
  star: { fontSize: 22, color: '#9ca3af' },
  starFilled: { color: '#f59e0b' },
});
