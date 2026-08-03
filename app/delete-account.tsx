// Delete-account confirmation (NWE-117 + Apple requirement). Type DELETE to
// enable the button → final Alert confirm → wipe local photos → API delete →
// sign out (lands on sign-in via the auth guard).
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Card, Input, Muted } from '@/components/ui';
import { wipeAllLocalPhotos } from '@/lib/photos';
import { useDeleteAccount } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';

export default function DeleteAccountScreen() {
  const [confirm, setConfirm] = useState('');
  const deleteAccount = useDeleteAccount();
  const enabled = confirm.trim().toUpperCase() === 'DELETE';

  const runDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently erases your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount.mutateAsync();
              await wipeAllLocalPhotos(); // on-device photos never leave the device; wipe them too
              await supabase.auth.signOut();
            } catch (e) {
              Alert.alert('Could not delete', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Delete your account</Text>
      <Card>
        <Muted>Deleting your account permanently removes:</Muted>
        <Text>• Your profile, goals and targets</Text>
        <Text>• All food, water, weight and workout logs</Text>
        <Text>• Recipes, favorites, badges and AI insights</Text>
        <Text>• Photos stored on this device</Text>
        <Muted>This cannot be undone. Consider exporting your data first (Profile → Export my data).</Muted>
      </Card>

      <Text style={styles.prompt}>Type DELETE to confirm</Text>
      <Input placeholder="DELETE" autoCapitalize="characters" value={confirm} onChangeText={setConfirm} />

      <View style={{ height: 8, backgroundColor: 'transparent' }} />
      <Button
        title={deleteAccount.isPending ? 'Deleting…' : 'Delete my account'}
        variant="destructive"
        onPress={runDelete}
        disabled={!enabled || deleteAccount.isPending}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: 'bold' },
  prompt: { fontSize: 15, fontWeight: '600', marginTop: 8 },
});
