// Full-screen meal-photo viewer (NWE-204). Shows the photo, its date, a delete
// button, and close. Reassures that photos stay on-device. Deleting here removes
// the file AND clears the log's photo_path (passed back via the caller's flow).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Image, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Muted } from '@/components/ui';
import { useUpdateFoodLog } from '@/lib/hooks';
import { deletePhoto, localPhotoUri } from '@/lib/photos';

export default function PhotoViewer() {
  const router = useRouter();
  const { filename, logId, date } = useLocalSearchParams<{
    filename: string;
    logId: string;
    date: string;
  }>();
  const updateLog = useUpdateFoodLog(date ?? '');
  const uri = localPhotoUri(filename);

  const removePhoto = () => {
    Alert.alert('Delete photo?', 'Remove this photo from the entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePhoto(filename);
          if (logId) await updateLog.mutateAsync({ id: logId, patch: { photo_path: null } });
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={styles.container} lightColor="#000" darkColor="#000">
      {uri && <Image source={{ uri }} style={styles.photo} resizeMode="contain" />}
      <View style={styles.footer} lightColor="transparent" darkColor="transparent">
        <Muted style={styles.note}>Photos stay on this device.</Muted>
        <View style={styles.actions} lightColor="transparent" darkColor="transparent">
          <Button title="Delete" variant="destructive" onPress={removePhoto} style={{ flex: 1 }} />
          <Pressable style={styles.close} onPress={() => router.back()}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  photo: { flex: 1, width: '100%' },
  footer: { padding: 20, gap: 12 },
  note: { color: '#fff', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  close: { flex: 1, alignItems: 'center', paddingVertical: 13 },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
