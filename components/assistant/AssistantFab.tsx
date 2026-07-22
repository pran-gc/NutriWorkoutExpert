import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/Colors';

export function AssistantFab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const open = (threads = false) => router.push(threads ? '/assistant?showThreads=1' : '/assistant');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open AI assistant"
      accessibilityHint="Long press to view recent conversations"
      onPress={() => open()}
      onLongPress={() => open(true)}
      delayLongPress={350}
      style={({ pressed }) => [styles.fab, { bottom: Math.max(insets.bottom, 8) + 58 }, pressed && styles.pressed]}>
      <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor="#fff" size={27} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 18, zIndex: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.accent,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 7,
  },
  pressed: { opacity: 0.82 },
});
