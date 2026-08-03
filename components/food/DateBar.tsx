// Date bar for the Food tab (NWE-206). Pinned above the content: ‹ · label · ›.
// The label is tappable (native date picker). Future dates are disabled. When
// viewing a past day the bar tints amber, signalling "you're editing the past".
import DateTimePicker from '@react-native-community/datetimepicker';
import { todayISO } from '@shared';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}
function shiftIso(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return dateToIso(d);
}

export function DateBar({ date, onChange }: { date: string; onChange: (iso: string) => void }) {
  const [showPicker, setShowPicker] = useState(false);
  const today = todayISO();
  const isToday = date === today;
  const atFuture = date >= today; // › disabled on today (can't go to the future)

  const label = isToday
    ? 'Today'
    : isoToDate(date).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

  return (
    <View
      style={[styles.bar, !isToday && styles.barPast]}
      lightColor={isToday ? 'rgba(0,0,0,0.03)' : undefined}
      darkColor={isToday ? 'rgba(255,255,255,0.05)' : undefined}>
      <Pressable
        onPress={() => onChange(shiftIso(date, -1))}
        hitSlop={8}
        accessibilityLabel="Previous day">
        <Text style={[styles.arrow, !isToday && styles.arrowPast]}>‹</Text>
      </Pressable>

      <Pressable onPress={() => setShowPicker(true)} accessibilityLabel="Pick a date">
        <Text style={[styles.label, !isToday && styles.labelPast]}>{label}</Text>
      </Pressable>

      <Pressable
        onPress={() => !atFuture && onChange(shiftIso(date, 1))}
        disabled={atFuture}
        hitSlop={8}
        accessibilityLabel="Next day">
        <Text style={[styles.arrow, atFuture ? styles.arrowDisabled : !isToday && styles.arrowPast]}>
          ›
        </Text>
      </Pressable>

      {showPicker && (
        <DateTimePicker
          value={isoToDate(date)}
          mode="date"
          maximumDate={isoToDate(today)}
          onChange={(_e, picked) => {
            setShowPicker(Platform.OS === 'ios' ? false : false);
            if (picked) onChange(dateToIso(picked));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  barPast: {
    backgroundColor: '#f59e0b', // amber — "editing the past"
  },
  arrow: { fontSize: 24, fontWeight: '600', paddingHorizontal: 8 },
  arrowPast: { color: '#fff' },
  arrowDisabled: { opacity: 0.3 },
  label: { fontSize: 16, fontWeight: '600' },
  labelPast: { color: '#fff' },
});
