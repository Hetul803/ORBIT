import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  platform: 'ios',
  prefs: new Map<string, string>(),
  plans: [] as {
    identifier: string;
    content: { title: string; body: string; data: Record<string, unknown> };
  }[],
}));
vi.mock('@/api', () => ({ api: vi.fn() }));
vi.mock('react-native', async (original) => {
  const actual = await original<typeof import('react-native')>();
  return {
    ...actual,
    Platform: {
      ...actual.Platform,
      get OS() {
        return fixture.platform;
      },
    },
  };
});
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => fixture.prefs.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    fixture.prefs.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    fixture.prefs.delete(key);
  }),
}));
vi.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: vi.fn(async () => ({ granted: true })),
  requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
  getAllScheduledNotificationsAsync: vi.fn(async () => [...fixture.plans]),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    fixture.plans = fixture.plans.filter((p) => p.identifier !== id);
  }),
  scheduleNotificationAsync: vi.fn(
    async ({ content }: { content: (typeof fixture.plans)[number]['content'] }) => {
      const identifier = 'plan-' + Math.random();
      fixture.plans.push({ identifier, content });
      return identifier;
    },
  ),
}));
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../src/store';
import {
  clearOrbitCalendarReminders,
  enableCalendarReminders,
  removeAccountCalendarReminders,
  restoreAccountReminderEligibility,
  syncCalendarReminders,
} from '../src/calendar-reminders';
import type { CalendarEvent } from '../src/agenda';
const owner = 'fixture-owner-reminders';
const event = (id: string, connectionId = 'fixture-google-account'): CalendarEvent => ({
  id,
  connectionId,
  provider: connectionId.includes('microsoft') ? 'microsoft' : 'google',
  accountEmail: 'same@fictional.orbit.test',
  title: 'SECRET EVENT TITLE',
  start: new Date(Date.now() + 3600000).toISOString(),
  end: new Date(Date.now() + 7200000).toISOString(),
  allDay: false,
  remindable: true,
  startDate: null,
  endDate: null,
  sourceUrl: 'https://example.com',
  lastSyncedAt: new Date().toISOString(),
});
describe('private, owner/account-scoped local reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.platform = 'ios';
    fixture.prefs.clear();
    fixture.plans = [];
    useAuthStore.setState({
      accessToken: 'fixture.' + btoa(JSON.stringify({ sub: owner })) + '.unsigned',
    });
    restoreAccountReminderEligibility(owner, 'fixture-google-account');
    restoreAccountReminderEligibility(owner, 'fixture-microsoft-account');
  });
  it('does nothing before explicit opt-in or on the web', async () => {
    expect(await syncCalendarReminders(owner, [event('one')])).toBe(0);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    fixture.platform = 'web';
    expect((await enableCalendarReminders(owner, [event('one')])).ok).toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
  it('keeps event titles off the lock screen, deduplicates and excludes all-day or unknown legacy timing', async () => {
    const timed = event('one');
    const legacy = event('legacy');
    delete legacy.remindable;
    expect(
      (await enableCalendarReminders(owner, [timed, { ...event('all-day'), allDay: true }, legacy]))
        .ok,
    ).toBe(true);
    expect(fixture.plans).toHaveLength(1);
    expect(fixture.plans[0]?.content.body).not.toContain('SECRET');
    await syncCalendarReminders(owner, [timed]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    await syncCalendarReminders(owner, [
      { ...timed, start: new Date(Date.now() + 4800000).toISOString() },
    ]);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(fixture.plans).toHaveLength(1);
  });
  it('removes only the disconnected account and cannot re-plan it from a stale calendar snapshot', async () => {
    const g = event('google'),
      m = event('microsoft', 'fixture-microsoft-account');
    await enableCalendarReminders(owner, [g, m]);
    await removeAccountCalendarReminders(owner, 'fixture-microsoft-account');
    expect(fixture.plans).toHaveLength(1);
    expect(fixture.plans[0]?.content.data.connectionId).toBe(g.connectionId);
    await syncCalendarReminders(owner, [g, m]);
    expect(fixture.plans).toHaveLength(1);
    restoreAccountReminderEligibility(owner, 'fixture-microsoft-account');
    await syncCalendarReminders(owner, [g, m]);
    expect(fixture.plans).toHaveLength(2);
  });
  it('cancels ORBIT plans only, caps scheduling at 20 and ignores an owner who signed out', async () => {
    fixture.plans.push({
      identifier: 'other-app',
      content: { title: 'Other', body: 'Keep', data: {} },
    });
    await enableCalendarReminders(
      owner,
      Array.from({ length: 25 }, (_, i) => event('event-' + i)),
    );
    expect(fixture.plans).toHaveLength(21);
    await clearOrbitCalendarReminders(owner);
    expect(fixture.plans.map((p) => p.identifier)).toEqual(['other-app']);
    useAuthStore.setState({ accessToken: null });
    expect(await syncCalendarReminders(owner, [event('one')])).toBe(0);
  });
});
