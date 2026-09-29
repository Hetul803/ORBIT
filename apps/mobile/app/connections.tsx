import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, Notice } from '@/components';

interface Connection {
  id: string;
  provider: string;
  scopes: string[];
  status: string;
  lastSyncedAt: string | null;
}

export default function Connections(): ReactNode {
  const query = useQuery({
    queryKey: ['connections'],
    queryFn: () => api<Connection[]>('/v1/connections'),
  });
  return (
    <Screen>
      <AppHeader
        title="Connections"
        subtitle="Explicit, narrow permissions for email, calendar, and files. No social scraping—ever."
      />
      <Notice
        title="Read narrowly, write only after approval"
        detail="Connector tokens are encrypted. Every outbound write requires a user approval receipt."
        tone="moss"
      />
      {(query.data ?? []).map((connection) => (
        <Card key={connection.id}>
          <Pill tone={connection.status === 'ACTIVE' ? 'moss' : 'ember'}>
            {connection.provider} · {connection.status}
          </Pill>
          <OrbitText variant="title">{connection.scopes.join(', ')}</OrbitText>
          <OrbitText variant="caption">
            Last sync:{' '}
            {connection.lastSyncedAt === null
              ? 'Never'
              : new Date(connection.lastSyncedAt).toLocaleString()}
          </OrbitText>
        </Card>
      ))}
      {query.data?.length === 0 ? (
        <Card>
          <OrbitText variant="title">No external accounts connected.</OrbitText>
          <OrbitText>
            ORBIT remains useful with its private memory, skills, exchange, and manual watchers.
            OAuth connection setup becomes available when provider credentials are configured.
          </OrbitText>
        </Card>
      ) : null}
      <Button label="Back" onPress={() => router.back()} kind="secondary" />
    </Screen>
  );
}
