import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Icon,
  OrbitText,
  Pill,
  Ring,
  radii,
  Screen,
  SectionHeader,
  Skeleton,
  spacing,
  useOrbitTheme,
} from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, EmptyState, Metric, QueryError } from '@/components';
import type { BriefItem, DailyBrief } from '@/types';
import type { LifeItem } from '@/types';

const BriefCard = ({ item }: { item: BriefItem }): ReactNode => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Open ${item.title}`}
    onPress={() => router.push(item.href as Href)}
    style={({ pressed }) => pressed && styles.pressed}
  >
    <Card tone={item.needsUser ? 'alert' : item.kind === 'watcher_hit' ? 'rented' : 'paper'}>
      <View style={styles.cardTop}>
        <Pill tone={item.needsUser ? 'alert' : item.kind === 'watcher_hit' ? 'rented' : 'yours'}>
          {item.skillName}
        </Pill>
        <Ring
          value={item.autonomy}
          tone={item.kind === 'watcher_hit' ? 'rented' : 'yours'}
          size={38}
          seed={item.id}
        />
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
  const { colors } = useOrbitTheme();
  const query = useQuery({
    queryKey: ['brief', 'today'],
    queryFn: () => api<DailyBrief>('/v1/brief/today'),
  });
  const catchQuery = useQuery({
    queryKey: ['life', 'catch'],
    queryFn: () => api<LifeItem[]>('/v1/life/catch'),
  });
  const brief = query.data;
  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <FlashList
        data={query.isError ? [] : (brief?.items ?? [])}
        keyExtractor={(item) => item.id}
        refreshing={query.isFetching && !query.isPending}
        onRefresh={() => void query.refetch()}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <AppHeader
              title="Good morning."
              subtitle="Your private briefing—not a feed designed to keep you scrolling."
              action={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open inbox"
                  onPress={() => router.push('/inbox')}
                  style={[styles.inbox, { borderColor: colors.hairline }]}
                >
                  <Icon name="mail" />
                </Pressable>
              }
            />
            {brief === undefined || query.isError ? null : (
              <Card tone="yours" style={styles.summary}>
                <OrbitText variant="mono">WHILE YOU WERE AWAY</OrbitText>
                <OrbitText variant="title">{brief.greeting}</OrbitText>
                <View style={styles.metrics}>
                  <Metric value={String(brief.completedCount)} label="completed" />
                  <Metric value={String(brief.needsUserCount)} label="needs you" />
                  <Metric
                    value={`${String(brief.timeSavedMinutesThisWeek)}m`}
                    label="saved this week"
                  />
                </View>
              </Card>
            )}
            {catchQuery.data === undefined || catchQuery.isError ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Catch"
                onPress={() => router.push('/catch')}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Card
                  tone={catchQuery.data.length > 0 ? 'ember' : 'paper'}
                  style={styles.catchCard}
                >
                  <View style={styles.cardTop}>
                    <OrbitText variant="mono">CATCH</OrbitText>
                    <Pill tone={catchQuery.data.length > 0 ? 'ember' : 'neutral'}>
                      {String(catchQuery.data.length)} ACTIVE
                    </Pill>
                  </View>
                  <OrbitText variant="title">
                    {catchQuery.data.length > 0
                      ? (catchQuery.data[0]?.title ?? 'Review your Catch')
                      : 'Nothing needs a follow-up'}
                  </OrbitText>
                  <OrbitText>
                    {catchQuery.data.length > 0
                      ? 'Open source-backed emails, commitments, calendar conflicts, and drafts.'
                      : 'Connect Gmail and Calendar when you are ready.'}
                  </OrbitText>
                </Card>
              </Pressable>
            )}
            <SectionHeader
              eyebrow="DAILY BRIEF"
              title="What moved"
              aside={
                <Button
                  label="Add watcher"
                  kind="quiet"
                  onPress={() => router.push('/watcher/new')}
                />
              }
            />
          </View>
        }
        ListEmptyComponent={
          query.isPending ? (
            <View style={styles.loading}>
              <Skeleton height={190} />
              <Skeleton height={170} />
            </View>
          ) : query.isError ? (
            <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
          ) : (
            <EmptyState
              title="Nothing needs you."
              detail="Your agent will place completed work, matches, and decisions here."
              action={
                <Button
                  label="Create a watcher"
                  kind="secondary"
                  onPress={() => router.push('/watcher/new')}
                />
              }
            />
          )
        }
        renderItem={({ item }) => <BriefCard item={item} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  list: { paddingBottom: spacing.xxl },
  headerContent: { gap: spacing.lg, paddingBottom: spacing.lg },
  separator: { height: spacing.md },
  loading: { gap: spacing.md },
  summary: { paddingVertical: spacing.xl },
  catchCard: { gap: spacing.sm },
  metrics: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  receipt: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  needs: { fontFamily: 'InstrumentSans_600SemiBold' },
  pressed: { opacity: 0.72 },
  inbox: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
