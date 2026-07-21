// Program refinement chat (NWE-120) — talk to the coach about the generated
// draft instead of following it blindly. Two channels per turn: the coach always
// replies in prose; when it proposes a revision, an "Apply this revision" card
// appears and — only on tap — replaces the local preview draft. Saving still goes
// through the normal save flow; nothing auto-applies.
import type { GeneratedProgram } from '@shared';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Input, Muted } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { useRefineProgram } from '@/lib/hooks';

interface ChatTurn {
  role: 'user' | 'coach';
  text: string;
}

export function ProgramChat({
  insightId,
  onApplyRevision,
}: {
  insightId: string;
  onApplyRevision: (program: GeneratedProgram) => void;
}) {
  const refine = useRefineProgram();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draftRevision, setDraftRevision] = useState<GeneratedProgram | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const message = input.trim();
    if (!message || refine.isPending) return;
    setError(null);
    setInput('');
    setTurns((prev) => [...prev, { role: 'user', text: message }]);
    try {
      const res = await refine.mutateAsync({ insight_id: insightId, message });
      setTurns((prev) => [...prev, { role: 'coach', text: res.reply }]);
      if (res.updated_program) setDraftRevision(res.updated_program);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The coach is busy — try again.');
    }
  };

  const apply = () => {
    if (!draftRevision) return;
    onApplyRevision(draftRevision);
    setDraftRevision(null);
    setTurns((prev) => [...prev, { role: 'coach', text: 'Revision applied to the preview — save when you are happy with it.' }]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Discuss with your coach</Text>
      <Muted>Ask why, push back, or request changes — nothing is final until you save.</Muted>

      {turns.map((turn, i) => (
        <View
          key={i}
          style={[styles.bubble, turn.role === 'user' ? styles.userBubble : styles.coachBubble]}
          lightColor={turn.role === 'user' ? 'rgba(22,163,74,0.12)' : 'rgba(0,0,0,0.05)'}
          darkColor={turn.role === 'user' ? 'rgba(22,163,74,0.25)' : 'rgba(255,255,255,0.08)'}>
          <Text style={styles.bubbleText}>{turn.text}</Text>
        </View>
      ))}

      {refine.isPending && (
        <View style={styles.thinking}>
          <ActivityIndicator size="small" />
          <Muted> Coach is thinking…</Muted>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {draftRevision && (
        <View style={styles.revisionCard} lightColor="rgba(22,163,74,0.08)" darkColor="rgba(22,163,74,0.18)">
          <Text style={styles.revisionTitle}>Coach proposed a revision</Text>
          <Muted>
            {draftRevision.days.length} days · {draftRevision.days.reduce((n, d) => n + d.exercises.length, 0)} exercises
          </Muted>
          <Button title="Apply this revision" onPress={apply} />
          <Pressable onPress={() => setDraftRevision(null)} hitSlop={8}>
            <Text style={styles.discard}>Discard</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.inputRow}>
        <Input
          style={{ flex: 1 }}
          placeholder="e.g. day 2 is too long, and I hate lunges"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Button title="Send" onPress={send} disabled={refine.isPending || !input.trim()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 8, backgroundColor: 'transparent' },
  heading: { fontSize: 15, fontWeight: '600' },
  bubble: { borderRadius: 12, padding: 10, maxWidth: '88%' },
  userBubble: { alignSelf: 'flex-end' },
  coachBubble: { alignSelf: 'flex-start' },
  bubbleText: { fontSize: 14 },
  thinking: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent' },
  error: { color: '#d97706', fontSize: 13 },
  revisionCard: { borderRadius: 12, padding: 12, gap: 8 },
  revisionTitle: { fontSize: 14, fontWeight: '600' },
  discard: { color: Brand.destructive, fontSize: 13, textAlign: 'center' },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'transparent' },
});
