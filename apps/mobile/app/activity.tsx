import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen, spacing } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, EmptyState, Notice, QueryError } from '@/components';
import type { Activity } from '@/types';

export default function ActivityLog(): ReactNode {
  const query = useQuery({
    queryKey: ['activity'],
    queryFn: () => api<{ items: Activity[]; nextCursor: string | null }>('/v1/activity'),
  });
  return (
    <Screen>
      <AppHeader
        title="Activity log"
        subtitle="An append-only trail of agent work, user approvals, safety actions, and changes."
      />
      <Notice
        title="Receipts, not theater"
        detail="The log records what changed and who authorized it. It does not expose raw private reasoning."
        tone="blue"
      />
      <Card>
        {query.isError ? (
          <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
        ) : query.data?.items.length === 0 ? (
          <EmptyState
            title="No activity yet."
            detail="Real actions and receipts will appear here."
          />
        ) : (
          (query.data?.items ?? []).map((item) => (
            <View key={item.id} style={styles.item}>
              <Ring
                value={1}
                tone={item.actorType === 'user' ? 'yours' : 'rented'}
                size={34}
                seed={item.id}
              />
              <View style={styles.flex}>
                <OrbitText variant="label">{item.action.replaceAll('.', ' ')}</OrbitText>
                <OrbitText variant="caption">
                  {item.targetType} · {new Date(item.createdAt).toLocaleString()}
                </OrbitText>
              </View>
              <Pill>{item.actorType.toUpperCase()}</Pill>
            </View>
          ))
        )}
      </Card>
      <Button label="Back" onPress={() => router.back()} kind="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  flex: { flex: 1 },
});
