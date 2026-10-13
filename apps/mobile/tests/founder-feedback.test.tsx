import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const apiMock = vi.hoisted(() => vi.fn());
const documentPickerMock = vi.hoisted(() => vi.fn());
vi.mock('@/api', () => ({
  api: apiMock,
  jsonBody: (value: unknown) => ({ method: 'POST', body: JSON.stringify(value) }),
  patchBody: (value: unknown) => ({ method: 'PATCH', body: JSON.stringify(value) }),
}));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(async () => undefined) }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: documentPickerMock,
}));
vi.mock('expo-file-system', () => ({
  File: class {
    constructor() {
      throw new Error('Native filesystem must never be used for a browser file');
    }
  },
  Paths: { cache: { uri: 'file:///fixture-cache/' } },
}));
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
import { clearChatSession, resetChatOwner, useChatSession } from '../src/chat-session';

const renderQuery = (element: ReactElement): void => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
};

describe('founder feedback journeys', () => {
  beforeEach(() => {
    apiMock.mockReset();
    clearChatSession();
    documentPickerMock.mockReset();
    documentPickerMock.mockResolvedValue({ canceled: true });
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
    renderQuery(<Ask />);
    fireEvent.change(screen.getByLabelText('Message your agent'), {
      target: { value: 'Help me plan my week.' },
    });
    expect(screen.getByRole('button', { name: 'Send to my agent' })).toBeDisabled();
    expect(apiMock.mock.calls.filter(([path]) => path === '/v1/agent/chat')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Allow reviewed context for this chat' }));
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
          includeConnectedContext: false,
          connectedContextConsent: false,
        }),
      }),
    );
  });
  it('reads a browser-selected file locally and keeps only the owner’s reviewed messages', async () => {
    const text =
      '[10/12/26, 10:30:00 AM] QA Owner: Coffee Saturday?\n[10/12/26, 10:31:00 AM] Someone Else: Not an owner example.\n[10/12/26, 10:32:00 AM] QA Owner: Reach me at fixture@example.com.';
    documentPickerMock.mockResolvedValue({
      canceled: false,
      assets: [
        {
          name: 'synthetic.txt',
          size: text.length,
          uri: 'blob:fixture',
          file: { size: text.length, text: () => Promise.resolve(text) },
        },
      ],
    });
    apiMock.mockResolvedValue({
      voiceProfile: {
        tone: ['warm'],
        sentenceStyle: 'Short and natural',
        vocabulary: [],
        avoids: [],
        examples: [],
      },
    });
    renderQuery(<Voice />);
    await waitFor(() =>
      expect(screen.getByLabelText('How should your agent sound?')).toHaveValue(
        'Short and natural',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose WhatsApp text export' }));
    await screen.findByRole('button', { name: 'Use only QA Owner’s messages' });
    expect(apiMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Use only QA Owner’s messages' }));
    expect(screen.getByLabelText('Messages you wrote')).toHaveValue(
      'Coffee Saturday?\n\nReach me at [email].',
    );
    expect(screen.getByRole('button', { name: 'Save my voice' })).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'I reviewed these examples and they are mine' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save my voice' }));
    await screen.findByText('Your voice is saved');
    const write = apiMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(write?.[1].body ?? '{}').voiceProfile.examples).toEqual([
      'Coffee Saturday?',
      'Reach me at [email].',
    ]);
  });
  it('keeps the conversation/composer across screen remounts and never leaks mailbox answers into model history', async () => {
    apiMock.mockImplementation(async (path: string, init?: RequestInit) =>
      path === '/v1/agent'
        ? { name: 'Morrow', connectedContextAvailable: true }
        : JSON.parse(String(init?.body ?? '{}')).includeConnectedContext
          ? { answer: 'PRIVATE FAKE MAIL RESULT', sources: [] }
          : { answer: 'A useful personal reply.' },
    );
    const view = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Ask />
      </QueryClientProvider>,
    );
    await screen.findByText('Morrow');
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Include synced mail and calendar summaries' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Allow reviewed context for this chat' }));
    fireEvent.change(screen.getByLabelText('Message your agent'), {
      target: { value: 'What am I forgetting today?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to my agent' }));
    await screen.findByText('PRIVATE FAKE MAIL RESULT');
    view.unmount();
    renderQuery(<Ask />);
    expect(screen.getByText('PRIVATE FAKE MAIL RESULT')).toBeInTheDocument();
    act(() => useChatSession.setState({ consent: false, includeConnected: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Allow reviewed context for this chat' }));
    fireEvent.change(screen.getByLabelText('Message your agent'), {
      target: { value: 'Help me think about my day.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to my agent' }));
    await screen.findByText('A useful personal reply.');
    const calls = apiMock.mock.calls.filter(([path]) => path === '/v1/agent/chat');
    expect(JSON.parse(calls[1]?.[1].body ?? '{}').history).toEqual([]);
    expect(JSON.stringify(calls[1])).not.toContain('PRIVATE FAKE MAIL RESULT');
  });
  it('shows a pending user bubble immediately, preserves failed input, and drops late replies after an owner reset', async () => {
    let resolveReply: (value: unknown) => void = () => undefined;
    apiMock.mockImplementation(async (path: string) =>
      path === '/v1/agent'
        ? { name: 'Morrow' }
        : new Promise((resolve) => {
            resolveReply = resolve;
          }),
    );
    renderQuery(<Ask />);
    fireEvent.click(screen.getByRole('button', { name: 'Allow reviewed context for this chat' }));
    fireEvent.change(screen.getByLabelText('Message your agent'), {
      target: { value: 'Let’s make a plan.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to my agent' }));
    expect(screen.getByText('Let’s make a plan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to my agent' })).toBeDisabled();
    await act(async () => {
      resetChatOwner('different-owner');
      resolveReply({ answer: 'Old owner private reply' });
      await Promise.resolve();
    });
    expect(useChatSession.getState().turns).toEqual([]);
    expect(screen.queryByText('Old owner private reply')).not.toBeInTheDocument();
    act(() => resetChatOwner(null));
  });
});
