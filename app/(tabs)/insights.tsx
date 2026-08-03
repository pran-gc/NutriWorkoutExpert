import { Alert, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { councilPlanSchema, type CouncilPlan, type CouncilProposal } from '@shared';

import { MarkdownText } from '@/components/MarkdownText';
import { Text, View } from '@/components/Themed';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { Brand } from '@/constants/Colors';
import { useApplyCouncilProposal, useGenerateCouncilInsight, useGenerateWeeklyInsight, useInsights, useWeeklySummary } from '@/lib/hooks';

export default function InsightsScreen() {
  const insights = useInsights();
  const router = useRouter();
  const summary = useWeeklySummary();
  const generate = useGenerateWeeklyInsight();
  const generateCouncil = useGenerateCouncilInsight();
  const applyCouncilProposal = useApplyCouncilProposal();
  const councilInsight = (insights.data ?? []).find((item) => item.kind === 'council') ?? null;
  const councilPlan = parseCouncilPlan(councilInsight?.payload);
  const weekly = (insights.data ?? []).find((item) => item.kind === 'weekly') ?? null;

  const refresh = () => {
    insights.refetch();
    summary.refetch();
  };

  const generateReview = () => generate.mutateAsync({}).catch(() => undefined);
  const generateCouncilPlan = () => generateCouncil.mutateAsync({}).catch(() => undefined);
  const applyProposal = async (proposal: CouncilProposal) => {
    if (proposal.type !== 'target_diff') return;
    if (!councilInsight) return;
    await applyCouncilProposal
      .mutateAsync({ id: councilInsight.id, input: { proposal } })
      .then(() => Alert.alert('Target updated', `${proposal.label} is now ${proposal.proposed} ${proposal.unit}.`))
      .catch(() => Alert.alert('Could not update target', 'Unlock custom targets first, then try again.'));
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={insights.isRefetching || summary.isRefetching} onRefresh={refresh} />
      }>
      <SectionTitle>Insights</SectionTitle>
      <Card style={styles.hero}>
        <Text style={styles.heroTitle}>{councilPlan ? 'Coach council' : 'Weekly review'}</Text>
        {councilPlan ? (
          <CouncilPlanView plan={councilPlan} onApplyProposal={applyProposal} applying={applyCouncilProposal.isPending} />
        ) : weekly ? (
          <MarkdownText>{weekly.content}</MarkdownText>
        ) : summary.data ? (
          <Muted>
            {summary.data.nutrition.daysLogged} food days · {summary.data.training.sessions} training
            sessions this week.
          </Muted>
        ) : summary.isError ? (
          <Muted>Could not build this week's summary.</Muted>
        ) : (
          <Muted>Building this week's picture…</Muted>
        )}
        <Button
          title={weekly ? 'Refresh review' : 'Generate review'}
          onPress={generateReview}
          loading={generate.isPending}
        />
        <Button
          title={councilPlan ? 'Refresh council plan' : 'Generate council plan'}
          onPress={generateCouncilPlan}
          loading={generateCouncil.isPending}
        />
        {generate.isError && <Muted>Could not generate right now. Try again in a bit.</Muted>}
        {generateCouncil.isError && <Muted>Could not generate the coach council right now.</Muted>}
      </Card>

      <SectionTitle>Past reviews</SectionTitle>
      {(insights.data ?? []).length === 0 ? (
        <Card>
          <Muted>Your weekly reviews and physique feedback will appear here.</Muted>
        </Card>
      ) : (
        (insights.data ?? []).map((item) => (
          <Card key={item.id}>
            <Text style={styles.itemTitle}>{labelForKind(item.kind)}</Text>
            <Muted>{item.week_start ?? item.created_at.slice(0, 10)}</Muted>
            <MarkdownText>{item.content}</MarkdownText>
          </Card>
        ))
      )}

      <SectionTitle>Physique compare</SectionTitle>
      <Card>
        <Text style={styles.itemTitle}>Private photo feedback</Text>
        <Muted>Photos are sent only for opt-in analysis and are never stored server-side.</Muted>
        <Button title="Compare photos" onPress={() => router.push('/physique-compare')} />
      </Card>
    </ScrollView>
  );
}

