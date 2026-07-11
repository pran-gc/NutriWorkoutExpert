import type { NotificationPrefs } from './types.ts';

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function isQuietHour(localTime: string, prefs: Pick<NotificationPrefs, 'quiet_hours'>): boolean {
  const now = minutes(localTime);
  const start = minutes(prefs.quiet_hours.start);
  const end = minutes(prefs.quiet_hours.end);
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export function canSendNotification(
  localTime: string,
  prefs: NotificationPrefs,
  category: 'meal' | 'weigh_in' | 'weekly_review'
): boolean {
  if (!prefs.enabled || isQuietHour(localTime, prefs)) return false;
  if (category === 'meal') return prefs.meal_reminders;
  if (category === 'weigh_in') return prefs.weigh_in_reminders;
  return prefs.weekly_review;
}
