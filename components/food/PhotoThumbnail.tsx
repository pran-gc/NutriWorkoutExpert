// 48px rounded meal-photo thumbnail for a log row (NWE-204). Renders only when the
// file exists on THIS device; a missing file renders nothing (no error) — a photo
// logged on another device is meaningless here.
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';

import { localPhotoUri, photoExists } from '@/lib/photos';

export function PhotoThumbnail({
  filename,
  onPress,
}: {
  filename: string | null | undefined;
  onPress?: () => void;
}) {
  const [exists, setExists] = useState(false);

  useEffect(() => {
    let active = true;
    photoExists(filename).then((e) => active && setExists(e));
    return () => {
      active = false;
    };
  }, [filename]);

  if (!exists || !filename) return null;
  const uri = localPhotoUri(filename);

  return (
    <Pressable onPress={onPress} accessibilityLabel="View photo">
      <Image source={{ uri: uri ?? undefined }} style={styles.thumb} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 48, height: 48, borderRadius: 8, marginRight: 8 },
});
