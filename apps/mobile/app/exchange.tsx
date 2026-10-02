import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, EmptyState, Notice, QueryError } from '@/components';

interface ExchangeItem {
  id: string;
  title: string;
  description: string;
  category: string;
  direction: string;
  condition: string | null;
  priceLowCents: number | null;
  priceHighCents: number | null;
  willTradeFor: string | null;
  urgency: string;
  active: boolean;
}
interface Proposal {
  id: string;
  have: ExchangeItem;
  want: ExchangeItem;
  terms: Record<string, unknown>;
  negotiation: { side: string; text: string }[];
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
    onMutate: async ({ id, value }) => {
      await client.cancelQueries({ queryKey: ['exchange', 'proposals'] });
      const previous = client.getQueryData<Proposal[]>(['exchange', 'proposals']);
      client.setQueryData<Proposal[]>(['exchange', 'proposals'], (current = []) =>
        current.map((proposal) =>
          proposal.id === id
            ? { ...proposal, myDecision: value === 'accept' ? 'accepted' : 'rejected' }
            : proposal,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) =>
      client.setQueryData(['exchange', 'proposals'], context?.previous),
    onSettled: () => void client.invalidateQueries({ queryKey: ['exchange', 'proposals'] }),
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
      {proposals.isError ? (
        <QueryError message={proposals.error.message} onRetry={() => void proposals.refetch()} />
      ) : null}
      {!proposals.isPending && !proposals.isError && proposals.data.length === 0 ? (
        <EmptyState
          title="No proposals yet."
          detail="Your matching worker will place mutually relevant handoffs here."
        />
      ) : null}
      {(proposals.isError ? [] : (proposals.data ?? [])).map((proposal) => (
        <Card key={proposal.id} tone={proposal.acceptedAt === null ? 'paper' : 'moss'}>
          <Pill tone="blue">PROPOSED HANDOFF</Pill>
          <Ring
            value={proposal.acceptedAt === null ? 0.5 : 1}
            tone="rented"
            size={48}
            seed={proposal.id}
          />
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
          {proposal.negotiation.length === 0 ? null : (
            <View style={styles.transcript}>
              <OrbitText variant="mono">NEGOTIATION TRANSCRIPT</OrbitText>
              {proposal.negotiation.map((turn, index) => (
                <View key={`${turn.side}-${String(index)}`} style={styles.turn}>
                  <Ring
                    value={(index + 1) / proposal.negotiation.length}
                    tone={turn.side === 'have' ? 'yours' : 'rented'}
                    size={28}
                    seed={`${proposal.id}-${turn.side}`}
                  />
                  <View style={styles.flex}>
                    <OrbitText variant="caption">{turn.side.toUpperCase()}</OrbitText>
                    <OrbitText>{turn.text}</OrbitText>
                  </View>
                </View>
              ))}
            </View>
          )}
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
        {items.isError ? (
          <QueryError message={items.error.message} onRetry={() => void items.refetch()} />
        ) : null}
        {!items.isPending && !items.isError && items.data.length === 0 ? (
          <OrbitText>No have or want items yet.</OrbitText>
        ) : null}
        {(items.isError ? [] : (items.data ?? [])).map((item) => (
          <View key={item.id}>
            <Pill>{item.direction.toUpperCase()}</Pill>
            <OrbitText variant="label">{item.title}</OrbitText>
            <OrbitText>{item.description}</OrbitText>
            <OrbitText variant="caption">
              {item.condition ?? 'Condition not specified'} · {item.urgency} urgency
            </OrbitText>
            <Button
              label="Edit or delete"
              kind="secondary"
              onPress={() =>
                router.push({ pathname: '/exchange/item/[id]', params: { id: item.id } })
              }
            />
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
  transcript: { gap: spacing.sm },
  turn: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
});
