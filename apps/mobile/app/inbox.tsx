import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, Field, Notice } from '@/components';

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
    onSuccess: () => void client.invalidateQueries({ queryKey: ['inbox'] }),
  });
  return (
    <Card tone={item.triage === 'escalated' ? 'ember' : 'paper'}>
      <Pill tone={item.triage === 'escalated' ? 'ember' : 'blue'}>{item.triage.toUpperCase()}</Pill>
      <OrbitText variant="title">{item.subject}</OrbitText>
      <OrbitText>{item.body}</OrbitText>
      {item.approvedAt === null && item.agentReply !== null ? (
        <>
          <Field label="Agent’s draft" value={reply} onChangeText={setReply} multiline />
          <Button
            label="Approve and send"
            onPress={() => mutation.mutate('approve')}
            loading={mutation.isPending}
            disabled={!reply}
          />
          <Button label="Decline" onPress={() => mutation.mutate('decline')} kind="quiet" />
        </>
      ) : (
        <OrbitText variant="caption">
          {item.approvedAt === null ? 'No response proposed.' : 'Approved with a receipt.'}
        </OrbitText>
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
      {(query.data ?? []).map((item) => (
        <InboxCard key={item.id} item={item} />
      ))}
      {query.data?.length === 0 ? (
        <Card>
          <OrbitText variant="title">Inbox zero, honestly.</OrbitText>
          <OrbitText>Nothing is hidden behind a badge.</OrbitText>
        </Card>
      ) : null}
      <Button label="Back" onPress={() => router.back()} kind="secondary" />
    </Screen>
  );
}
