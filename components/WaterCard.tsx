// Water tracking card for the dashboard (NWE-203). Blue progress bar, +250/+500
// buttons, undo link after an add, subtle haptic tick. Bar caps visually at 100%
// but the overflow amount still shows numerically.
import { todayISO } from '@shared';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Card, ProgressBar, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { useAddWater, useUndoWater, useWater } from '@/lib/hooks';

export function WaterCard({ targetMl = 2000 }: { targetMl?: number }) {
  const date = todayISO();
  const waterQuery = useWater(date);
  const addWater = useAddWater(date);
  const undoWater = useUndoWater(date);

  const total = waterQuery.data?.total_ml ?? 0;
  const reached = total >= targetMl;

  const add = (ml: number) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    addWater.mutate(ml);
  };

  return (
    <>
      <SectionTitle>Water</SectionTitle>
      <Card>
        <View style={styles.row}>
          <Text style={styles.amount}>
            {total.toLocaleString()} / {targetMl.toLocaleString()} ml
          </Text>
          {reached && <Text style={styles.reached}>Target reached ✓</Text>}
        </View>
        <ProgressBar value={total} max={targetMl} color={Brand.water} />
        <View style={styles.buttons}>
          <Pressable style={styles.addBtn} onPress={() => add(250)}>
            <Text style={styles.addText}>+250</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => add(500)}>
            <Text style={styles.addText}>+500</Text>
          </Pressable>
          {total > 0 && (
            <Pressable onPress={() => undoWater.mutate()} hitSlop={8} style={styles.undo}>
              <Text style={styles.undoText}>Undo last</Text>
            </Pressable>
          )}
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', backgroundColor: 'transparent' },
  amount: { fontSize: 18, fontWeight: '600' },
  reached: { fontSize: 13, color: Brand.water, fontWeight: '600' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, backgroundColor: 'transparent' },
  addBtn: {
    backgroundColor: Brand.water,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  addText: { color: '#fff', fontWeight: '700' },
  undo: { paddingHorizontal: 4 },
  undoText: { color: Brand.water, fontSize: 14 },
});
