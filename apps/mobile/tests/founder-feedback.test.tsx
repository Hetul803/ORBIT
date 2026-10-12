import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const apiMock = vi.hoisted(() => vi.fn());
vi.mock('@/api', () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ method: 'POST', body: JSON.stringify(value) }),
  patchBody: (value: unknown) => ({ method: 'PATCH', body: JSON.stringify(value) }),
}));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(async () => undefined) }));
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(async () => ({ canceled: true })),
}));
vi.mock('expo-file-system', () => ({ File: class {} }));
vi.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListFooterComponent,
  }: {
    data: { kind: string }[];
    renderItem: (props: { item: { kind: string } }) => ReactNode;
    ListHeaderComponent: ReactNode;
    ListFooterComponent: ReactNode;
  }) => (
    <>
      {ListHeaderComponent}
      {data.map((item) => (
        <div key={item.kind}>{renderItem({ item })}</div>
      ))}
      {ListFooterComponent}
    </>
  ),
}));
import Intents from '../app/intents';
import Groups from '../app/groups';
import Voice from '../app/voice';
import Ask from '../app/(tabs)/ask';

const renderQuery = (element: ReactElement): void => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
};

describe('founder feedback journeys', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });
  it('collapses categories and opens only the selected finder preferences', async () => {
    apiMock.mockImplementation(async (path: string) =>
      path === '/v1/intents' ? [] : { items: [] },
    );
    renderQuery(<Intents />);
    await screen.findByRole('button', { name: 'Friends preferences' });
    expect(screen.queryByLabelText('What should your agent look for?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Friends preferences' }));
    expect(screen.getAllByLabelText('What should your agent look for?')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Friends preferences' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Roommates preferences' }));
    expect(screen.getAllByLabelText('What should your agent look for?')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Friends preferences' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    fireEvent.change(screen.getByLabelText('Pause until'), { target: { value: 'not-a-date' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText(/Enter a valid date/u)).toBeInTheDocument();
    expect(apiMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  });
  it('creates a private group only after explicit submission and surfaces its owner-only code', async () => {
    let groups: unknown[] = [];
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/v1/groups' && init?.method === 'POST') {
        groups = [
          {
            id: 'fixture-group',
            name: 'Weekend plans',
            kind: 'club',
            visibility: 'private',
            memberCount: 1,
            role: 'owner',
            joinCode: 'FIXTURECODEONLY',
          },
        ];
        return groups[0];
      }
      if (path === '/v1/groups') return groups;
      throw new Error(`Unexpected fixture request: ${path} ${init?.method ?? 'GET'}`);
    });
    renderQuery(<Groups />);
    fireEvent.click(screen.getByRole('button', { name: 'Create a group' }));
    expect(apiMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Weekend plans' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create private group' }));
    expect(await screen.findByText('Weekend plans')).toBeInTheDocument();
    expect(screen.getByText('Join code: FIXTURECODEONLY')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(
      '/v1/groups',
      expect.objectContaining({ body: JSON.stringify({ name: 'Weekend plans', kind: 'club' }) }),
    );
  });
  it('requires review and saves only the edited voice examples', async () => {
    const profile = {
      tone: ['warm'],
      sentenceStyle: 'Short and natural',
      vocabulary: [],
      avoids: ['No commitments'],
      examples: [],
    };
    apiMock.mockResolvedValue({ voiceProfile: profile });
    renderQuery(<Voice />);
    await waitFor(() =>
      expect(screen.getByLabelText('How should your agent sound?')).toHaveValue(
        'Short and natural',
      ),
    );
    fireEvent.change(screen.getByLabelText('Messages you wrote'), {
      target: { value: 'Coffee Saturday?\n\nLet’s keep it simple.' },
    });
    expect(screen.getByRole('button', { name: 'Save my voice' })).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'I reviewed these examples and they are mine' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save my voice' }));
    await screen.findByText('Your voice is saved');
    const write = apiMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(write?.[1].body ?? '{}')).toMatchObject({
      confirmVoiceProfile: true,
      voiceProfile: { examples: ['Coffee Saturday?', 'Let’s keep it simple.'] },
    });
  });
  it('uses real model endpoint only after consent and never needs a Google connection', async () => {
    apiMock.mockResolvedValue({
      answer: 'Let’s protect one quiet morning and leave Saturday open.',
    });
    render(<Ask />);
    fireEvent.change(screen.getByLabelText('Message your agent'), {
      target: { value: 'Help me plan my week.' },
    });
    expect(screen.getByRole('button', { name: 'Send to my agent' })).toBeDisabled();
    expect(apiMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Allow my context for this chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to my agent' }));
    expect(
      await screen.findByText('Let’s protect one quiet morning and leave Saturday open.'),
    ).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(
      '/v1/agent/chat',
      expect.objectContaining({
        body: JSON.stringify({
          message: 'Help me plan my week.',
          contextConsent: true,
          history: [],
        }),
      }),
    );
  });
});
