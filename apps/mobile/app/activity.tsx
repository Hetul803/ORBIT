import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Icon, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, Notice } from '@/components';
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
        {(query.data?.items ?? []).map((item) => (
          <View key={item.id} style={styles.item}>
            <View style={styles.icon}>
              <Icon name={item.actorType === 'user' ? 'person' : 'spark'} size={17} />
            </View>
            <View style={styles.flex}>
              <OrbitText variant="label">{item.action.replaceAll('.', ' ')}</OrbitText>
              <OrbitText variant="caption">
                {item.targetType} · {new Date(item.createdAt).toLocaleString()}
              </OrbitText>
            </View>
            <Pill>{item.actorType.toUpperCase()}</Pill>
          </View>
        ))}
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
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EBE5DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
