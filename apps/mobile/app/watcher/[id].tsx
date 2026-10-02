import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, patchBody } from '@/api';
import { AppHeader, EmptyState, ErrorText, Notice, QueryError } from '@/components';

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

const hitValue = (hit: WatcherHit, key: string): string | null =>
  typeof hit[key] === 'string' ? hit[key] : null;

const hitSummary = (hit: WatcherHit): string => {
  for (const key of ['summary', 'title', 'detail', 'description']) {
    if (typeof hit[key] === 'string') return hit[key];
  }
  return 'A new result matched this watcher.';
};

export default function WatcherDetail(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  if (watchers.isError) {
    return (
      <Screen>
        <AppHeader title="Watcher" />
        <QueryError message={watchers.error.message} onRetry={() => void watchers.refetch()} />
      </Screen>
    );
  }
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
      {hits.isError ? (
        <QueryError message={hits.error.message} onRetry={() => void hits.refetch()} />
      ) : (
        (hits.data ?? []).map((hit) => (
          <Card key={hit.id}>
            <OrbitText variant="title">{hitSummary(hit)}</OrbitText>
            {hitValue(hit, 'changeSummary') === null ? null : (
              <OrbitText>{hitValue(hit, 'changeSummary')}</OrbitText>
            )}
            {hitValue(hit, 'source') === null ? null : (
              <OrbitText variant="caption">Source: {hitValue(hit, 'source')}</OrbitText>
            )}
            {hitValue(hit, 'href') === null ? null : (
              <OrbitText variant="caption">Candidate: {hitValue(hit, 'href')}</OrbitText>
            )}
            <OrbitText variant="caption">{new Date(hit.createdAt).toLocaleString()}</OrbitText>
          </Card>
        ))
      )}
      {hits.data?.length === 0 ? (
        <EmptyState title="No matches yet." detail="The watcher will keep checking on schedule." />
      ) : null}
      {confirmDelete ? (
        <Card tone="alert">
          <OrbitText variant="title">Delete this watcher?</OrbitText>
          <OrbitText>
            Its condition and hit history will be removed. This cannot be undone.
          </OrbitText>
          <Button
            label="Yes, delete watcher"
            onPress={() => remove.mutate()}
            loading={remove.isPending}
            kind="danger"
          />
          <Button label="Keep watcher" onPress={() => setConfirmDelete(false)} kind="secondary" />
        </Card>
      ) : (
        <Button label="Delete watcher" onPress={() => setConfirmDelete(true)} kind="danger" />
      )}
      {toggle.error === null ? null : <ErrorText message={toggle.error.message} />}
      {remove.error === null ? null : <ErrorText message={remove.error.message} />}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
