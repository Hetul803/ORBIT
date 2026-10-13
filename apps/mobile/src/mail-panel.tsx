import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Button, Card, OrbitText, Pill, spacing } from '@orbit/ui';
import { api } from './api';
import { EmptyState, QueryError } from './components';
import { anyGoogleSyncActive, useGoogleStatus } from './google-sync';
import { MailCard, actionLabels, type ActionMail } from './mail-card';
import { AccountPicker } from './account-picker';
import { useMicrosoftStatus } from './linked-accounts';
const filters = [
  'needs_reply',
  'reply_ready',
  'receipts',
  'subscriptions',
  'all',
  'important',
  'spam',
] as const;
interface MailView {
  items: ActionMail[];
  counts: Record<string, number>;
  actionCounts: Record<string, number>;
  syncedCount: number;
  limited: boolean;
  draftingAvailable: boolean;
}
export function MailPanel() {
  const [filter, setFilter] = useState<(typeof filters)[number]>('needs_reply');
  const [account, setAccount] = useState<string | null>(null);
  const google = useGoogleStatus();
  const microsoft = useMicrosoftStatus();
  const query = useQuery({
    queryKey: ['mail', filter, account],
    queryFn: () => {
      const params = new URLSearchParams();
      if (account) params.set('connectionId', account);
      if (filter === 'important' || filter === 'spam') params.set('category', filter);
      else if (filter !== 'all') params.set('action', filter);
      return api<MailView>('/v1/mail' + (params.size ? '?' + params.toString() : ''));
    },
  });
  return (
    <>
      <AccountPicker selected={account} onChange={setAccount} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {filters.map((f) => (
          <Pressable
            key={f}
            accessibilityRole="button"
            accessibilityLabel={'Show ' + (actionLabels[f] ?? f) + ' emails'}
            accessibilityState={{ selected: f === filter }}
            onPress={() => setFilter(f)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Pill tone={f === filter ? 'yours' : 'neutral'}>
              {actionLabels[f] ?? f.toUpperCase()} · {filterCount(query.data, f)}
            </Pill>
          </Pressable>
        ))}
      </ScrollView>
      {anyGoogleSyncActive(google.data) || anyGoogleSyncActive(microsoft.data) ? (
        <Card>
          <OrbitText variant="caption">
            Import is continuing quietly. New results appear without restarting this page.
          </OrbitText>
        </Card>
      ) : null}
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <OrbitText>Organizing your inbox…</OrbitText>
      ) : query.data.items.length ? (
        query.data.items.map((item) => (
          <MailCard key={item.id} item={item} draftingAvailable={query.data.draftingAvailable} />
        ))
      ) : (
        <EmptyState
          title={
            filter === 'reply_ready'
              ? 'No prepared replies yet'
              : filter === 'needs_reply'
                ? 'No reply requests found'
                : 'Nothing in this view yet'
          }
          detail={
            filter === 'reply_ready'
              ? 'Open Needs reply and ask your agent to prepare a draft. You always review it.'
              : 'Only synced emails appear here. These action labels are clues, not a guarantee that nothing needs your attention.'
          }
        />
      )}
      <Button
        label="Manage connected accounts"
        kind="quiet"
        onPress={() => router.push('/connections')}
      />
      <OrbitText variant="caption">
        Action groups use synced headers and small follow-up clues. Showing the newest 100 matches
        from bounded synced snapshots. Each account keeps its own labels or folders unchanged. Email
        sending is not enabled.
      </OrbitText>
    </>
  );
}
const filterCount = (data: MailView | undefined, f: string): number =>
  f === 'all'
    ? (data?.syncedCount ?? 0)
    : actionLabels[f]
      ? (data?.actionCounts[f] ?? 0)
      : (data?.counts[f] ?? 0);
