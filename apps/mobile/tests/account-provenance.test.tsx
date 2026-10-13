import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const apiMock = vi.hoisted(() => vi.fn());
vi.mock('@/api', () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ method: 'POST', body: JSON.stringify(value) }),
}));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
import { AccountPicker } from '../src/account-picker';
import { accountCaption, AccountBadge } from '../src/account-reference';
import {
  clearChatSession,
  invalidateDisconnectedAccountChat,
  useChatSession,
} from '../src/chat-session';
describe('visible account provenance and isolated chat cleanup', () => {
  beforeEach(() => {
    apiMock.mockReset();
    clearChatSession();
  });
  it('labels identical emails from Google, Microsoft and multiple Microsoft accounts without ambiguity', async () => {
    const accounts = [
      {
        id: 'fixture-google-1111',
        provider: 'google',
        status: 'active',
        accountEmail: 'same@fictional.orbit.test',
      },
      {
        id: 'fixture-microsoft-2222',
        provider: 'microsoft',
        status: 'active',
        accountEmail: 'same@fictional.orbit.test',
      },
      {
        id: 'fixture-microsoft-3333',
        provider: 'microsoft',
        status: 'active',
        accountEmail: 'same@fictional.orbit.test',
      },
    ];
    apiMock.mockResolvedValue(
      accounts.map((a) => ({
        ...a,
        provider: a.provider.toUpperCase(),
        status: a.status.toUpperCase(),
      })),
    );
    const selected = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AccountPicker selected={null} onChange={selected} />
      </QueryClientProvider>,
    );
    for (const a of accounts) {
      const caption = accountCaption({
        ...a,
        provider: a.provider as 'google' | 'microsoft',
        connectionId: a.id,
      });
      const button = await screen.findByRole('button', { name: 'Show account: ' + caption });
      fireEvent.click(button);
      expect(selected).toHaveBeenLastCalledWith(a.id);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Show all connected accounts' }));
    expect(selected).toHaveBeenLastCalledWith(null);
    render(
      <AccountBadge
        account={{
          provider: 'microsoft',
          connectionId: accounts[1]!.id,
          accountEmail: accounts[1]!.accountEmail,
        }}
      />,
    );
    expect(screen.getByText('MICROSOFT')).toBeInTheDocument();
  });
  it('purges only one account’s question/answer pair, retaining unrelated personal and other-provider context', () => {
    act(() =>
      useChatSession.setState({
        turns: [
          { id: 'personal', role: 'user', content: 'Keep personal', context: 'personal' },
          { id: 'google', role: 'user', content: 'Google question', context: 'accounts' },
          {
            id: 'google-reply',
            role: 'assistant',
            content: 'Google answer',
            context: 'accounts',
            sources: [
              {
                sourceId: 'g',
                kind: 'email',
                title: 'G',
                url: 'https://example.com',
                quote: '',
                occurredAt: null,
                connectionId: 'fixture-google',
              },
            ],
          },
          { id: 'microsoft', role: 'user', content: 'Microsoft question', context: 'accounts' },
          {
            id: 'microsoft-reply',
            role: 'assistant',
            content: 'Microsoft answer',
            context: 'accounts',
            sources: [
              {
                sourceId: 'm',
                kind: 'email',
                title: 'M',
                url: 'https://example.com',
                quote: '',
                occurredAt: null,
                connectionId: 'fixture-microsoft',
              },
            ],
          },
        ],
      }),
    );
    invalidateDisconnectedAccountChat('fixture-microsoft');
    expect(useChatSession.getState().turns.map((t) => t.id)).toEqual([
      'personal',
      'google',
      'google-reply',
    ]);
  });
  it('invalidates an in-flight account answer without clearing an unrelated personal draft', () => {
    useChatSession.setState({
      busy: true,
      draft: 'Unsent local draft',
      turns: [{ id: 'pending', role: 'user', context: 'accounts', content: 'Pending question' }],
    });
    const epoch = useChatSession.getState().epoch;
    invalidateDisconnectedAccountChat('fixture-microsoft');
    expect(useChatSession.getState().epoch).toBe(epoch + 1);
    expect(useChatSession.getState().busy).toBe(false);
    expect(useChatSession.getState().turns).toEqual([]);
    expect(useChatSession.getState().draft).toBe('Unsent local draft');
  });
});
