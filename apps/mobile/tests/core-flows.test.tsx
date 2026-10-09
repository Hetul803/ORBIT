import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { router } from 'expo-router';
import type { PropsWithChildren, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());
const setTokensMock = vi.hoisted(() => vi.fn(async () => undefined));
const setOnboardedMock = vi.hoisted(() => vi.fn());
const loadOnboardingProgressMock = vi.hoisted(() => vi.fn(async (): Promise<unknown> => null));
const saveOnboardingProgressMock = vi.hoisted(() => vi.fn(async () => undefined));
const clearOnboardingProgressMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/api', () => {
  class ApiRequestError extends Error {
    public constructor(
      message: string,
      public readonly status: number,
      public readonly code: string,
    ) {
      super(message);
    }
  }
  return {
    api: apiMock,
    ApiRequestError,
    configuredApiUrl: 'http://localhost:4100',
    jsonBody: (value: unknown) => ({ method: 'POST', body: JSON.stringify(value) }),
    patchBody: (value: unknown) => ({ method: 'PATCH', body: JSON.stringify(value) }),
  };
});

vi.mock('@/store', () => ({
  loadOnboardingProgress: loadOnboardingProgressMock,
  saveOnboardingProgress: saveOnboardingProgressMock,
  clearOnboardingProgress: clearOnboardingProgressMock,
  useAuthStore: (
    selector: (state: {
      setTokens: typeof setTokensMock;
      setOnboarded: typeof setOnboardedMock;
    }) => unknown,
  ) => selector({ setTokens: setTokensMock, setOnboarded: setOnboardedMock }),
}));

import SignIn from '../app/(auth)/sign-in';
import AgentOnboarding from '../app/(onboarding)/agent';
import IntroductionScreen from '../app/introduction/[id]';
import WatcherDetail from '../app/watcher/[id]';

const renderWithQuery = (element: ReactElement): ReturnType<typeof render> => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(element, { wrapper: Wrapper });
};

