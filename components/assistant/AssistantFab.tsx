import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/Colors';
import { Surface } from '@/lib/glass';

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
      style={[styles.fab, { bottom: Math.max(insets.bottom, 8) + 58 }]}>
      {({ pressed }) => <>
        <Surface
          fallbackColor={Brand.accent}
          tintColor={Brand.accent}
          glassEffectStyle="regular"
          isInteractive
          style={StyleSheet.absoluteFill}
        />
        <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor="#fff" size={27} />
        {pressed && <View pointerEvents="none" style={styles.pressed} />}
      </>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 18, zIndex: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 7,
  },
  pressed: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.12)' },
});
