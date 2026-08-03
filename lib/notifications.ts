import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { NotificationPrefs } from '@shared';

type ExpoNotifications = typeof import('expo-notifications');

async function loadNotifications(): Promise<ExpoNotifications> {
  return import('expo-notifications');
}

function parseTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(':').map(Number);
  return { hour, minute };
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function getExpoPushToken(): Promise<string | null> {
  const Notifications = await loadNotifications();
  const ok = await ensureNotificationPermission();
  if (!ok) return null;
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data;
}

export async function scheduleLocalReminders(prefs: NotificationPrefs): Promise<void> {
  await scheduleLocalRemindersWithSkip(prefs, {});
}

export async function scheduleLocalRemindersWithSkip(
  prefs: NotificationPrefs,
  completed: { mealsLogged?: number; weightLogged?: boolean }
): Promise<void> {
  const Notifications = await loadNotifications();
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!prefs.enabled) return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  if (prefs.meal_reminders && (completed.mealsLogged ?? 0) < 3) {
    for (const time of prefs.meal_times) {
      const { hour, minute } = parseTime(time);
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Meal reminder', body: 'Log what you ate when it is convenient.' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
      });
    }
  }

  if (prefs.weigh_in_reminders && !completed.weightLogged) {
    const { hour, minute } = parseTime(prefs.weigh_in_time);
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Weigh-in reminder', body: 'A quick check-in keeps your trend honest.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  }
}
