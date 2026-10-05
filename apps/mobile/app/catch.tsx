import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen, Skeleton, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, EmptyState, ErrorText, QueryError } from '@/components';
import type { LifeItem, SourceCitation } from '@/types';

const sourceLabel = (source: SourceCitation): string =>
  `${source.kind === 'calendar' ? 'Calendar' : 'Email'} · ${source.title}`;

const formatWhen = (value: string | null): string =>
  value === null ? 'Date unavailable' : new Date(value).toLocaleString();

const CopyDraft = ({
  text,
  onDone,
}: {
  text: string;
  onDone: (message: string) => void;
}): ReactNode => (
  <Button
    label="Copy draft"
    kind="secondary"
    onPress={() => {
      void Clipboard.setStringAsync(text).then(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onDone('Draft copied. Review it before sending.');
      });
    }}
  />
);

const CatchCard = ({
  item,
  onDismiss,
  onSnooze,
  onNotice,
}: {
  item: LifeItem;
  onDismiss: (id: string) => Promise<void>;
  onSnooze: (id: string) => Promise<void>;
  onNotice: (message: string) => void;
}): ReactNode => {
  const primarySource = item.evidence[0];
  return (
    <Card tone={item.kind === 'nudge' ? 'ember' : item.kind === 'draft' ? 'yours' : 'paper'}>
      <View style={styles.cardHeader}>
        <Pill tone={item.kind === 'nudge' ? 'ember' : item.kind === 'draft' ? 'yours' : 'neutral'}>
          {item.kind.toUpperCase()}
        </Pill>
        <Ring
          value={item.confidence}
          tone={item.kind === 'draft' ? 'yours' : 'rented'}
          size={38}
          seed={item.id}
        />
      </View>
      <OrbitText variant="title">{item.title}</OrbitText>
      <OrbitText>{item.detail}</OrbitText>
      {item.dueAt === null ? null : (
        <OrbitText variant="caption">Time: {formatWhen(item.dueAt)}</OrbitText>
      )}
      {item.draft === null ? null : (
        <View style={styles.draft}>
          <OrbitText variant="label">DRAFT — NOT SENT</OrbitText>
          <OrbitText>{item.draft}</OrbitText>
          <CopyDraft text={item.draft} onDone={onNotice} />
        </View>
      )}
      <View style={styles.sources}>
        <OrbitText variant="mono">SOURCES</OrbitText>
        {item.evidence.map((source) => (
          <Pressable
            key={source.sourceId}
            accessibilityRole="link"
            accessibilityLabel={`Open source: ${sourceLabel(source)}`}
            onPress={() => void Linking.openURL(source.url)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <OrbitText variant="label">{sourceLabel(source)} ↗</OrbitText>
            <OrbitText variant="caption">“{source.quote}”</OrbitText>
          </Pressable>
        ))}
      </View>
      {primarySource === undefined ? null : (
        <Button
          label={primarySource.kind === 'calendar' ? 'Open Calendar event' : 'Open original email'}
          kind="secondary"
          onPress={() => void Linking.openURL(primarySource.url)}
        />
      )}
      <View style={styles.actions}>
        <Button label="Snooze tomorrow" onPress={() => void onSnooze(item.id)} kind="secondary" />
        <Button label="Dismiss" onPress={() => void onDismiss(item.id)} kind="quiet" />
      </View>
    </Card>
  );
};

export default function Catch(): ReactNode {
  const client = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['life', 'catch'],
    queryFn: () => api<LifeItem[]>('/v1/life/catch'),
  });
  const refresh = async (): Promise<void> => {
    await Promise.all([
      query.refetch(),
      client.invalidateQueries({ queryKey: ['brief', 'today'] }),
    ]);
  };
  const dismiss = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await api(`/v1/life/catch/${id}/dismiss`, { method: 'POST' });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setNotice('Removed from Catch. The underlying email or event was not changed.');
      await refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not dismiss that item.');
    } finally {
      setBusyId(null);
    }
  };
  const snooze = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1_000);
      await api(`/v1/life/catch/${id}/snooze`, jsonBody({ until: tomorrow.toISOString() }));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setNotice('Snoozed until tomorrow.');
      await refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not snooze that item.');
    } finally {
      setBusyId(null);
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Catch"
        subtitle="Only things with a tap-back source. Nothing here sends, changes, or hides your original data."
      />
      {query.isPending ? (
        <View style={styles.loading}>
          <Skeleton height={240} />
          <Skeleton height={190} />
        </View>
      ) : query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          title="Nothing to catch right now."
          detail="Connect Gmail and Calendar, then sync to see source-backed follow-ups, commitments, renewals, and conflicts."
          action={<Button label="Open connections" onPress={() => router.push('/connections')} />}
        />
      ) : (
        <View style={styles.list}>
          {query.data.map((item) => (
            <View key={item.id} style={busyId === item.id ? styles.busy : undefined}>
              <CatchCard item={item} onDismiss={dismiss} onSnooze={snooze} onNotice={setNotice} />
            </View>
          ))}
        </View>
      )}
      {notice === null ? null : <OrbitText accessibilityLiveRegion="polite">{notice}</OrbitText>}
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Refresh Catch" kind="quiet" onPress={() => void refresh()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  loading: { gap: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sources: { gap: spacing.xs, marginTop: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  draft: { gap: spacing.sm, marginTop: spacing.sm },
  busy: { opacity: 0.58 },
  pressed: { opacity: 0.62 },
});
