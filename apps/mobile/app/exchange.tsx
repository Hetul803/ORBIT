import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, Notice } from '@/components';

interface ExchangeItem {
  id: string;
  title: string;
  description: string;
  category: string;
  direction: string;
}
interface Proposal {
  id: string;
  have: ExchangeItem;
  want: ExchangeItem;
  terms: Record<string, unknown>;
  myDecision: string;
  otherDecision: string;
  acceptedAt: string | null;
  handoff: { handle: string | null; firstName: string } | null;
  moneyNotice: string;
}

const proposalSummary = (proposal: Proposal): string =>
  typeof proposal.terms.summary === 'string'
    ? proposal.terms.summary
    : 'A direct exchange after mutual approval.';

export default function Exchange(): ReactNode {
  const client = useQueryClient();
  const proposals = useQuery({
    queryKey: ['exchange', 'proposals'],
    queryFn: () => api<Proposal[]>('/v1/exchange/proposals'),
  });
  const items = useQuery({
    queryKey: ['exchange', 'items'],
    queryFn: () => api<ExchangeItem[]>('/v1/exchange/items'),
  });
  const decision = useMutation({
    mutationFn: ({ id, value }: { id: string; value: 'accept' | 'reject' }) =>
      api(`/v1/exchange/proposals/${id}/decision`, jsonBody({ decision: value })),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['exchange'] }),
  });
  return (
    <Screen>
      <AppHeader
        title="Exchange"
        subtitle="Agents find useful handoffs. ORBIT handles no money and takes no transaction fee."
      />
      <Notice
        title="Direct and local"
        detail="Both people approve the terms. Settle payment independently and use public, safe handoff locations."
        tone="moss"
      />
      {(proposals.data ?? []).map((proposal) => (
        <Card key={proposal.id} tone={proposal.acceptedAt === null ? 'paper' : 'moss'}>
          <Pill tone="blue">PROPOSED HANDOFF</Pill>
          <View style={styles.pair}>
            <View style={styles.flex}>
              <OrbitText variant="caption">HAVE</OrbitText>
              <OrbitText variant="title">{proposal.have.title}</OrbitText>
            </View>
            <View style={styles.flex}>
              <OrbitText variant="caption">WANT</OrbitText>
              <OrbitText variant="title">{proposal.want.title}</OrbitText>
            </View>
          </View>
          <OrbitText>{proposalSummary(proposal)}</OrbitText>
          <OrbitText variant="caption">
            You: {proposal.myDecision} · Them: {proposal.otherDecision}
          </OrbitText>
          {proposal.myDecision === 'pending' ? (
            <>
              <Button
                label="Accept proposal"
                onPress={() => decision.mutate({ id: proposal.id, value: 'accept' })}
              />
              <Button
                label="Reject"
                onPress={() => decision.mutate({ id: proposal.id, value: 'reject' })}
                kind="quiet"
              />
            </>
          ) : null}
          {proposal.handoff === null ? null : (
            <Notice
              title="Handoff unlocked"
              detail={`${proposal.handoff.firstName}${proposal.handoff.handle === null ? '' : ` · @${proposal.handoff.handle}`}. Choose a public place.`}
              tone="blue"
            />
          )}
          <OrbitText variant="caption">{proposal.moneyNotice}</OrbitText>
        </Card>
      ))}
      <Card>
        <OrbitText variant="mono">YOUR EXCHANGE INTENTS</OrbitText>
        {(items.data ?? []).map((item) => (
          <View key={item.id}>
            <Pill>{item.direction.toUpperCase()}</Pill>
            <OrbitText variant="label">{item.title}</OrbitText>
            <OrbitText>{item.description}</OrbitText>
          </View>
        ))}
        <Button
          label="Add have / want item"
          onPress={() => router.push('/exchange/new')}
          kind="secondary"
        />
      </Card>
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: spacing.lg },
  flex: { flex: 1, gap: spacing.xs },
});
