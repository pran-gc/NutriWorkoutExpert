import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch } from 'react-native';

import type { NotificationPrefs } from '@shared';

import { Text, View } from '@/components/Themed';
import { Button, Card, Input, Muted, SectionTitle } from '@/components/ui';
import { useNotificationPrefs, useRegisterPushToken, useUpdateNotificationPrefs } from '@/lib/hooks';
import { getExpoPushToken, scheduleLocalReminders } from '@/lib/notifications';

export default function NotificationsScreen() {
  const prefsQuery = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();
  const registerToken = useRegisterPushToken();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    if (prefsQuery.data) setPrefs(prefsQuery.data);
  }, [prefsQuery.data]);

  const patch = (p: Partial<NotificationPrefs>) => {
    setPrefs((current) => (current ? { ...current, ...p } : current));
  };

  const save = async () => {
    if (!prefs) return;
    try {
      const saved = await updatePrefs.mutateAsync(prefs);
      await scheduleLocalReminders(saved);
      if (saved.enabled) {
        const token = await getExpoPushToken();
        if (token) {
          await registerToken.mutateAsync({
            expo_token: token,
            platform: Platform.OS === 'android' ? 'android' : 'ios',
            device_name: Platform.OS,
          });
        }
      }
      Alert.alert('Notifications saved', 'Your reminder settings are updated.');
    } catch (e) {
      Alert.alert('Could not save notifications', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  if (prefsQuery.isLoading || !prefs) {
    return (
      <View style={styles.center}>
        <Muted>Loading notification settings…</Muted>
      </View>
    );
  }
  if (prefsQuery.isError) {
    return (
      <View style={styles.center}>
        <Muted>Could not load notification settings.</Muted>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionTitle>Notifications</SectionTitle>
      <Card>
        <Row label="Enable reminders" value={prefs.enabled} onValueChange={(enabled) => patch({ enabled })} />
        <Row
          label="Meal reminders"
          value={prefs.meal_reminders}
          onValueChange={(meal_reminders) => patch({ meal_reminders })}
        />
        <Input
          placeholder="Meal times, comma separated"
          value={prefs.meal_times.join(', ')}
          onChangeText={(text) =>
            patch({ meal_times: text.split(',').map((item) => item.trim()).filter(Boolean) })
          }
        />
        <Row
          label="Weigh-in reminder"
          value={prefs.weigh_in_reminders}
          onValueChange={(weigh_in_reminders) => patch({ weigh_in_reminders })}
        />
        <Input
          placeholder="Weigh-in time"
          value={prefs.weigh_in_time}
          onChangeText={(weigh_in_time) => patch({ weigh_in_time })}
        />
        <Row
          label="Weekly review push"
          value={prefs.weekly_review}
          onValueChange={(weekly_review) => patch({ weekly_review })}
        />
        <Muted>Quiet hours: {prefs.quiet_hours.start} to {prefs.quiet_hours.end}</Muted>
      </Card>
      <Button title="Save notifications" onPress={save} loading={updatePrefs.isPending} />
    </ScrollView>
  );
}

function Row({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  row: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: { fontSize: 15, fontWeight: '600' },
});
