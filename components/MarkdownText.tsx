import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

function inlineMarkdown(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={index} style={styles.bold}>{part.slice(2, -2)}</Text>;
    }
    return part;
  });
}

export function MarkdownText({ children }: { children: string }) {
  const lines = children.split(/\r?\n/);
  return (
    <View style={styles.wrap}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={index} style={styles.gap} />;
        if (trimmed.startsWith('### ')) return <Text key={index} style={styles.h3}>{inlineMarkdown(trimmed.slice(4))}</Text>;
        if (trimmed.startsWith('## ')) return <Text key={index} style={styles.h2}>{inlineMarkdown(trimmed.slice(3))}</Text>;
        if (trimmed.startsWith('# ')) return <Text key={index} style={styles.h1}>{inlineMarkdown(trimmed.slice(2))}</Text>;
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <View key={index} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={[styles.body, styles.listBody]}>{inlineMarkdown(trimmed.slice(2))}</Text>
            </View>
          );
        }
        const numberedItem = trimmed.match(/^(\d+\.)\s+(.+)$/);
        if (numberedItem) {
          return (
            <View key={index} style={styles.bulletRow}>
              <Text style={styles.number}>{numberedItem[1]}</Text>
              <Text style={[styles.body, styles.listBody]}>{inlineMarkdown(numberedItem[2])}</Text>
            </View>
          );
        }
        return <Text key={index} style={styles.body}>{inlineMarkdown(trimmed)}</Text>;
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
  body: { fontSize: 15, lineHeight: 22 },
  bold: { fontWeight: '700' },
  listBody: { flex: 1 },
  bulletRow: { flexDirection: 'row', gap: 8, backgroundColor: 'transparent' },
  bullet: { width: 12, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  number: { minWidth: 20, fontSize: 15, lineHeight: 22, textAlign: 'right' },
});
