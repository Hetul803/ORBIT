import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen, spacing } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, EmptyState, QueryError } from '@/components';

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
    <Screen scroll={false} contentStyle={styles.screen}>
      <FlashList
        data={query.isError ? [] : (query.data ?? [])}
        keyExtractor={(watcher) => watcher.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppHeader
              title="Watchers"
              subtitle="Persistent public conditions your agent checks without demanding your attention."
            />
            <Button label="Add watcher" onPress={() => router.push('/watcher/new')} />
          </View>
        }
        ListEmptyComponent={
          query.isPending ? (
            <Card>
              <OrbitText>Loading watchers…</OrbitText>
            </Card>
          ) : query.isError ? (
            <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
          ) : (
            <EmptyState
              title="No watchers yet."
              detail="Create one for a price, listing, opportunity feed, or deadline page."
              action={
                <Button label="Create first watcher" onPress={() => router.push('/watcher/new')} />
              }
            />
          )
        }
        renderItem={({ item: watcher }) => (
          <Card tone="rented">
            <View style={styles.top}>
              <Ring value={watcher.active ? 1 : 0} tone="rented" size={42} seed={watcher.id} />
              <Pill tone={watcher.active ? 'yours' : 'alert'}>
                {watcher.active ? 'ACTIVE' : 'PAUSED'}
              </Pill>
            </View>
            <OrbitText variant="title">{watcher.title}</OrbitText>
            <OrbitText>
              {typeof watcher.spec.query === 'string' ? watcher.spec.query : ''}
            </OrbitText>
            <OrbitText variant="caption">
              Source: {typeof watcher.spec.source === 'string' ? watcher.spec.source : 'unknown'} ·{' '}
              {String(watcher.hitCount)} hits · next{' '}
              {watcher.nextRunAt === null
                ? 'not scheduled'
                : new Date(watcher.nextRunAt).toLocaleString()}
            </OrbitText>
            <Button
              label="Open watcher"
              onPress={() => router.push({ pathname: '/watcher/[id]', params: { id: watcher.id } })}
              kind="secondary"
            />
          </Card>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button label="Back" onPress={() => router.back()} kind="secondary" />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  list: { paddingBottom: spacing.xxl },
  header: { gap: spacing.lg, paddingBottom: spacing.lg },
  footer: { paddingTop: spacing.lg },
  separator: { height: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
