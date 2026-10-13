import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
const apiMock = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => ({ refreshing: false }));
vi.mock('@/api', () => ({ api: apiMock }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('expo-notifications', () => ({ getAllScheduledNotificationsAsync: vi.fn(async () => []) }));
vi.mock('@shopify/flash-list', () => ({
  FlashList: (props: {
    data: { id: string }[];
    refreshing: boolean;
    ListHeaderComponent: ReactNode;
    ListEmptyComponent: ReactNode;
    renderItem: (item: { item: { id: string } }) => ReactNode;
  }) => {
    list.refreshing = props.refreshing;
    return (
      <>
        {props.ListHeaderComponent}
        {props.data.map((item) => (
          <div key={item.id}>{props.renderItem({ item })}</div>
        ))}
      </>
    );
  },
}));
import Today from '../app/(tabs)/today';
describe('Today remains stable during account imports', () => {
  it('never activates pull-refresh for background invalidation, hides connected providers and keeps unrelated account-titled inbox items', async () => {
    let pending: (() => void) | undefined;
    let refresh = false;
    const connection = {
      id: 'fixture-google-1111',
      status: 'active',
      syncStatus: 'reading_mail',
      syncProcessed: 20,
      syncTotal: 2000,
      accountEmail: 'owner@fictional.orbit.test',
    };
    const item = {
      title: 'Accounts created for your team',
      detail: 'A legitimate message',
      durationMs: 0,
      autonomy: 0,
      needsUser: false,
      href: '/inbox',
      skillName: 'Inbox',
    };
    apiMock.mockImplementation(async (path: string) => {
      if (path === '/v1/brief/today') {
        if (refresh)
          await new Promise<void>((resolve) => {
            pending = resolve;
          });
        return {
          greeting: 'Welcome',
          completedCount: 0,
          needsUserCount: 0,
          timeSavedMinutesThisWeek: 0,
          items: [
            { ...item, id: 'noise', kind: 'task' },
            { ...item, id: 'real', kind: 'inbox' },
          ],
        };
      }
      if (path === '/v1/life/catch' || path === '/v1/connections') return [];
      if (path === '/v1/agent') return { name: 'Morrow' };
      if (path === '/v1/me') return { displayName: 'Fictional Owner' };
      if (path === '/v1/agenda') return { events: [] };
      if (path === '/v1/connections/gmail/status')
        return { available: true, connected: true, connection, connections: [connection] };
      if (path === '/v1/connections/outlook/status')
        return { available: false, connected: false, connection: null, connections: [] };
      throw new Error('Unexpected fictional request');
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Today />
      </QueryClientProvider>,
    );
    await screen.findByText('Morrow');
    await screen.findByText('Accounts created for your team');
    expect(screen.getAllByText('Accounts created for your team')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Gmail & Calendar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outlook & Calendar' })).toBeInTheDocument();
    refresh = true;
    act(() => {
      void client.invalidateQueries({ queryKey: ['brief', 'today'] });
    });
    expect(list.refreshing).toBe(false);
    await act(async () => {
      pending?.();
    });
    expect(list.refreshing).toBe(false);
  });
});
