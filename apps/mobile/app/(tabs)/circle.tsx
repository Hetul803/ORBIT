import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Icon,
  OrbitText,
  Pill,
  Ring,
  Screen,
  spacing,
  useOrbitTheme,
} from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, EmptyState, Notice, QueryError } from '@/components';

interface RawIntroduction {
  id: string;
  intentKind: string;
  verdict: {
    score: number;
    reasons: string[];
    suggestedFirstActivity: string;
    oneLineReason: string;
  };
  myDecision: 'pending' | 'reveal' | 'decline';
  otherDecision: 'pending' | 'reveal';
  revealedAt: string | null;
  expiresAt: string;
}

export default function Circle(): ReactNode {
  const { colors } = useOrbitTheme();
  const query = useQuery({
    queryKey: ['introductions'],
    queryFn: () => api<RawIntroduction[]>('/v1/introductions'),
  });
  const introductions = query.isError ? [] : (query.data ?? []);
  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <AppHeader
        title="Your circle"
        subtitle="Agents talk first. Identities remain sealed until consent is mutual."
      />
      <Notice
        title="No popularity contest"
        detail="ORBIT gives you a few high-conviction introductions, not an infinite deck of people."
        tone="blue"
      />
      <View style={styles.actions}>
        <Button label="Intents" kind="secondary" onPress={() => router.push('/intents')} />
        <Button label="Exchange" kind="secondary" onPress={() => router.push('/exchange')} />
        <Button label="Groups" kind="secondary" onPress={() => router.push('/groups')} />
      </View>
      <FlashList
        data={introductions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          query.isPending ? (
            <Card>
              <OrbitText>Loading introductions…</OrbitText>
            </Card>
          ) : query.isError ? (
            <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
          ) : (
            <EmptyState
              title="Your agent is looking carefully."
              detail="Good matching gets better with honest memory and clear active intents."
              action={
                <Button
                  label="Manage intents"
                  kind="secondary"
                  onPress={() => router.push('/intents')}
                />
              }
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.intentKind} introduction`}
            onPress={() => router.push({ pathname: '/introduction/[id]', params: { id: item.id } })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Card tone={item.revealedAt === null ? 'paper' : 'yours'}>
              <View style={styles.top}>
                <Pill tone="yours">{item.intentKind.toUpperCase()}</Pill>
                <Ring value={item.verdict.score} tone="yours" size={42} seed={item.id} />
              </View>
              <OrbitText variant="title">{item.verdict.oneLineReason}</OrbitText>
              <OrbitText>{item.verdict.reasons[0]}</OrbitText>
              <View style={[styles.bottom, { borderTopColor: colors.hairline }]}>
                <OrbitText variant="caption">
                  {item.revealedAt === null
                    ? `You: ${item.myDecision} · Them: ${item.otherDecision}`
                    : 'Mutually revealed'}
                </OrbitText>
                <Icon name="arrow" size={18} />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  list: { paddingBottom: spacing.xxl },
  separator: { height: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  pressed: { opacity: 0.72 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
