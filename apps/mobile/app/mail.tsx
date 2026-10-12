import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Screen, spacing } from '@orbit/ui';
import { api } from '@/api';
import { AppHeader, EmptyState, ErrorText, QueryError } from '@/components';
import { googleSyncActive, useGoogleStatus } from '@/google-sync';

const categories = [
  'all',
  'important',
  'spam',
  'promotions',
  'social',
  'updates',
  'sent',
  'other',
] as const;
interface MailItem {
  id: string;
  title: string;
  sender: string | null;
  occurredAt: string | null;
  sourceUrl: string;
  category: string;
}
interface MailView {
  items: MailItem[];
  counts: Record<string, number>;
  syncedCount: number;
  limited: boolean;
}
export default function Mail(): ReactNode {
  const [category, setCategory] = useState<(typeof categories)[number]>('all');
  const [error, setError] = useState<string | null>(null);
  const google = useGoogleStatus();
  const query = useQuery({
    queryKey: ['mail', category],
    queryFn: () => api<MailView>(`/v1/mail${category === 'all' ? '' : `?category=${category}`}`),
  });
  const open = async (item: MailItem): Promise<void> => {
    try {
      await Linking.openURL(item.sourceUrl);
    } catch {
      setError('Could not open the original email. Please try again.');
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Your inbox, in focus"
        subtitle="The signal, without the noise. Nothing here changes your Gmail labels."
      />
      <Card tone="yours">
        <OrbitText variant="title">
          {String(query.data?.syncedCount ?? 0)} messages available
        </OrbitText>
        <OrbitText variant="caption">
          Sorted using your Gmail labels. No labels are changed. ORBIT saves headers and small
          follow-up clues, not full message bodies.
        </OrbitText>
        {googleSyncActive(google.data?.connection?.syncStatus) ? (
          <OrbitText>
            Sync continues in the background. New results appear as batches finish.
          </OrbitText>
        ) : null}
        <Button
          label="Manage connection"
          kind="quiet"
          onPress={() => router.push('/connections')}
        />
      </Card>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {categories.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Show ${value} emails`}
            accessibilityState={{ selected: category === value }}
            onPress={() => setCategory(value)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Pill tone={category === value ? 'yours' : 'neutral'}>
              {value.toUpperCase()} ·{' '}
              {String(
                value === 'all' ? (query.data?.syncedCount ?? 0) : (query.data?.counts[value] ?? 0),
              )}
            </Pill>
          </Pressable>
        ))}
      </ScrollView>
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <OrbitText>Reading your synced inbox…</OrbitText>
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title="Nothing in this category yet"
          detail="Start Google sync in Connected accounts. Only messages actually synced are shown."
        />
      ) : (
        query.data.items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="link"
            accessibilityLabel={`Open email: ${item.title}`}
            onPress={() => void open(item)}
          >
            <Card>
              <View style={{ gap: spacing.sm }}>
                <Pill>{item.category.toUpperCase()}</Pill>
                <OrbitText variant="title">{item.title}</OrbitText>
                <OrbitText>{item.sender ?? 'Unknown sender'}</OrbitText>
                <OrbitText variant="caption">
                  {item.occurredAt
                    ? new Date(item.occurredAt).toLocaleDateString()
                    : 'Date unavailable'}{' '}
                  · Open original ↗
                </OrbitText>
              </View>
            </Card>
          </Pressable>
        ))
      )}
      <OrbitText variant="caption">
        Showing the newest 100 in this view, from up to 2,500 synced messages. First sync reads the
        last 90 days, not an unlimited historical archive.
      </OrbitText>
      {error ? <ErrorText message={error} /> : null}
    </Screen>
  );
}
