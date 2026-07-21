// Swipe-a-row-left-to-delete, with a confirm so a stray swipe can't destroy data.
// Wraps any card/row; the red "Delete" action is revealed on left-swipe. Replaces
// the old undiscoverable long-press-to-delete pattern.
import { useRef } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Text, View } from '@/components/Themed';
import { Brand } from '@/constants/Colors';

// Extracted so the confirm→delete decision is unit-testable without a real swipe
// gesture (the reveal animation is the library's concern, not ours).
export function confirmDelete(opts: {
  title: string;
  message: string;
  onDelete: () => void;
  onCancel?: () => void;
}) {
  Alert.alert(opts.title, opts.message, [
    { text: 'Cancel', style: 'cancel', onPress: opts.onCancel },
    { text: 'Delete', style: 'destructive', onPress: opts.onDelete },
  ]);
}

export function SwipeToDelete({
  children,
  onDelete,
  confirmTitle = 'Delete?',
  confirmMessage = 'This cannot be undone.',
  accessibilityLabel = 'Delete',
}: {
  children: React.ReactNode;
  onDelete: () => void;
  confirmTitle?: string;
  confirmMessage?: string;
  accessibilityLabel?: string;
}) {
  const ref = useRef<SwipeableMethods>(null);

  const confirm = () =>
    confirmDelete({
      title: confirmTitle,
      message: confirmMessage,
      onDelete,
      onCancel: () => ref.current?.close(),
    });

  const renderRightActions = () => (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={confirm}
      style={styles.action}>
      <Text style={styles.actionText}>Delete</Text>
    </Pressable>
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={renderRightActions}>
      <View style={styles.content}>{children}</View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  action: {
    backgroundColor: Brand.destructive,
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    marginVertical: 4,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
