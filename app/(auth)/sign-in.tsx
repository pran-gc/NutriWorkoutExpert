import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button, Input } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const forgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Type your email above, then tap "Forgot password?".');
      return;
    }
    // The emailed link deep-links back to the app's set-new-password screen.
    const redirectTo = Linking.createURL('/reset-password');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) {
      Alert.alert('Could not send reset email', error.message);
    } else {
      Alert.alert('Check your inbox', 'We sent a link to reset your password.');
    }
  };

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) Alert.alert('Sign in failed', error.message);
      } else {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) {
          Alert.alert('Sign up failed', error.message);
        } else {
          Alert.alert(
            'Check your inbox',
            'If email confirmation is enabled, confirm your address before signing in.'
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.logo}>🥗💪</Text>
        <Text style={styles.title}>NutriWorkoutExpert</Text>
        <Text style={styles.subtitle}>
          Track your nutrition, workouts and goals — and get smarter every day.
        </Text>

        {!isSupabaseConfigured && (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              Supabase is not configured yet. Copy .env.example to .env, add your project URL and
              anon key, then restart the dev server.
            </Text>
          </View>
        )}

        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          placeholder="Password"
          secureTextEntry
          autoComplete={mode === 'signIn' ? 'password' : 'new-password'}
          value={password}
          onChangeText={setPassword}
        />

        <Button
          title={mode === 'signIn' ? 'Sign in' : 'Create account'}
          onPress={submit}
          loading={busy}
          style={{ marginTop: 4 }}
        />

        {mode === 'signIn' && (
          <Pressable onPress={forgotPassword}>
            <Text style={styles.switchText}>Forgot password?</Text>
          </Pressable>
        )}

        <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          <Text style={styles.switchText}>
            {mode === 'signIn'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  logo: {
    fontSize: 48,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 16,
  },
  warning: {
    backgroundColor: '#7c2d12',
    borderRadius: 8,
    padding: 12,
  },
  warningText: {
    color: '#fed7aa',
    fontSize: 13,
  },
  switchText: {
    textAlign: 'center',
    marginTop: 12,
    color: Brand.accent,
    fontSize: 14,
  },
});
