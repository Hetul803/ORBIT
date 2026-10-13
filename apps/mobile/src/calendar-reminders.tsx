import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { Button, Card, OrbitText } from '@orbit/ui';
import { useAgenda, type CalendarEvent } from './agenda';
import { useAuthStore } from './store';
import { offlineScope } from './offline-scope';

const key = (owner: string) => 'orbit.calendar-reminders.' + owner;
const currentOwner = () => offlineScope(useAuthStore.getState().accessToken);
let scheduling: Promise<unknown> = Promise.resolve();
const unavailableAccounts = new Set<string>();
export const restoreAccountReminderEligibility = (owner: string, connectionId: string): void => {
  unavailableAccounts.delete(owner + ':' + connectionId);
};
export const removeAccountCalendarReminders = async (
  owner: string,
  connectionId: string,
): Promise<void> => {
  unavailableAccounts.add(owner + ':' + connectionId);
  await scheduling.catch(() => undefined);
  if (Platform.OS === 'web') return;
  for (const plan of await Notifications.getAllScheduledNotificationsAsync()) {
    if (
      plan.content.data?.orbitCalendar === true &&
      plan.content.data.owner === owner &&
      plan.content.data.connectionId === connectionId
    )
      await Notifications.cancelScheduledNotificationAsync(plan.identifier);
  }
};
export const clearOrbitCalendarReminders = async (owner?: string): Promise<void> => {
  if (Platform.OS === 'web') return;
  const plans = await Notifications.getAllScheduledNotificationsAsync();
  for (const plan of plans)
    if (plan.content.data?.orbitCalendar === true && (!owner || plan.content.data.owner === owner))
      await Notifications.cancelScheduledNotificationAsync(plan.identifier);
};
export const syncCalendarReminders = (owner: string, events: CalendarEvent[]): Promise<number> => {
  const run = async () => {
    if (
      Platform.OS === 'web' ||
      currentOwner() !== owner ||
      (await SecureStore.getItemAsync(key(owner))) !== 'on'
    )
      return 0;
    if (!(await Notifications.getPermissionsAsync()).granted) return 0;
    const wanted = events
      .filter(
        (e) =>
          e.remindable === true &&
          !e.allDay &&
          Date.parse(e.start) - 600000 > Date.now() &&
          !(e.connectionId && unavailableAccounts.has(owner + ':' + e.connectionId)),
      )
      .slice(0, 20);
    const ids = new Set(wanted.map((e) => e.id + ':' + e.start));
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    const retained = new Set<string>();
    for (const plan of existing) {
      if (plan.content.data?.orbitCalendar !== true || plan.content.data.owner !== owner) continue;
      const eventKey = String(plan.content.data.eventKey);
      if (ids.has(eventKey)) retained.add(eventKey);
      else await Notifications.cancelScheduledNotificationAsync(plan.identifier);
    }
    let count = retained.size;
    for (const event of wanted) {
      if (currentOwner() !== owner || (await SecureStore.getItemAsync(key(owner))) !== 'on')
        return count;
      if (event.connectionId && unavailableAccounts.has(owner + ':' + event.connectionId)) continue;
      const eventKey = event.id + ':' + event.start;
      if (retained.has(eventKey)) continue;
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'ORBIT',
          body: 'An upcoming calendar event starts in 10 minutes. Open ORBIT to see your day.',
          data: {
            orbitCalendar: true,
            owner,
            eventKey,
            connectionId: event.connectionId ?? null,
            deepLink: 'orbit://today',
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(Date.parse(event.start) - 600000),
        },
      });
      if (
        currentOwner() !== owner ||
        (await SecureStore.getItemAsync(key(owner))) !== 'on' ||
        (event.connectionId && unavailableAccounts.has(owner + ':' + event.connectionId))
      ) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
        return count;
      }
      count += 1;
    }
    return count;
  };
  const next = scheduling.catch(() => undefined).then(run);
  scheduling = next;
  return next;
};
export const enableCalendarReminders = async (owner: string, events: CalendarEvent[]) => {
  if (Platform.OS === 'web')
    return {
      ok: false,
      message: 'Calendar reminders are available in the installed iPhone and Android apps.',
    };
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    return { ok: false, message: 'Notifications were not allowed. Nothing was scheduled.' };
  if (currentOwner() !== owner)
    return { ok: false, message: 'Sign in again before enabling reminders.' };
  await SecureStore.setItemAsync(key(owner), 'on');
  const count = await syncCalendarReminders(owner, events);
  return {
    ok: true,
    message: count
      ? `${String(count)} local calendar reminders scheduled.`
      : 'Reminders enabled. Timed events will be scheduled when your calendar next refreshes.',
  };
};
export const CalendarReminderObserver = () => {
  const token = useAuthStore((s) => s.accessToken);
  const owner = offlineScope(token);
  const query = useAgenda();
  useEffect(() => {
    if (owner && query.data)
      void syncCalendarReminders(owner, query.data.events).catch(() => undefined);
  }, [owner, query.data]);
  return null;
};
export const CalendarReminderControls = () => {
  const token = useAuthStore((s) => s.accessToken);
  const owner = offlineScope(token);
  const query = useAgenda();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    if (owner && Platform.OS !== 'web')
      void SecureStore.getItemAsync(key(owner)).then((value) => {
        if (!stopped) setEnabled(value === 'on');
      });
    return () => {
      stopped = true;
    };
  }, [owner]);
  const toggle = async () => {
    if (!owner) return;
    setBusy(true);
    try {
      if (enabled) {
        await SecureStore.deleteItemAsync(key(owner));
        await clearOrbitCalendarReminders(owner);
        setEnabled(false);
        setMessage('Calendar reminders are off. Only ORBIT calendar reminders were removed.');
      } else {
        const result = await enableCalendarReminders(owner, query.data?.events ?? []);
        setMessage(result.message);
        if (result.ok) setEnabled(true);
      }
    } catch {
      setMessage('Could not update calendar reminders. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <OrbitText variant="title">A heads-up before your next event</OrbitText>
      <OrbitText>
        Optional reminders across connected accounts on this device, 10 minutes before timed events.
        The account filter changes the display, not reminder coverage. They use your latest synced
        calendar; open ORBIT after changes to refresh them. All-day events are excluded. Event
        titles stay off the lock screen.
      </OrbitText>
      <Button
        label={enabled ? 'Turn off calendar reminders' : 'Enable calendar reminders'}
        loading={busy}
        disabled={busy || !owner}
        onPress={() => void toggle()}
      />
      {message ? <OrbitText accessibilityLiveRegion="polite">{message}</OrbitText> : null}
    </Card>
  );
};
