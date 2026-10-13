import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
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
import {
  anyGoogleSyncActive,
  googleAccounts,
  googleSyncActive,
  useGoogleStatus,
} from '@/google-sync';
import { AgendaPreview } from '@/agenda';
import { useMicrosoftStatus } from '@/linked-accounts';
import { AppHeader, EmptyState, Metric, QueryError } from '@/components';
import type { BriefItem, CurrentUser, DailyBrief } from '@/types';
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
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({
    queryKey: ['brief', 'today'],
    queryFn: () => api<DailyBrief>('/v1/brief/today'),
  });
  const catchQuery = useQuery({
    queryKey: ['life', 'catch'],
    queryFn: () => api<LifeItem[]>('/v1/life/catch'),
  });
  const brief = query.data;
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<CurrentUser>('/v1/me') });
  const agent = useQuery({
    queryKey: ['agent'],
    queryFn: () => api<{ name: string; identitySeed: string }>('/v1/agent'),
  });
  const google = useGoogleStatus();
  const microsoft = useMicrosoftStatus();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <FlashList
        data={(brief?.items ?? []).filter(
          (item) =>
            !(item.kind === 'task' && /account(?:s)? (?:created|creation)/iu.test(item.title)),
        )}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void Promise.all([
            query.refetch(),
            catchQuery.refetch(),
            google.refetch(),
            microsoft.refetch(),
          ]).finally(() => setRefreshing(false));
        }}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <AppHeader
              title={`${greeting}${me.data?.displayName ? `, ${me.data.displayName.split(' ')[0] ?? ''}` : ''}.`}
              subtitle="A little more like you. A little more useful every day."
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
            <Card tone="yours" style={styles.agentHero}>
              <View style={styles.cardTop}>
                <View style={styles.heroText}>
                  <OrbitText variant="mono">YOUR PERSONAL AGENT</OrbitText>
                  <OrbitText variant="display">{agent.data?.name ?? 'Your orbit'}</OrbitText>
                </View>
                <Icon name="person" size={52} color={colors.yours} />
              </View>
              <OrbitText>
                A space to think clearly, remember what matters, and move things forward in your own
                voice.
              </OrbitText>
              <Button label="Talk to your agent" onPress={() => router.push('/ask')} />
              <View style={styles.quickActions}>
                <Button
                  label="Teach my voice"
                  kind="secondary"
                  onPress={() => router.push('/voice')}
                />
                <Button
                  label="Find my people"
                  kind="secondary"
                  onPress={() => router.push('/intents')}
                />
              </View>
            </Card>
            {anyGoogleSyncActive(google.data) || anyGoogleSyncActive(microsoft.data) ? (
              <Card style={{ height: 128, overflow: 'hidden' }}>
                <OrbitText variant="label">Your inbox is arriving quietly</OrbitText>
                <OrbitText variant="caption" numberOfLines={2}>
                  {[
                    ...googleAccounts(google.data).map((c) => ({ ...c, providerLabel: 'Google' })),
                    ...googleAccounts(microsoft.data).map((c) => ({
                      ...c,
                      providerLabel: 'Microsoft',
                    })),
                  ]
                    .filter((c) => googleSyncActive(c.syncStatus))
                    .map(
                      (c) =>
                        `${c.providerLabel} · ${c.accountEmail ?? 'Connected account'}: ${String(c.syncProcessed)}${c.syncTotal === null ? '' : ' / ' + String(c.syncTotal)} checked`,
                    )
                    .join(' · ')}
                  . Keep using ORBIT while import continues.
                </OrbitText>
              </Card>
            ) : null}
            {!google.data?.connected ? (
              <Card tone="blue">
                <OrbitText variant="title">
                  {google.data?.connected
                    ? 'Your accounts are connected'
                    : 'Bring your day into focus'}
                </OrbitText>
                <OrbitText>
                  {google.data?.connected
                    ? googleSyncActive(google.data.connection?.syncStatus)
                      ? `Your inbox is arriving: ${String(google.data.connection?.syncProcessed ?? 0)} messages checked. You can keep using ORBIT while sync continues.`
                      : 'Your read-only inbox is ready to explore. Open a category or ask your agent about your sources.'
                    : google.data?.available
                      ? 'Connect Gmail and Calendar to surface real follow-ups and conflicts.'
                      : 'Gmail and Calendar are coming after Google verification. Your agent can still work with the context you teach it.'}
                </OrbitText>
                <Button
                  label="Gmail & Calendar"
                  kind="secondary"
                  onPress={() => router.push('/connections')}
                />
                {google.data?.connected ? (
                  <Button
                    label="Explore my inbox"
                    onPress={() => router.push('/mail')}
                    kind="secondary"
                  />
                ) : null}
              </Card>
            ) : null}
            {!microsoft.data?.connected ? (
              <Card tone="blue">
                <OrbitText variant="title">Bring Outlook into your orbit</OrbitText>
                <OrbitText>
                  {microsoft.data?.available
                    ? 'Keep Microsoft mail and calendar separate, with one agent to help you across both.'
                    : 'Outlook connection is being prepared. Your Google accounts stay independent.'}
                </OrbitText>
                <Button
                  label="Outlook & Calendar"
                  kind="secondary"
                  onPress={() => router.push('/connections')}
                />
              </Card>
            ) : null}
            <AgendaPreview />
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
                      : 'Your follow-ups, in one place'}
                  </OrbitText>
                  <OrbitText>
                    {catchQuery.data.length > 0
                      ? 'Open source-backed emails, commitments, calendar conflicts, and drafts.'
                      : google.data?.connected || microsoft.data?.connected
                        ? 'No source-backed follow-ups were found in the last sync.'
                        : 'Connect your accounts when available to get started.'}
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
              title="Make your first move."
              detail="Teach a preference, talk through a decision, or watch something that matters to you. Completed work will appear here."
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
  agentHero: { paddingVertical: spacing.xl, gap: spacing.lg },
  heroText: { flex: 1, gap: spacing.sm },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
