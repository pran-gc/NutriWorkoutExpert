// Set-new-password screen — the target of the password-reset deep link (NWE-117).
// Supabase's emailed link opens the app with a recovery session already
// established; we just collect and set the new password.
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Input, Muted } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password.length < 8) {
      Alert.alert('Too short', 'Use at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        Alert.alert('Could not update password', error.message);
        return;
      }
      Alert.alert('Password updated', 'You can now sign in with your new password.');
      router.replace('/(tabs)' as Href);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
        <Text style={styles.title}>Set a new password</Text>
        <Muted>Choose a password you'll remember.</Muted>
        <Input
          placeholder="New password"
          secureTextEntry
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
        />
        <Button title="Update password" onPress={submit} loading={busy} style={{ marginTop: 4 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: 'bold' },
});
