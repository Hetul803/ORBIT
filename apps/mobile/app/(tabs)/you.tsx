import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, RowLink } from '@/components';
import { useAuthStore } from '@/store';
import type { CurrentUser } from '@/types';

export default function You(): ReactNode {
  const signOut = useAuthStore((state) => state.signOut);
  const query = useQuery({ queryKey: ['me'], queryFn: () => api<CurrentUser>('/v1/me') });
  const user = query.data;
  return (
    <Screen>
      <AppHeader
        title={user?.displayName ?? 'Your orbit'}
        subtitle="Your controls, receipts, memory, and trust boundaries live together."
      />
      <Card tone="moss">
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <OrbitText variant="title">
              {(user?.displayName ?? 'O').slice(0, 1).toUpperCase()}
            </OrbitText>
          </View>
          <View style={styles.flex}>
            <OrbitText variant="label">{user?.email ?? 'Signed in privately'}</OrbitText>
            <OrbitText variant="caption">
              {user?.handle === null || user?.handle === undefined
                ? 'No public handle'
                : `@${user.handle}`}
            </OrbitText>
          </View>
          <Pill tone="moss">18+ VERIFIED</Pill>
        </View>
      </Card>
      <Card>
        <RowLink
          title="Memory"
          detail="See, correct, or remove what your agent knows"
          onPress={() => router.push('/memory')}
        />
        <RowLink
          title="Activity log"
          detail="Every action and approval receipt"
          onPress={() => router.push('/activity')}
          icon="eye"
        />
        <RowLink
          title="Inbox & approvals"
          detail="Nothing outbound without your say"
          onPress={() => router.push('/inbox')}
          icon="mail"
        />
        <RowLink
          title="Safety center"
          detail="Block, report, check-ins, and emergency controls"
          onPress={() => router.push('/safety')}
          icon="shield"
        />
        <RowLink
          title="Settings & model keys"
          detail="Trust modes, providers, export, deletion"
          onPress={() => router.push('/settings')}
        />
      </Card>
      <Button
        label="Sign out"
        kind="secondary"
        onPress={() => void signOut().then(() => router.replace('/sign-in'))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFCF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
