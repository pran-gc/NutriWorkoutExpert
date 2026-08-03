import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Card, EmptyState, Muted } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import {
  addProgressPhoto,
  listProgressPhotos,
  localPhotoUri,
  removeProgressPhoto,
  type ProgressPhoto,
} from '@/lib/photos';

export default function ProgressPhotosScreen() {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const refresh = () => listProgressPhotos().then(setPhotos);
  useEffect(() => {
    refresh();
  }, []);
  const add = async (from: 'camera' | 'library') => {
    await addProgressPhoto(from);
    refresh();
  };
  const toggle = (filename: string) => {
    setSelected((prev) =>
      prev.includes(filename) ? prev.filter((p) => p !== filename) : prev.length < 2 ? [...prev, filename] : prev
    );
  };
  const deleteSelected = () => {
    Alert.alert('Delete photos', 'Remove the selected local photos from this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          for (const filename of selected) await removeProgressPhoto(filename);
          setSelected([]);
          refresh();
        },
      },
    ]);
  };
  const comparison = selected.map((filename) => photos.find((p) => p.filename === filename)).filter(Boolean) as ProgressPhoto[];
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={{ backgroundColor: 'transparent' }}>
          <Text style={styles.title}>Progress photos</Text>
          <Muted>Photos stay on this device.</Muted>
        </View>
        {selected.length > 0 ? <Text style={styles.link}>{selected.length}/2</Text> : null}
      </View>
      <View style={styles.actions}>
        <Button title="Camera" onPress={() => add('camera')} style={{ flex: 1 }} />
        <Button title="Library" onPress={() => add('library')} style={{ flex: 1 }} />
      </View>
      {photos.length === 0 ? <EmptyState text="Add progress photos when you want a private visual record." /> : null}
      <View style={styles.grid}>
        {photos.map((photo) => {
          const uri = localPhotoUri(photo.filename);
          const active = selected.includes(photo.filename);
          return (
            <Pressable
              key={photo.filename}
              accessibilityLabel={`Progress photo ${photo.logged_on}`}
              testID={`progress-photo-${photo.filename}`}
              style={[styles.tile, active && styles.tileActive]}
              onPress={() => toggle(photo.filename)}
            >
              {uri ? <Image source={{ uri }} style={styles.image} /> : null}
              <Text style={styles.badge}>{photo.logged_on.slice(5)}</Text>
            </Pressable>
          );
        })}
      </View>
      {comparison.length === 2 ? (
        <Card>
          <Text style={styles.section}>Compare</Text>
          <View style={styles.compareRow}>
            {comparison.map((photo) => {
              const uri = localPhotoUri(photo.filename);
              return (
                <View key={photo.filename} style={styles.comparePane}>
                  {uri ? (
                    <ScrollView
                      testID={`compare-zoom-${photo.filename}`}
                      style={styles.zoomPane}
                      contentContainerStyle={styles.zoomContent}
                      maximumZoomScale={3}
                      minimumZoomScale={1}
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                    >
                      <Image source={{ uri }} style={styles.compareImage} />
                    </ScrollView>
                  ) : null}
                  <Muted>{photo.logged_on}</Muted>
                </View>
              );
            })}
          </View>
          <Button title="Delete selected" variant="destructive" onPress={deleteSelected} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent' },
  title: { fontSize: 24, fontWeight: '700' },
  link: { color: Brand.accent, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, backgroundColor: 'transparent' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: 'transparent' },
  tile: { width: '31%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(142,142,147,.18)' },
  tileActive: { borderWidth: 3, borderColor: Brand.accent },
  image: { width: '100%', height: '100%' },
  badge: { position: 'absolute', left: 5, bottom: 5, color: '#fff', fontWeight: '700', backgroundColor: 'rgba(0,0,0,.45)', paddingHorizontal: 5, borderRadius: 4 },
  section: { fontSize: 17, fontWeight: '600' },
  compareRow: { flexDirection: 'row', gap: 8, backgroundColor: 'transparent' },
  comparePane: { flex: 1, gap: 4, backgroundColor: 'transparent' },
  zoomPane: { width: '100%', aspectRatio: 0.75, borderRadius: 8, backgroundColor: 'rgba(142,142,147,.18)' },
  zoomContent: { flexGrow: 1 },
  compareImage: { width: '100%', aspectRatio: 0.75, borderRadius: 8 },
});
