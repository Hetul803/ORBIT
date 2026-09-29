import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  colors,
  Icon,
  OrbitText,
  Pill,
  Screen,
  SectionHeader,
  Skeleton,
  spacing,
} from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, Metric } from '@/components';
import { demoBrief } from '@/demo';
import type { BriefItem, DailyBrief } from '@/types';

const BriefCard = ({ item }: { item: BriefItem }): ReactNode => (
  <Pressable
    onPress={() => router.push(item.href)}
    style={({ pressed }) => pressed && styles.pressed}
  >
    <Card tone={item.needsUser ? 'ember' : item.kind === 'watcher_hit' ? 'blue' : 'paper'}>
      <View style={styles.cardTop}>
        <Pill tone={item.needsUser ? 'ember' : item.kind === 'watcher_hit' ? 'blue' : 'moss'}>
          {item.skillName}
        </Pill>
        <Icon name="arrow" size={18} />
      </View>
      <OrbitText variant="title">{item.title}</OrbitText>
      <OrbitText>{item.detail}</OrbitText>
      <View style={styles.receipt}>
        <OrbitText variant="caption">{Math.round(item.durationMs / 100) / 10}s</OrbitText>
        <OrbitText variant="caption">{Math.round(item.autonomy * 100)}% autonomous</OrbitText>
        {item.needsUser ? (
          <OrbitText variant="caption" style={styles.needs}>
            Needs you
          </OrbitText>
        ) : null}
      </View>
    </Card>
  </Pressable>
);

export default function Today(): ReactNode {
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({
    queryKey: ['brief', 'today'],
    queryFn: () => api<DailyBrief>('/v1/brief/today'),
  });
  const brief = query.data ?? demoBrief;
  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };
  return (
    <Screen contentStyle={styles.screen}>
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        tintColor={colors.ink}
      />
      <AppHeader
        title="Good morning."
        subtitle="Your private briefing—not a feed designed to keep you scrolling."
        action={
          <Pressable onPress={() => router.push('/inbox')} style={styles.inbox}>
            <Icon name="mail" />
          </Pressable>
        }
      />
      <Card tone="moss" style={styles.summary}>
        <OrbitText variant="mono">WHILE YOU WERE AWAY</OrbitText>
        <OrbitText variant="title">{brief.greeting}</OrbitText>
        <View style={styles.metrics}>
          <Metric value={String(brief.completedCount)} label="completed" />
          <Metric value={String(brief.needsUserCount)} label="needs you" />
          <Metric value={`${String(brief.timeSavedMinutesThisWeek)}m`} label="saved this week" />
        </View>
      </Card>
      <SectionHeader
        eyebrow="DAILY BRIEF"
        title="What moved"
        aside={
          <Button label="Add watcher" kind="quiet" onPress={() => router.push('/watcher/new')} />
        }
      />
      {query.isLoading ? (
        <>
          <Skeleton height={190} />
          <Skeleton height={170} />
        </>
      ) : brief.items.length === 0 ? (
        <Card>
          <OrbitText variant="title">Nothing needs you.</OrbitText>
          <OrbitText>Your agent will place completed work, matches, and decisions here.</OrbitText>
        </Card>
      ) : (
        brief.items.map((item) => <BriefCard key={item.id} item={item} />)
      )}
      {query.isError ? (
        <OrbitText variant="caption">
          Showing your last private brief while ORBIT reconnects.
        </OrbitText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 110 },
  summary: { paddingVertical: spacing.xl },
  metrics: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  receipt: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  needs: { color: colors.ember, fontFamily: 'InstrumentSans_600SemiBold' },
  pressed: { opacity: 0.72 },
  inbox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
});
