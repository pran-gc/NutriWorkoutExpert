import { describe, expect, it } from 'vitest';

import { canSendNotification, isQuietHour } from './notifications.ts';

const prefs = {
  enabled: true,
  meal_reminders: true,
  weigh_in_reminders: false,
  weekly_review: true,
  meal_times: ['08:00'],
  weigh_in_time: '08:00',
  quiet_hours: { start: '21:00', end: '07:00' },
};

describe('notification gating', () => {
  it('handles quiet hours across midnight', () => {
    expect(isQuietHour('22:00', prefs)).toBe(true);
    expect(isQuietHour('06:30', prefs)).toBe(true);
    expect(isQuietHour('08:00', prefs)).toBe(false);
  });

  it('respects category toggles', () => {
    expect(canSendNotification('08:00', prefs, 'meal')).toBe(true);
    expect(canSendNotification('08:00', prefs, 'weigh_in')).toBe(false);
    expect(canSendNotification('22:00', prefs, 'weekly_review')).toBe(false);
  });
});
