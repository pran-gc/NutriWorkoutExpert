import * as FileSystem from 'expo-file-system/legacy';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Card, Input, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { useAiConsent, useAnalyzePhysique, useDeleteInsight, useInsights, useUpdateAiConsent } from '@/lib/hooks';
import { localPhotoUri, pickPhoto } from '@/lib/photos';

export default function PhysiqueCompareScreen() {
  const consent = useAiConsent();
  const updateConsent = useUpdateAiConsent();
  const analyze = useAnalyzePhysique();
  const insights = useInsights();
  const deleteInsight = useDeleteInsight();
  const [previous, setPrevious] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const enabled = Boolean(consent.data?.physique && consent.data?.free_tier_acknowledged);

  const choose = async (slot: 'previous' | 'current') => {
    const filename = await pickPhoto();
    if (slot === 'previous') setPrevious(filename);
    else setCurrent(filename);
  };

  const acceptConsent = async () => {
    await updateConsent.mutateAsync({ physique: true, free_tier_acknowledged: true });
  };

  const revokeConsent = async () => {
    await updateConsent.mutateAsync({ physique: false, free_tier_acknowledged: false });
  };

  const compare = async () => {
    if (!previous || !current) {
      Alert.alert('Pick two photos', 'Choose a previous and current photo first.');
      return;
    }
    try {
      const photos = [];
      for (const filename of [previous, current]) {
        const uri = localPhotoUri(filename);
        if (!uri) throw new Error('Photo missing.');
        photos.push(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }));
      }
      await analyze.mutateAsync({ consent: true, notes: notes.trim() || undefined, photos });
      Alert.alert('Feedback saved', 'Your text feedback is in Insights. Photos were not stored server-side.');
    } catch (e) {
      Alert.alert('Could not compare', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const physiqueRows = (insights.data ?? []).filter((row) => row.kind === 'physique');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionTitle>Physique compare</SectionTitle>
      <Card>
        <Text style={styles.title}>Private AI photo feedback</Text>
        <Muted>
          Photos leave your device only for this analysis, are sent to Google Gemini, and are never stored by us.
          Free-tier Gemini data may be processed by Google to improve services.
        </Muted>
        {enabled ? (
          <Button title="Revoke AI photo consent" variant="destructive" onPress={revokeConsent} />
        ) : (
          <Button title="I understand, enable compare" onPress={acceptConsent} />
        )}
      </Card>

      <View style={styles.slots}>
        <Pressable style={styles.slot} onPress={() => choose('previous')}>
          <Text style={styles.slotLabel}>Previous</Text>
          <Muted>{previous ?? 'Choose photo'}</Muted>
        </Pressable>
        <Pressable style={styles.slot} onPress={() => choose('current')}>
          <Text style={styles.slotLabel}>Current</Text>
          <Muted>{current ?? 'Choose photo'}</Muted>
        </Pressable>
      </View>
      <Input placeholder="Optional context" value={notes} onChangeText={setNotes} />
      <Button title="Compare" onPress={compare} disabled={!enabled} loading={analyze.isPending} />

      <SectionTitle>Saved feedback</SectionTitle>
      {physiqueRows.length === 0 ? (
        <Card>
          <Muted>No physique feedback yet.</Muted>
        </Card>
      ) : (
        physiqueRows.map((row) => (
          <Card key={row.id}>
            <Muted>{row.created_at.slice(0, 10)}</Muted>
            <Text>{row.content}</Text>
            <Pressable onPress={() => deleteInsight.mutate(row.id)}>
              <Text style={styles.delete}>Delete feedback</Text>
            </Pressable>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  title: { fontSize: 17, fontWeight: '700' },
  slots: { flexDirection: 'row', gap: 10, backgroundColor: 'transparent' },
  slot: {
    flex: 1,
    minHeight: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Brand.accent,
    padding: 12,
    justifyContent: 'center',
  },
  slotLabel: { fontSize: 16, fontWeight: '700' },
  delete: { color: Brand.destructive, fontWeight: '600' },
});
