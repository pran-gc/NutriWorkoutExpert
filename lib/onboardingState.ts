import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

const keyForUser = (userId: string) => `nwe:onboarding-completed:${userId}`;

export async function hasOnboardingCompletedLocally(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(keyForUser(userId))) === 'true';
}

export async function markOnboardingCompletedLocally(userId?: string): Promise<void> {
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    resolvedUserId = session?.user.id;
  }
  if (!resolvedUserId) return;
  await AsyncStorage.setItem(keyForUser(resolvedUserId), 'true');
}
