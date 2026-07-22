import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, TextInput,
} from 'react-native';

import type { AssistantMessage, AssistantSseEvent } from '@shared';
import { AppScreen } from '@/components/AppScreen';
import { AssistantMessageBubble } from '@/components/assistant/AssistantMessage';
import { ProposalCard } from '@/components/assistant/ProposalCard';
import { Text, View, useThemeColor } from '@/components/Themed';
import { EmptyState, Input, Muted } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { ApiClientError, getAssistantThread, streamAssistantChat } from '@/lib/api';
import { useAssistantThread, useAssistantThreads } from '@/lib/hooks';

const STARTERS = [
  'How has my training been trending lately?',
  'What patterns do you notice in my nutrition?',
  'What should I focus on this week?',
];

export const assistantProgressCopy: Record<string, string> = {
  get_workout_trends: 'Looking at your workout trends…', get_workouts: 'Reviewing your workouts…',
  get_exercise_history: 'Checking exercise progress…', get_routines: 'Reviewing your routines…',
  get_food_logs: 'Checking your meals…', get_nutrition_trends: 'Looking at nutrition trends…',
  get_weight_trend: 'Reviewing your weight trend…', get_profile_and_targets: 'Checking your goals and preferences…',
  get_coach_memory: 'Reviewing what your coach remembers…', search_foods: 'Looking up foods…',
  get_recipes: 'Reviewing your recipes…', get_recipe: 'Opening your recipe…',
  resolve_macros: 'Resolving ingredient nutrition…', propose_program_revision: 'Preparing a program proposal…',
  propose_meal_plan: 'Preparing a meal proposal…', propose_food_logs: 'Preparing food logs for review…',
  propose_target_change: 'Preparing a target proposal…',
  propose_workout_log: 'Preparing your workout log…', propose_recipe: 'Preparing a recipe proposal…',
};

function temporaryMessage(role: 'user' | 'assistant', content: string): AssistantMessage {
  return { id: `local-${Date.now()}-${role}`, role, content, tool_trace: null, failed: false, proposal_insight_id: null, created_at: new Date().toISOString() };
}

