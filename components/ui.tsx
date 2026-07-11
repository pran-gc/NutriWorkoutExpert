import { forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  type PressableProps,
  type TextInputProps,
} from 'react-native';

import { Text, View, useThemeColor } from '@/components/Themed';
import { Brand } from '@/constants/Colors';

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View
      style={[styles.card, style]}
      lightColor="rgba(0,0,0,0.04)"
      darkColor="rgba(255,255,255,0.07)">
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// Input — theme-derived text/placeholder/border, readable in light AND dark
// (NWE-101 AC#1: no hardcoded input text color).
// ---------------------------------------------------------------------------

export const Input = forwardRef<TextInput, TextInputProps>(function Input(
  { style, ...props },
  ref
) {
  const color = useThemeColor({}, 'inputText');
  const placeholderColor = useThemeColor({}, 'inputPlaceholder');
  const borderColor = useThemeColor({}, 'inputBorder');
  const backgroundColor = useThemeColor({}, 'inputBackground');
  return (
    <TextInput
      ref={ref}
      style={[styles.input, { color, borderColor, backgroundColor }, style]}
      placeholderTextColor={placeholderColor}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
  ...rest
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'destructive';
  style?: object;
} & Omit<PressableProps, 'onPress' | 'style' | 'children'>) {
  const bg = variant === 'destructive' ? Brand.destructive : Brand.accent;
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.button, { backgroundColor: bg }, (disabled || loading) && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      {...rest}>
      <Text style={styles.buttonText}>{loading ? 'Working…' : title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Chip — the toggle pill repeated across food/profile (meal + sex + goal).
// ---------------------------------------------------------------------------

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}>
      <Text style={active ? styles.chipTextActive : styles.chipText}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

// ---------------------------------------------------------------------------
// OptionRow — full-width selectable row (activity level list).
// ---------------------------------------------------------------------------

export function OptionRow({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.optionRow, active && styles.optionRowActive]}
      onPress={onPress}>
      <Text style={active ? styles.optionTextActive : undefined}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Muted text + empty/loading states (every screen needs these — NWE-101 AC#3).
// ---------------------------------------------------------------------------

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function EmptyState({ text }: { text: string }) {
  return <Muted style={styles.centered}>{text}</Muted>;
}

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------

export function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View
      style={styles.track}
      lightColor="rgba(0,0,0,0.08)"
      darkColor="rgba(255,255,255,0.12)">
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: {
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: 'transparent',
  },
  chip: {
    borderWidth: 1,
    borderColor: Brand.accent,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: Brand.accent,
  },
  chipText: {
    fontSize: 14,
    color: Brand.accent,
  },
  chipTextActive: {
    fontSize: 14,
    color: '#fff',
  },
  optionRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  optionRowActive: {
    backgroundColor: Brand.accent,
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  muted: {
    fontSize: 13,
    opacity: 0.6,
  },
  centered: {
    textAlign: 'center',
    marginTop: 16,
  },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
});
