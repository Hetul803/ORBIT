import { Linking } from 'react-native';
import { Button, Card, OrbitText, Screen } from '@orbit/ui';
import { AppHeader, EmptyState, QueryError } from '@/components';
import { eventTime, useAgenda } from '@/agenda';
import { CalendarReminderControls } from '@/calendar-reminders';
import { useState } from 'react';
import { AccountPicker } from '@/account-picker';
import { AccountBadge } from '@/account-reference';
export default function Agenda() {
  const [account, setAccount] = useState<string | null>(null);
  const query = useAgenda(account);
  return (
    <Screen>
      <AppHeader
        title="Your day, without the juggling"
        subtitle="Upcoming events from your latest synced calendars."
      />
      <AccountPicker selected={account} onChange={setAccount} />
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isPending ? (
        <OrbitText>Loading your calendar…</OrbitText>
      ) : query.data?.events.length === 0 ? (
        <EmptyState
          title="Nothing upcoming in the synced window"
          detail="Connect a calendar or refresh your account to bring events here."
        />
      ) : (
        query.data?.events.map((event) => (
          <Card key={event.id}>
            <AccountBadge account={event} />
            <OrbitText variant="title">{event.title}</OrbitText>
            <OrbitText>{eventTime(event)}</OrbitText>
            <Button
              label="Open original calendar event"
              kind="quiet"
              onPress={() => void Linking.openURL(event.sourceUrl).catch(() => undefined)}
            />
          </Card>
        ))
      )}
      <CalendarReminderControls />
      <OrbitText variant="caption">
        Read-only snapshots of default calendars, next 14 days, showing up to 250 events in this
        view. This is a synced snapshot—not a promise of live calendar updates.
      </OrbitText>
    </Screen>
  );
}