export default function AssistantScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ threadId?: string; showThreads?: string }>();
  const [threadId, setThreadId] = useState<string | null>(params.threadId ?? null);
  const thread = useAssistantThread(threadId);
  const threads = useAssistantThreads();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [failureReasons, setFailureReasons] = useState<Record<string, string>>({});
  const [showThreads, setShowThreads] = useState(params.showThreads === '1');
  const list = useRef<FlatList<AssistantMessage>>(null);
  const input = useRef<TextInput>(null);
  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  useEffect(() => {
    if (thread.data && !streaming) setMessages(thread.data.messages);
  }, [thread.data, streaming]);

  const appendAssistantDelta = (delta: string) => setMessages((current) => {
    const next = [...current];
    const last = next.at(-1);
    if (last?.role === 'assistant' && last.id.startsWith('local-')) next[next.length - 1] = { ...last, content: last.content + delta };
    return next;
  });

  const handleEvent = (event: AssistantSseEvent) => {
    if (event.type === 'thought') setProgress('Thinking…');
    else if (event.type === 'function_call') setProgress(assistantProgressCopy[event.name] ?? 'Checking your data…');
    else if (event.type === 'text') { setProgress('Writing your answer…'); appendAssistantDelta(event.delta); }
    else if (event.type === 'proposal' && event.proposal) {
      setMessages((current) => {
        const next = [...current];
        const index = next.findLastIndex((message) => message.role === 'assistant' && message.id.startsWith('local-'));
        if (index >= 0) next[index] = {
          ...next[index], proposal_insight_id: event.insight_id,
          proposal: { id: event.insight_id, proposal: event.proposal!, applied_at: null, dismissed_at: null },
        };
        return next;
      });
    }
    else if (event.type === 'done') setThreadId(event.thread_id);
    else if (event.type === 'error') {
      setErrorCode(event.code);
      console.error('[assistant] streamed turn failed', { code: event.code, message: event.message, requestId: event.request_id });
      throw new ApiClientError({ code: event.code as never, message: event.message });
    }
  };

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || streaming) return;
    setDraft(''); setErrorCode(null); setStreaming(true); setProgress('Thinking…');
    const userMessage = temporaryMessage('user', message);
    const assistantMessage = temporaryMessage('assistant', '');
    setMessages((current) => [...current, userMessage, assistantMessage]);
    try {
      let completedThreadId = threadId;
      for await (const event of streamAssistantChat({ message, ...(threadId ? { thread_id: threadId } : {}) })) {
        if (event.type === 'done') completedThreadId = event.thread_id;
        handleEvent(event);
      }
      if (completedThreadId) {
        try {
          const latest = await getAssistantThread(completedThreadId);
          if (latest?.messages) setMessages(latest.messages);
        } catch (refreshError) {
          // The streamed text/card is already usable. A refresh failure should
          // not turn a successful assistant action into a failed chat turn.
          console.error('[assistant] completed turn refresh failed', { threadId: completedThreadId, message: refreshError instanceof Error ? refreshError.message : 'Unknown refresh error' });
        }
      }
      await threads.refetch();
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : 'INTERNAL';
      const reason = error instanceof Error ? error.message : 'Unexpected assistant error.';
      console.error('[assistant] turn failed', { code, message: reason });
      setErrorCode(code);
      setFailureReasons((reasons) => ({ ...reasons, [assistantMessage.id]: reason }));
      setMessages((current) => {
        const next = [...current]; const last = next.at(-1);
        if (last?.role === 'assistant') next[next.length - 1] = { ...last, failed: true };
        return next;
      });
    } finally {
      setStreaming(false); setProgress(null);
    }
  }, [streaming, threadId, thread, threads]);

  const openThread = (id: string) => { setThreadId(id); setShowThreads(false); setMessages([]); };
  const newChat = () => { setThreadId(null); setMessages([]); setShowThreads(false); setErrorCode(null); input.current?.focus(); };

  return (
    <View style={[styles.safe, { backgroundColor: background }]}>
      <View style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close assistant" onPress={() => router.back()} style={styles.iconButton}>
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor={textColor} size={22} />
          </Pressable>
          <View style={styles.headerTitle}><Text style={styles.title}>AI Hub</Text><Text style={styles.subtitle} numberOfLines={1}>Your training and nutrition assistant</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Recent conversations" onPress={() => setShowThreads(true)} style={styles.iconButton}>
            <SymbolView name={{ ios: 'clock.arrow.circlepath', android: 'history', web: 'history' }} tintColor={textColor} size={23} />
          </Pressable>
        </View>

        {thread.isLoading && !messages.length ? <View style={styles.center}><ActivityIndicator color={Brand.accent} /></View> :
          thread.isError && !messages.length ? <View style={styles.center}><EmptyState text="That conversation couldn’t be loaded." /><Pressable onPress={() => thread.refetch()} style={styles.retry}><Text style={styles.link}>Try again</Text></Pressable></View> :
          <FlatList
            ref={list} testID="assistant-message-list" style={styles.messageList}
            data={messages} keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, !messages.length && styles.emptyList]}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: !streaming })}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<View style={styles.empty}>
              <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} tintColor={Brand.accent} size={34} />
              <Text style={styles.emptyTitle}>What can I help you work through?</Text>
              <Muted style={styles.disclosure}>Conversations are processed and briefly retained by Google. Photos are never sent to the Hub.</Muted>
              <View style={styles.starters}>{STARTERS.map((starter) => <Pressable key={starter} accessibilityRole="button" onPress={() => send(starter)} style={styles.starter}><Text>{starter}</Text></Pressable>)}</View>
            </View>}
            renderItem={({ item, index }) => <View style={styles.messageWrap}>
              {(item.role === 'user' || item.failed || item.content.trim()) && <AssistantMessageBubble message={item} failureReason={failureReasons[item.id]} onRetry={item.failed ? () => send(messages[index - 1]?.content ?? '') : undefined} />}
              {item.proposal && <ProposalCard state={item.proposal} />}
            </View>}
          />}

        {!!progress && <View style={styles.progress}><ActivityIndicator size="small" color={Brand.accent} /><Text style={styles.progressText}>{progress}</Text></View>}
        {errorCode === 'RATE_LIMITED' && <Muted style={styles.notice}>You’ve used today’s Hub messages. Your conversations are safe here; continue tomorrow.</Muted>}
        {errorCode === 'UPSTREAM_ERROR' && <Muted style={styles.notice}>The assistant is busy right now. You can retry this turn in a moment.</Muted>}
        <View style={styles.composer}>
          <Input ref={input} accessibilityLabel="Message the AI assistant" value={draft} onChangeText={setDraft} placeholder="Ask about training or nutrition…" multiline maxLength={2000} editable={!streaming} style={styles.input} />
          <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={streaming || !draft.trim()} onPress={() => send(draft)} style={[styles.send, (streaming || !draft.trim()) && styles.disabled]}>
            <SymbolView name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} tintColor="#fff" size={22} />
          </Pressable>
        </View>
      </View>

      <Modal visible={showThreads} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowThreads(false)}>
        <AppScreen modal style={{ backgroundColor: background }}>
          <View style={styles.modalHeader}><Text style={styles.title}>Recent conversations</Text><Pressable accessibilityRole="button" onPress={() => setShowThreads(false)} style={styles.iconButton}><Text style={styles.link}>Done</Text></Pressable></View>
          <Pressable accessibilityRole="button" onPress={newChat} style={styles.newChat}><SymbolView name={{ ios: 'square.and.pencil', android: 'edit_square', web: 'edit_square' }} tintColor={Brand.accent} size={22} /><Text style={styles.link}>New conversation</Text></Pressable>
          {threads.isLoading ? <ActivityIndicator style={styles.center} color={Brand.accent} /> : threads.isError ? <View style={styles.center}><EmptyState text="Recent conversations couldn’t be loaded." /><Pressable onPress={() => threads.refetch()}><Text style={styles.link}>Try again</Text></Pressable></View> : !threads.data?.length ? <EmptyState text="No conversations yet." /> :
            <FlatList data={threads.data} keyExtractor={(item) => item.id} contentContainerStyle={styles.threadList} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => openThread(item.id)} style={styles.threadRow}><Text numberOfLines={2} style={styles.threadTitle}>{item.title || 'Untitled conversation'}</Text><Muted>{new Date(item.updated_at).toLocaleDateString()}</Muted></Pressable>} />}
        </AppScreen>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.3)' },
  headerTitle: { flex: 1, alignItems: 'center', backgroundColor: 'transparent' }, title: { fontSize: 19, fontWeight: '800' }, iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  subtitle: { textAlign: 'center', fontSize: 12, opacity: 0.6 },
  messageList: { flex: 1 }, list: { padding: 16, paddingBottom: 16 }, emptyList: { flexGrow: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'transparent' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, paddingHorizontal: 14, backgroundColor: 'transparent' }, emptyTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' }, disclosure: { textAlign: 'center', lineHeight: 18 },
  starters: { width: '100%', gap: 9, backgroundColor: 'transparent' }, starter: { minHeight: 48, borderWidth: 1, borderColor: 'rgba(128,128,128,0.3)', borderRadius: 14, padding: 12, justifyContent: 'center' },
  messageWrap: { backgroundColor: 'transparent' }, progress: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9, backgroundColor: 'rgba(22,163,74,0.08)' }, progressText: { color: Brand.accent, fontSize: 13, fontWeight: '600' }, notice: { paddingHorizontal: 16, paddingTop: 7, textAlign: 'center' },
  composer: { flexDirection: 'row', gap: 9, alignItems: 'flex-end', padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.3)' }, input: { flex: 1, minHeight: 48, maxHeight: 120 }, send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.accent }, disabled: { opacity: 0.42 },
  retry: { minHeight: 44, justifyContent: 'center' }, link: { color: Brand.accent, fontWeight: '700' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 8 }, newChat: { minHeight: 52, marginHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.3)' },
  threadList: { padding: 18 }, threadRow: { minHeight: 64, justifyContent: 'center', gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.25)' }, threadTitle: { fontSize: 16, fontWeight: '600' },
});
