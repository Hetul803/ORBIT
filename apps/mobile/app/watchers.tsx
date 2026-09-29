import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader } from '@/components';

interface Watcher {
  id: string;
  title: string;
  active: boolean;
  hitCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  spec: Record<string, unknown>;
}

export default function Watchers(): ReactNode {
  const query = useQuery({ queryKey: ['watchers'], queryFn: () => api<Watcher[]>('/v1/watchers') });
  return (
    <Screen>
      <AppHeader
        title="Watchers"
        subtitle="Persistent conditions your agent checks without demanding your attention."
      />
      <Button label="Add watcher" onPress={() => router.push('/watcher/new')} />
      {(query.data ?? []).map((watcher) => (
        <Card key={watcher.id} tone="blue">
          <Pill tone={watcher.active ? 'moss' : 'ember'}>
            {watcher.active ? 'ACTIVE' : 'PAUSED'}
          </Pill>
          <OrbitText variant="title">{watcher.title}</OrbitText>
          <OrbitText>{typeof watcher.spec.query === 'string' ? watcher.spec.query : ''}</OrbitText>
          <OrbitText variant="caption">
            {String(watcher.hitCount)} hits · next{' '}
            {watcher.nextRunAt === null
              ? 'not scheduled'
              : new Date(watcher.nextRunAt).toLocaleString()}
          </OrbitText>
        </Card>
      ))}
      <Button label="Back" onPress={() => router.back()} kind="secondary" />
    </Screen>
  );
}
