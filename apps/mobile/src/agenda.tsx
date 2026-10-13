import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Button, Card, OrbitText, spacing } from '@orbit/ui';
import { api } from './api';
import { router } from 'expo-router';
import { AccountBadge, type AccountReference } from './account-reference';
export interface CalendarEvent extends AccountReference {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  sourceUrl: string;
  lastSyncedAt: string;
  remindable?: boolean;
}
export const useAgenda = (connectionId?: string | null) =>
  useQuery({
    queryKey: ['agenda', connectionId ?? null],
    queryFn: () =>
      api<{ events: CalendarEvent[]; windowDays: number }>(
        '/v1/agenda' + (connectionId ? '?connectionId=' + encodeURIComponent(connectionId) : ''),
      ),
  });
export const eventTime = (event: CalendarEvent): string =>
  event.allDay
    ? `${event.startDate ?? event.start.slice(0, 10)} · All day`
    : new Date(event.start).toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
export const AgendaPreview = () => {
  const query = useAgenda();
  return (
    <Card>
      <OrbitText variant="mono">UP NEXT</OrbitText>
      {query.isError ? (
        <>
          <OrbitText>Calendar refresh failed. Saved results may be out of date.</OrbitText>
          <Button label="Retry calendar" kind="quiet" onPress={() => void query.refetch()} />
        </>
      ) : null}
      {query.isPending ? (
        <OrbitText>Checking your calendar…</OrbitText>
      ) : query.data?.events.length === 0 ? (
        <OrbitText>
          No upcoming events in your synced calendar. Connect an account or sync again to bring your
          day here.
        </OrbitText>
      ) : (
        query.data?.events.slice(0, 3).map((event) => (
          <View key={event.id} style={{ gap: spacing.sm }}>
            <AccountBadge account={event} />
            <OrbitText variant="title">{event.title}</OrbitText>
            <OrbitText variant="caption">{eventTime(event)}</OrbitText>
          </View>
        ))
      )}
      <Button label="See my calendar" kind="quiet" onPress={() => router.push('/agenda')} />
    </Card>
  );
};
