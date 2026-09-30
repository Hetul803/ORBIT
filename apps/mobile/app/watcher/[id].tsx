import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, patchBody } from '@/api';
import { AppHeader, ErrorText, Notice } from '@/components';

interface Watcher {
  id: string;
  title: string;
  active: boolean;
  hitCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  schedule: string;
  spec: Record<string, unknown>;
}

interface WatcherHit {
  id: string;
  seenAt: string | null;
  createdAt: string;
  [key: string]: unknown;
}

const hitSummary = (hit: WatcherHit): string => {
  for (const key of ['summary', 'title', 'detail', 'description']) {
    if (typeof hit[key] === 'string') return hit[key];
  }
  return 'A new result matched this watcher.';
};

export default function WatcherDetail(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const watchers = useQuery({
    queryKey: ['watchers'],
    queryFn: () => api<Watcher[]>('/v1/watchers'),
  });
  const hits = useQuery({
    queryKey: ['watcher-hits', id],
    queryFn: () => api<WatcherHit[]>(`/v1/watchers/${id}/hits`),
  });
  const watcher = watchers.data?.find((item) => item.id === id);
  const toggle = useMutation({
    mutationFn: (active: boolean) => api<Watcher>(`/v1/watchers/${id}`, patchBody({ active })),
    onMutate: async (active) => {
      await client.cancelQueries({ queryKey: ['watchers'] });
      const previous = client.getQueryData<Watcher[]>(['watchers']);
      client.setQueryData<Watcher[]>(['watchers'], (current) =>
        (current ?? []).map((item) => (item.id === id ? { ...item, active } : item)),
      );
      return { previous };
    },
    onError: (_error, _active, context) => {
      if (context?.previous !== undefined) client.setQueryData(['watchers'], context.previous);
    },
    onSuccess: (updated) => {
      client.setQueryData<Watcher[]>(['watchers'], (current) =>
        (current ?? []).map((item) => (item.id === id ? updated : item)),
      );
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/v1/watchers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.setQueryData<Watcher[]>(['watchers'], (current) =>
        (current ?? []).filter((item) => item.id !== id),
      );
      router.replace('/watchers');
    },
  });

  if (watcher === undefined) {
    return (
      <Screen>
        <AppHeader title="Opening watcher" />
        <Card>
          <OrbitText>Loading its condition and recent hits.</OrbitText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={watcher.title} subtitle="A persistent condition owned by your agent." />
      <Card tone="blue">
        <Pill tone={watcher.active ? 'moss' : 'ember'}>{watcher.active ? 'ACTIVE' : 'PAUSED'}</Pill>
        <OrbitText variant="title">
          {typeof watcher.spec.query === 'string' ? watcher.spec.query : watcher.title}
        </OrbitText>
        <OrbitText variant="caption">Schedule: {watcher.schedule}</OrbitText>
        <OrbitText variant="caption">
          Last run:{' '}
          {watcher.lastRunAt === null ? 'Never' : new Date(watcher.lastRunAt).toLocaleString()}
        </OrbitText>
        <OrbitText variant="caption">
          Next run:{' '}
          {watcher.nextRunAt === null
            ? 'Not scheduled'
            : new Date(watcher.nextRunAt).toLocaleString()}
        </OrbitText>
        <Button
          label={watcher.active ? 'Pause watcher' : 'Resume watcher'}
          onPress={() => toggle.mutate(!watcher.active)}
          loading={toggle.isPending}
          kind="secondary"
        />
      </Card>
      <Notice
        title={`${String(watcher.hitCount)} recorded hits`}
        detail="Duplicate results are suppressed by the worker before they reach this history."
        tone="moss"
      />
      {(hits.data ?? []).map((hit) => (
        <Card key={hit.id}>
          <OrbitText variant="title">{hitSummary(hit)}</OrbitText>
          <OrbitText variant="caption">{new Date(hit.createdAt).toLocaleString()}</OrbitText>
        </Card>
      ))}
      {hits.data?.length === 0 ? (
        <Card>
          <OrbitText>No matches yet. The watcher will keep checking on schedule.</OrbitText>
        </Card>
      ) : null}
      <Button
        label="Delete watcher"
        onPress={() => remove.mutate()}
        loading={remove.isPending}
        kind="danger"
      />
      {toggle.error === null ? null : <ErrorText message={toggle.error.message} />}
      {remove.error === null ? null : <ErrorText message={remove.error.message} />}
      {hits.error === null ? null : <ErrorText message={hits.error.message} />}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