function parseCouncilPlan(payload: Record<string, unknown> | null | undefined): CouncilPlan | null {
  const result = councilPlanSchema.safeParse(payload?.plan);
  return result.success ? result.data : null;
}

function CouncilPlanView({
  plan,
  onApplyProposal,
  applying,
}: {
  plan: CouncilPlan;
  onApplyProposal: (proposal: CouncilProposal) => void;
  applying: boolean;
}) {
  return (
    <View style={styles.councilWrap}>
      <Text style={styles.itemTitle}>{plan.headline}</Text>
      <CoachSection title="Goal coach" summary={plan.coaches.goal.summary} proposals={plan.coaches.goal.proposals} onApplyProposal={onApplyProposal} applying={applying} />
      <CoachSection title="Nutrition coach" summary={plan.coaches.nutrition.summary} proposals={plan.coaches.nutrition.proposals} onApplyProposal={onApplyProposal} applying={applying} />
      <CoachSection title="Training coach" summary={plan.coaches.training.summary} proposals={plan.coaches.training.proposals} onApplyProposal={onApplyProposal} applying={applying} />
      {plan.checkins.map((checkin) => (
        <View key={`${checkin.detector}-${checkin.message}`} style={styles.checkin}>
          <Muted>{checkin.detector}</Muted>
          <Text style={styles.preview}>{checkin.message}</Text>
        </View>
      ))}
    </View>
  );
}

function CoachSection({
  title,
  summary,
  proposals,
  onApplyProposal,
  applying,
}: {
  title: string;
  summary: string;
  proposals: CouncilProposal[];
  onApplyProposal: (proposal: CouncilProposal) => void;
  applying: boolean;
}) {
  return (
    <View style={styles.coachSection}>
      <Text style={styles.coachTitle}>{title}</Text>
      <Text style={styles.preview}>{summary}</Text>
      {proposals.map((proposal) => (
        <View key={`${proposal.type}-${proposal.label}`} style={styles.proposal}>
          <Text style={styles.proposalText}>{proposalLabel(proposal)}</Text>
          {proposal.type === 'target_diff' ? (
            <Button title="Apply" onPress={() => onApplyProposal(proposal)} loading={applying} style={styles.proposalButton} />
          ) : (
            <Muted>{proposal.detail}</Muted>
          )}
        </View>
      ))}
    </View>
  );
}

function proposalLabel(proposal: CouncilProposal): string {
  if (proposal.type === 'target_diff') {
    return `${proposal.label}: ${proposal.current ?? 'unset'} → ${proposal.proposed} ${proposal.unit}`;
  }
  return proposal.label;
}

function labelForKind(kind: string): string {
  if (kind === 'weekly') return 'Weekly review';
  if (kind === 'physique') return 'Physique feedback';
  if (kind === 'training') return 'Training adjustment';
  if (kind === 'council') return 'Coach council';
  return 'Check-in';
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  hero: { borderWidth: 1, borderColor: Brand.accent },
  heroTitle: { fontSize: 22, fontWeight: '800' },
  itemTitle: { fontSize: 16, fontWeight: '700' },
  preview: { fontSize: 14, lineHeight: 20 },
  councilWrap: { gap: 10, backgroundColor: 'transparent' },
  coachSection: { gap: 6, backgroundColor: 'transparent', borderTopWidth: 1, borderTopColor: 'rgba(127,127,127,0.2)', paddingTop: 10 },
  coachTitle: { fontSize: 15, fontWeight: '800' },
  proposal: { gap: 6, backgroundColor: 'transparent' },
  proposalText: { fontSize: 14, fontWeight: '700' },
  proposalButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9 },
  checkin: { gap: 4, backgroundColor: 'transparent', borderTopWidth: 1, borderTopColor: 'rgba(127,127,127,0.2)', paddingTop: 8 },
});
