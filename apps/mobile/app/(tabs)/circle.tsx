import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, colors, Icon, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, Notice } from '@/components';
import { demoIntroductions } from '@/demo';

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
  const query = useQuery({
    queryKey: ['introductions'],
    queryFn: () => api<RawIntroduction[]>('/v1/introductions'),
  });
  const introductions = useMemo(
    () =>
      query.data ??
      demoIntroductions.map((intro) => ({
        id: intro.id,
        intentKind: intro.intentKind,
        verdict: {
          score: intro.score ?? 0,
          reasons: intro.reasons,
          suggestedFirstActivity: intro.suggestedFirstActivity ?? '',
          oneLineReason: intro.oneLineReason ?? '',
        },
        myDecision: intro.myDecision,
        otherDecision:
          intro.theirDecision === 'decline' ? ('pending' as const) : intro.theirDecision,
        revealedAt: intro.revealed ? intro.createdAt : null,
        expiresAt: intro.expiresAt,
      })),
    [query.data],
  );
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
        <Button label="Exchange" kind="secondary" onPress={() => router.push('/exchange')} />
        <Button label="Groups" kind="secondary" onPress={() => router.push('/groups')} />
      </View>
      <FlashList
        data={introductions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Card>
            <OrbitText variant="title">Your agent is looking carefully.</OrbitText>
            <OrbitText>
              Good matching gets better with honest memory and clear active intents.
            </OrbitText>
          </Card>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/introduction/[id]', params: { id: item.id } })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Card tone={item.revealedAt === null ? 'paper' : 'moss'}>
              <View style={styles.top}>
                <Pill tone="moss">{item.intentKind.toUpperCase()}</Pill>
                <OrbitText variant="title">{item.verdict.score}</OrbitText>
              </View>
              <OrbitText variant="title">{item.verdict.oneLineReason}</OrbitText>
              <OrbitText>{item.verdict.reasons[0]}</OrbitText>
              <View style={styles.bottom}>
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
  list: { paddingBottom: 120 },
  separator: { height: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  pressed: { opacity: 0.72 },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
