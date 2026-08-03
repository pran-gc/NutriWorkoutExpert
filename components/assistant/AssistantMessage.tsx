import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { AssistantMessage as AssistantMessageType, AssistantToolTrace } from '@shared';
import { MarkdownText } from '@/components/MarkdownText';
import { Text, View } from '@/components/Themed';
import { Muted } from '@/components/ui';
import { Brand } from '@/constants/Colors';

const FRIENDLY_TOOLS: Record<string, string> = {
  get_profile_and_targets: 'Profile and targets', get_workout_trends: 'Workout trends', get_workouts: 'Workout history',
  get_exercise_history: 'Exercise history', get_routines: 'Routines', get_food_logs: 'Food logs',
  get_nutrition_trends: 'Nutrition trends', get_weight_trend: 'Weight trend', get_coach_memory: 'Coach memory',
  search_foods: 'Food search', resolve_macros: 'Macro estimates',
};

export function ToolTrace({ trace }: { trace: AssistantToolTrace[] | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!trace?.length) return null;
  return (
    <View style={styles.transparent}>
      <Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)} style={styles.traceToggle}>
        <Muted>{open ? 'Hide sources' : 'What I looked at'} · {trace.length}</Muted>
      </Pressable>
      {open && trace.map((item, index) => (
        <View key={`${item.name}-${index}`} style={styles.traceRow}>
          <Text style={styles.traceName}>{FRIENDLY_TOOLS[item.name] ?? item.name.replaceAll('_', ' ')}</Text>
          <Muted>{item.ok ? `${item.ms} ms` : 'Could not load'} · {JSON.stringify(item.args_preview)}</Muted>
        </View>
      ))}
    </View>
  );
}

export function AssistantMessageBubble({ message, onRetry, failureReason }: { message: AssistantMessageType; onRetry?: () => void; failureReason?: string }) {
  const mine = message.role === 'user';
  // Keep diagnostic details in logs; tool names and schema failures are not
  // useful or humane user-facing recovery guidance.
  void failureReason;
  if (message.failed) {
    return (
      <View style={[styles.row, styles.left]}>
        <View style={[styles.bubble, styles.failed]}>
          <Muted>I hit a snag before I could finish. Try that again?</Muted>
          {onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable>}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.row, mine ? styles.right : styles.left]}>
      <View style={[styles.bubble, mine ? styles.user : styles.assistant]}>
        {mine ? <Text style={styles.userText}>{message.content}</Text> : <MarkdownText>{message.content}</MarkdownText>}
        {!mine && <ToolTrace trace={message.tool_trace} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', backgroundColor: 'transparent', marginVertical: 5 },
  left: { alignItems: 'flex-start' }, right: { alignItems: 'flex-end' },
  bubble: { maxWidth: '86%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11, gap: 8 },
  user: { backgroundColor: Brand.accent, borderBottomRightRadius: 5 },
  assistant: { backgroundColor: 'rgba(128,128,128,0.13)', borderBottomLeftRadius: 5 },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  failed: { borderWidth: 1, borderColor: 'rgba(128,128,128,0.35)', backgroundColor: 'rgba(128,128,128,0.08)' },
  retry: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }, retryText: { color: Brand.accent, fontWeight: '700' },
  transparent: { backgroundColor: 'transparent' }, traceToggle: { minHeight: 36, justifyContent: 'center' },
  traceRow: { backgroundColor: 'transparent', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.3)', paddingTop: 7, gap: 2 },
  traceName: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
});
