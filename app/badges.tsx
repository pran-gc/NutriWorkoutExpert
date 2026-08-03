import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { BadgeBurst } from '@/components/motion';
import { Text, View } from '@/components/Themed';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { celebrate } from '@/lib/celebrations';
import { useBadges } from '@/lib/hooks';

export default function BadgesScreen() {
  const badges = useBadges();
  const earnedRows = badges.data?.earned ?? [];
  const unseenKey = useMemo(
    () => earnedRows.filter((row) => !row.seen_at).map((row) => row.badge_id).sort().join('|'),
    [earnedRows]
  );
  const celebratedKey = useRef<string | null>(null);
  useEffect(() => {
    if (unseenKey && celebratedKey.current !== unseenKey) {
      celebratedKey.current = unseenKey;
      celebrate('badge').catch(() => undefined);
    }
  }, [unseenKey]);

  if (badges.isLoading) {
    return (
      <View style={styles.center}>
        <Muted>Loading badges…</Muted>
      </View>
    );
  }
  if (badges.isError) {
    return (
      <View style={styles.center}>
        <Muted>Could not load badges.</Muted>
      </View>
    );
  }
  const earned = new Set(earnedRows.map((row) => row.badge_id));
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionTitle>Badges</SectionTitle>
      {(badges.data?.catalog ?? []).map((badge) => {
        const isEarned = earned.has(badge.id);
        const isUnseen = earnedRows.some((row) => row.badge_id === badge.id && !row.seen_at);
        return (
          <Card key={badge.id} style={[styles.badge, isEarned && styles.earned]}>
            <View style={styles.badgeHeader}>
              <BadgeBurst visible={isUnseen} />
              <Text style={styles.title}>{badge.title}</Text>
            </View>
            <Muted>{badge.description}</Muted>
            <Text style={[styles.status, isEarned ? styles.statusEarned : styles.statusLocked]}>
              {isUnseen ? 'Newly earned' : isEarned ? 'Earned' : 'Locked'}
            </Text>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  badge: { borderWidth: 1, borderColor: 'transparent' },
  badgeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'transparent' },
  earned: { borderColor: Brand.accent },
  title: { fontSize: 17, fontWeight: '700' },
  status: { fontSize: 13, fontWeight: '700' },
  statusEarned: { color: Brand.accent },
  statusLocked: { opacity: 0.5 },
});
