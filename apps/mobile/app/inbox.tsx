import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, EmptyState, Field, Notice, QueryError } from '@/components';

interface InboxItem {
  id: string;
  kind: string;
  subject: string;
  body: string;
  triage: string;
  agentReply: string | null;
  approvedAt: string | null;
  createdAt: string;
}

const InboxCard = ({ item }: { item: InboxItem }): ReactNode => {
  const client = useQueryClient();
  const [reply, setReply] = useState(item.agentReply ?? '');
  const mutation = useMutation({
    mutationFn: (decision: 'approve' | 'decline') =>
      api(
        `/v1/inbox/${item.id}/${decision}`,
        jsonBody(decision === 'approve' ? { editedReply: reply } : {}),
      ),
    onMutate: async (decision) => {
      await client.cancelQueries({ queryKey: ['inbox'] });
      const previous = client.getQueryData<InboxItem[]>(['inbox']);
      client.setQueryData<InboxItem[]>(['inbox'], (current = []) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                approvedAt: decision === 'approve' ? new Date().toISOString() : entry.approvedAt,
                triage: decision === 'decline' ? 'auto_declined' : 'held',
                agentReply: decision === 'approve' ? reply : entry.agentReply,
              }
            : entry,
        ),
      );
      return { previous };
    },
    onError: (_error, _decision, context) => client.setQueryData(['inbox'], context?.previous),
    onSettled: () => void client.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const skillId = item.kind.startsWith('skill_share:')
    ? item.kind.slice('skill_share:'.length)
    : null;
  const adopt = useMutation({
    mutationFn: async () => {
      if (skillId === null) return;
      await api(`/v1/skills/${skillId}/adopt`, jsonBody({}));
      await api(
        `/v1/inbox/${item.id}/approve`,
        jsonBody({ editedReply: 'Accepted shared skill.' }),
      );
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ['inbox'] }),
  });
  return (
    <Card tone={item.triage === 'escalated' ? 'ember' : 'paper'}>
      <Pill tone={item.triage === 'escalated' ? 'ember' : 'blue'}>{item.triage.toUpperCase()}</Pill>
      <OrbitText variant="title">{item.subject}</OrbitText>
      <OrbitText>{item.body}</OrbitText>
      {skillId !== null && item.approvedAt === null ? (
        <>
          <Button
            label="Review and accept skill"
            onPress={() => adopt.mutate()}
            loading={adopt.isPending}
          />
          <OrbitText variant="caption">
            Acceptance creates a versioned adoption linked to the source skill. Future source
            updates require review.
          </OrbitText>
        </>
      ) : null}
      {skillId === null && item.approvedAt === null && item.agentReply !== null ? (
        <>
          <Field label="Agent’s draft" value={reply} onChangeText={setReply} multiline />
          <Button
            label="Approve draft"
            onPress={() => mutation.mutate('approve')}
            loading={mutation.isPending}
            disabled={!reply}
          />
          <Button label="Decline" onPress={() => mutation.mutate('decline')} kind="quiet" />
        </>
      ) : (
        <OrbitText variant="caption">
          {skillId !== null && item.approvedAt !== null
            ? 'Skill accepted. Its source lineage and version are recorded.'
            : item.approvedAt === null
              ? 'No response proposed.'
              : 'Approved with a receipt. Not sent; outbound mail is disabled.'}
        </OrbitText>
      )}
      {adopt.error === null ? null : (
        <OrbitText accessibilityRole="alert">{adopt.error.message}</OrbitText>
      )}
    </Card>
  );
};

export default function Inbox(): ReactNode {
  const query = useQuery({ queryKey: ['inbox'], queryFn: () => api<InboxItem[]>('/v1/inbox') });
  return (
    <Screen>
      <AppHeader
        title="Approval inbox"
        subtitle="Your agent can screen and draft. Only you can authorize an external reply."
      />
      <Notice
        title="Approval is explicit"
        detail="Editing a draft does not approve it. The send action creates an immutable receipt."
        tone="moss"
      />
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        (query.data ?? []).map((item) => <InboxCard key={item.id} item={item} />)
      )}
      {query.data?.length === 0 ? (
        <EmptyState title="Inbox zero, honestly." detail="Nothing is hidden behind a badge." />
      ) : null}
      <Button label="Back" onPress={() => router.back()} kind="secondary" />
    </Screen>
  );
}
