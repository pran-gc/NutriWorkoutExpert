import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export function MarkdownText({ children }: { children: string }) {
  const lines = children.split(/\r?\n/);
  return (
    <View style={styles.wrap}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={index} style={styles.gap} />;
        if (trimmed.startsWith('### ')) return <Text key={index} style={styles.h3}>{trimmed.slice(4)}</Text>;
        if (trimmed.startsWith('## ')) return <Text key={index} style={styles.h2}>{trimmed.slice(3)}</Text>;
        if (trimmed.startsWith('# ')) return <Text key={index} style={styles.h1}>{trimmed.slice(2)}</Text>;
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <View key={index} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.body}>{trimmed.slice(2)}</Text>
            </View>
          );
        }
        return <Text key={index} style={styles.body}>{trimmed}</Text>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, backgroundColor: 'transparent' },
  gap: { height: 4, backgroundColor: 'transparent' },
  h1: { fontSize: 20, fontWeight: '800', lineHeight: 26 },
  h2: { fontSize: 17, fontWeight: '800', lineHeight: 23 },
  h3: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  body: { flex: 1, fontSize: 15, lineHeight: 21 },
  bulletRow: { flexDirection: 'row', gap: 8, backgroundColor: 'transparent' },
  bullet: { fontSize: 15, lineHeight: 21 },
});
