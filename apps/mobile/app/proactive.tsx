import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, EmptyState, ErrorText, QueryError } from '@/components';
import type { ProactiveDashboard, ProactivePolicy, ProactiveProposal } from '@/types';

const label = (value: string): string => value.replaceAll('_', ' ').toLowerCase();

const proposalTone = (proposal: ProactiveProposal): 'paper' | 'ember' | 'moss' =>
  proposal.touchesOthers ? 'ember' : proposal.level === 'act' ? 'moss' : 'paper';

const ProposalCard = ({
  proposal,
  onRespond,
  busy,
}: {
  proposal: ProactiveProposal;
  onRespond: (id: string, decision: 'accept' | 'dismiss' | 'snooze') => Promise<void>;
  busy: boolean;
}): ReactNode => (
  <Card tone={proposalTone(proposal)}>
    <View style={styles.row}>
      <Pill tone={proposal.touchesOthers ? 'ember' : proposal.level === 'act' ? 'moss' : 'neutral'}>
        {proposal.level.toUpperCase()}
      </Pill>
      <OrbitText variant="mono">{label(proposal.type)}</OrbitText>
    </View>
    <OrbitText variant="title">{proposal.title}</OrbitText>
    <OrbitText>{proposal.detail}</OrbitText>
    <OrbitText variant="caption">
      {proposal.touchesOthers
        ? 'Requires your review; ORBIT will not contact anyone or change your calendar.'
        : proposal.reversible
          ? 'Reversible local suggestion.'
          : 'Review before continuing.'}
      {proposal.dueAt === null ? '' : ` Due ${new Date(proposal.dueAt).toLocaleString()}.`}
    </OrbitText>
    {proposal.status === 'proposed' || proposal.status === 'observed' ? (
      <View style={styles.actions}>
        <Button
          label="Accept"
          onPress={() => void onRespond(proposal.id, 'accept')}
          loading={busy}
        />
        <Button
          label="Snooze"
          kind="secondary"
          onPress={() => void onRespond(proposal.id, 'snooze')}
          loading={busy}
        />
        <Button
          label="Dismiss"
          kind="quiet"
          onPress={() => void onRespond(proposal.id, 'dismiss')}
          loading={busy}
        />
      </View>
    ) : (
      <OrbitText variant="caption">{proposal.status.toUpperCase()}</OrbitText>
    )}
  </Card>
);

const PolicyCard = ({
  policy,
  onLevel,
  onApprove,
  busy,
}: {
  policy: ProactivePolicy;
  onLevel: (type: string, level: 'observe' | 'propose' | 'act') => Promise<void>;
  onApprove: (type: string) => Promise<void>;
  busy: boolean;
}): ReactNode => (
  <Card tone="moss">
    <OrbitText variant="label">{label(policy.type)}</OrbitText>
    <OrbitText variant="caption">
      Current level: {policy.level}. {policy.consecutiveAccepts} accepts;{' '}
      {policy.consecutiveDismissals} dismissals.
    </OrbitText>
    <View style={styles.actions}>
      <Button
        label="Observe"
        kind={policy.level === 'observe' ? 'primary' : 'secondary'}
        onPress={() => void onLevel(policy.type, 'observe')}
        loading={busy}
      />
      <Button
        label="Propose"
        kind={policy.level === 'propose' ? 'primary' : 'secondary'}
        onPress={() => void onLevel(policy.type, 'propose')}
        loading={busy}
      />
      {policy.promotionOfferedAt === null ? null : (
        <Button
          label="Approve safe Act"
          onPress={() => void onApprove(policy.type)}
          loading={busy}
        />
      )}
    </View>
    {policy.lastChangedReason === null ? null : (
      <OrbitText variant="caption">{policy.lastChangedReason}</OrbitText>
    )}
  </Card>
);

export default function Proactive(): ReactNode {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['proactive'],
    queryFn: () => api<ProactiveDashboard>('/v1/proactive'),
  });
  const refresh = async (): Promise<void> => {
    await query.refetch();
    await client.invalidateQueries({ queryKey: ['brief', 'today'] });
  };
  const respond = async (id: string, decision: 'accept' | 'dismiss' | 'snooze'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/proactive/${id}/respond`, jsonBody({ decision }));
      await refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not record that choice.');
    } finally {
      setBusy(false);
    }
  };
  const setLevel = async (type: string, level: 'observe' | 'propose' | 'act'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/proactive/policies/${type.toUpperCase()}`, {
        method: 'PUT',
        body: JSON.stringify({ level: level.toUpperCase() }),
      });
      await refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not change that setting.');
    } finally {
      setBusy(false);
    }
  };
  const approve = async (type: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/proactive/policies/${type.toUpperCase()}/approve-act`, jsonBody({}));
      await refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'That Act level is not ready.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Proactive"
        subtitle="Evidence-backed suggestions, with your autonomy setting visible on every one."
      />
      <Card tone="paper">
        <OrbitText variant="label">HOW IT WORKS</OrbitText>
        <OrbitText>
          Observe records a signal. Propose asks you first. Act is available only after five accepts
          and an explicit opt-in, and never for messages, calendars, or other people.
        </OrbitText>
      </Card>
      {query.isPending ? <OrbitText>Checking your orbit…</OrbitText> : null}
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data?.proposals.length === 0 ? (
        <EmptyState
          title="No suggestions yet."
          detail="ORBIT creates these from source-backed commitments, watcher results, and state you have chosen to keep."
        />
      ) : null}
      <View style={styles.list}>
        {query.data?.proposals.map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} onRespond={respond} busy={busy} />
        ))}
      </View>
      {query.data === undefined || query.data.policies.length === 0 ? null : (
        <>
          <OrbitText variant="title">Autonomy controls</OrbitText>
          <View style={styles.list}>
            {query.data.policies.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                onLevel={setLevel}
                onApprove={approve}
                busy={busy}
              />
            ))}
          </View>
        </>
      )}
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Refresh" kind="quiet" onPress={() => void refresh()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
