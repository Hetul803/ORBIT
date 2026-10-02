import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Ring, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, EmptyState, ErrorText, Field, QueryError } from '@/components';
import type { CurrentUser } from '@/types';

interface Report {
  id: string;
  category: string;
  detail: string;
  status: string;
  createdAt: string;
  reporter: { id: string; displayName: string };
  subject: { id: string; displayName: string };
  actions: { id: string; action: string; reason: string }[];
}
interface Queue {
  reports: Report[];
  flaggedConversations: {
    id: string;
    intentKind: string;
    createdAt: string;
    redactionPassed: boolean;
  }[];
}
interface Audit {
  id: string;
  reportId: string;
  action: string;
  reason: string;
  moderator: { displayName: string; role: string };
  createdAt: string;
}

const ReportCard = ({ report }: { report: Report }): ReactNode => {
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: (action: 'dismiss' | 'warn' | 'suspend' | 'restore') =>
      api(`/v1/admin/reports/${report.id}/action`, jsonBody({ action, reason })),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['admin-moderation'] });
      const previous = client.getQueryData<Queue>(['admin-moderation']);
      client.setQueryData<Queue>(['admin-moderation'], (current) =>
        current === undefined
          ? current
          : { ...current, reports: current.reports.filter((entry) => entry.id !== report.id) },
      );
      return { previous };
    },
    onError: (_error, _action, context) =>
      client.setQueryData(['admin-moderation'], context?.previous),
    onSettled: () =>
      void Promise.all([
        client.invalidateQueries({ queryKey: ['admin-moderation'] }),
        client.invalidateQueries({ queryKey: ['admin-audit'] }),
      ]),
  });
  return (
    <Card tone="alert">
      <Ring value={1} tone="rented" size={42} seed={report.id} />
      <Pill tone="alert">
        {report.category.toUpperCase()} · {report.status}
      </Pill>
      <OrbitText variant="title">{report.subject.displayName}</OrbitText>
      <OrbitText>{report.detail}</OrbitText>
      <OrbitText variant="caption">
        Reported by {report.reporter.displayName} · {new Date(report.createdAt).toLocaleString()}
      </OrbitText>
      <Field label="Required moderation reason" value={reason} onChangeText={setReason} multiline />
      {(['dismiss', 'warn', 'suspend', 'restore'] as const).map((action) => (
        <Button
          key={action}
          label={action.toUpperCase()}
          kind={action === 'suspend' ? 'danger' : 'secondary'}
          disabled={reason.trim().length < 3}
          loading={mutation.isPending}
          onPress={() => mutation.mutate(action)}
        />
      ))}
      {mutation.error === null ? null : <ErrorText message={mutation.error.message} />}
    </Card>
  );
};

export default function Admin(): ReactNode {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<CurrentUser>('/v1/me') });
  const allowed = me.data?.role === 'admin' || me.data?.role === 'moderator';
  const queue = useQuery({
    queryKey: ['admin-moderation'],
    queryFn: () => api<Queue>('/v1/admin/moderation'),
    enabled: allowed,
  });
  const audit = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api<Audit[]>('/v1/admin/audit'),
    enabled: allowed,
  });
  return (
    <Screen>
      <AppHeader
        title="Moderation console"
        subtitle="A minimal role-gated queue with attributable actions and an immutable audit trail."
      />
      {me.isError ? (
        <QueryError message={me.error.message} onRetry={() => void me.refetch()} />
      ) : me.isPending ? (
        <Card>
          <OrbitText>Checking staff role…</OrbitText>
        </Card>
      ) : !allowed ? (
        <Card tone="alert">
          <OrbitText variant="title">Staff access required</OrbitText>
          <OrbitText>Your account has the {me.data.role} role.</OrbitText>
        </Card>
      ) : (
        <>
          <Pill tone="rented">ROLE · {me.data.role.toUpperCase()}</Pill>
          {queue.isError ? (
            <QueryError message={queue.error.message} onRetry={() => void queue.refetch()} />
          ) : queue.data?.reports.length === 0 ? (
            <EmptyState
              title="Moderation queue is empty."
              detail="New open or reviewing reports will appear here."
            />
          ) : (
            (queue.data?.reports ?? []).map((report) => (
              <ReportCard key={report.id} report={report} />
            ))
          )}
          {(queue.data?.flaggedConversations ?? []).map((conversation) => (
            <Card key={conversation.id}>
              <Pill tone="alert">FLAGGED CONVERSATION</Pill>
              <OrbitText>
                {conversation.intentKind} · {new Date(conversation.createdAt).toLocaleString()}
              </OrbitText>
            </Card>
          ))}
          <OrbitText variant="title">Moderation audit</OrbitText>
          {audit.isError ? (
            <QueryError message={audit.error.message} onRetry={() => void audit.refetch()} />
          ) : (
            (audit.data ?? []).map((entry) => (
              <Card key={entry.id}>
                <Pill>{entry.action.toUpperCase()}</Pill>
                <OrbitText>{entry.reason}</OrbitText>
                <OrbitText variant="caption">
                  {entry.moderator.displayName} · {entry.moderator.role} ·{' '}
                  {new Date(entry.createdAt).toLocaleString()}
                </OrbitText>
              </Card>
            ))
          )}
        </>
      )}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