const change = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('mobile core interactions', () => {
  beforeEach(() => {
    apiMock.mockReset();
    setTokensMock.mockClear();
    setOnboardedMock.mockClear();
    loadOnboardingProgressMock.mockClear();
    loadOnboardingProgressMock.mockResolvedValue(null);
    saveOnboardingProgressMock.mockClear();
    clearOnboardingProgressMock.mockClear();
    vi.mocked(router.replace).mockClear();
  });

  it('requests and verifies a real sign-in code with no prefilled identity', async () => {
    apiMock
      .mockResolvedValueOnce({ ok: true, expiresIn: 600, resendAfterSeconds: 30 })
      .mockResolvedValueOnce({
        accessToken: 'access-real',
        refreshToken: 'refresh-real',
        hasAgent: false,
      });
    render(<SignIn />);
    expect(screen.getByLabelText('Email')).toHaveValue('');
    change('Email', 'person@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send six-digit code' }));
    expect(await screen.findByText('Verify it’s you')).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveValue('');
    expect(screen.getByText(/never displays sign-in codes inside the app/iu)).toBeInTheDocument();
    change('Code', '321654');
    change('What should we call you?', 'Avery');
    change('Date of birth', '1996-02-03');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(setTokensMock).toHaveBeenCalledWith('access-real', 'refresh-real'));
    expect(router.replace).toHaveBeenCalledWith('/agent');
  });

  it('keeps the agent unnamed until the bounded interview completes', async () => {
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/v1/agent' && init?.method === 'POST') return { id: 'agent-1' };
      if (path === '/v1/agent/interview/turn') {
        return {
          sessionId: 'interview-1',
          question: 'Your profile is ready. What should your agent be called?',
          progress: 1,
          complete: true,
          adaptive: true,
          learnedFacts: [{ kind: 'goal', content: 'Protect focused mornings.' }],
        };
      }
      if (path === '/v1/agent' && init?.method === 'PATCH') return { id: 'agent-1' };
      throw new Error(`Unexpected API path ${path}`);
    });
    render(<AgentOnboarding />);
    expect(screen.queryByLabelText('Agent name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start private interview' }));
    expect(await screen.findByLabelText('Your answer')).toBeInTheDocument();
    change('Your answer', 'I protect focused mornings.');
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByLabelText('Agent name')).toBeInTheDocument();
    change('Agent name', 'North');
    fireEvent.click(screen.getByRole('button', { name: 'Name and enter ORBIT' }));
    await waitFor(() => expect(setOnboardedMock).toHaveBeenCalledWith(true));
    expect(router.replace).toHaveBeenCalledWith('/today');
  });

  it('restores the fourth interview question and unsent draft after reopening', async () => {
    loadOnboardingProgressMock.mockResolvedValue({
      started: true,
      interviewComplete: false,
      sessionId: 'saved-interview',
      question: 'What would make a first meeting uncomfortable?',
      progress: 0.6,
      adaptive: true,
      facts: [{ kind: 'constraint', content: 'Quiet first meetings.' }],
      answer: 'A crowded bar would',
      agentName: '',
    });
    render(<AgentOnboarding />);
    expect(
      await screen.findByText('What would make a first meeting uncomfortable?'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toHaveValue('A crowded bar would');
    expect(apiMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(saveOnboardingProgressMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'saved-interview',
          progress: 0.6,
          answer: 'A crowded bar would',
        }),
      ),
    );
  });

  it('shows the redacted transcript and submits only chosen reveal fields', async () => {
    const detail = {
      id: 'record-12345678',
      conversationId: 'conversation-1',
      otherUserId: 'user-2',
      intentKind: 'friendship',
      otherAgent: { name: 'Harbor' },
      verdict: {
        score: 0.91,
        reasons: ['Compatible pace'],
        suggestedFirstActivity: 'A short public walk',
        oneLineReason: 'Strong fit with clear boundaries.',
        flags: [],
      },
      myDecision: 'pending',
      otherDecision: 'pending',
      revealedAt: null,
      revealedFields: {},
      expiresAt: '2026-10-10T00:00:00.000Z',
    };
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/transcript')) {
        return {
          messages: [
            {
              id: 'message-1',
              speakerAgentId: 'agent-1',
              turnIndex: 0,
              redactedContent: 'I prefer a calm first meeting.',
            },
          ],
        };
      }
      if (path.endsWith('/decision') && init?.method === 'POST')
        return { ...detail, myDecision: 'reveal' };
      if (path === '/v1/introductions/record-12345678') return detail;
      throw new Error(`Unexpected API path ${path}`);
    });
    renderWithQuery(<IntroductionScreen />);
    expect(await screen.findByText('I prefer a calm first meeting.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Handle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal if they reveal' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        '/v1/introductions/record-12345678/decision',
        expect.objectContaining({
          body: JSON.stringify({ decision: 'reveal', fields: ['first_name', 'handle'] }),
        }),
      ),
    );
  });

  it('never fabricates an introduction when the query fails', async () => {
    apiMock.mockRejectedValue(new Error('API unavailable'));
    renderWithQuery(<IntroductionScreen />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('Strong fit with clear boundaries.')).not.toBeInTheDocument();
    expect(screen.queryByText('I prefer a calm first meeting.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reveal if they reveal' })).not.toBeInTheDocument();
  });

  it('pauses and deletes a watcher only after explicit confirmation', async () => {
    const watcher = {
      id: 'record-12345678',
      title: 'Public price check',
      active: true,
      hitCount: 1,
      lastRunAt: '2026-10-01T10:00:00.000Z',
      nextRunAt: '2026-10-01T11:00:00.000Z',
      schedule: '0 * * * *',
      spec: { query: 'systems book under $40', source: 'web' },
    };
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/v1/watchers' && init === undefined) return [watcher];
      if (path.endsWith('/hits'))
        return [{ id: 'hit-1', title: 'Systems Book', createdAt: '2026-10-01T10:00:00.000Z' }];
      if (path === '/v1/watchers/record-12345678' && init?.method === 'PATCH')
        return { ...watcher, active: false };
      if (path === '/v1/watchers/record-12345678' && init?.method === 'DELETE') return undefined;
      throw new Error(`Unexpected API path ${path}`);
    });
    renderWithQuery(<WatcherDetail />);
    expect(await screen.findByText('Systems Book')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause watcher' }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        '/v1/watchers/record-12345678',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete watcher' }));
    expect(screen.getByText('Delete this watcher?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete watcher' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/watchers'));
  });
});
