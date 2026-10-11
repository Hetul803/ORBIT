import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { router, usePathname } from 'expo-router';
import { AppState } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());
const setTokensMock = vi.hoisted(() => vi.fn());
const refreshSafetyMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/api', () => {
  class ApiRequestError extends Error {
    public constructor(
      message: string,
      public readonly status: number,
      public readonly code: string,
      public readonly details?: unknown,
    ) {
      super(message);
    }
  }
  return {
    api: apiMock,
    ApiRequestError,
    configuredApiUrl: 'http://localhost:4100',
    jsonBody: (value: unknown) => ({ method: 'POST', body: JSON.stringify(value) }),
  };
});
vi.mock('@/store', () => ({
  useAuthStore: (selector: (state: { setTokens: typeof setTokensMock }) => unknown) =>
    selector({ setTokens: setTokensMock }),
}));
vi.mock('@/safety-updates', () => ({ refreshSafetySurfaces: refreshSafetyMock }));

import { ApiRequestError } from '@/api';
import { useGoogleReconnectPrompt } from '@/google-reconnect';
import { useWaitlistStore } from '@/waitlist';
import SignIn from '../app/(auth)/sign-in';
import Waitlist from '../app/(auth)/waitlist';
import Safety from '../app/safety';

const change = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('public-alpha mobile controls (real components, mocked transport)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    apiMock.mockReset();
    setTokensMock.mockClear();
    refreshSafetyMock.mockClear();
    vi.mocked(router.replace).mockClear();
    vi.mocked(usePathname).mockReturnValue('/connections');
    vi.spyOn(AppState, 'currentState', 'get').mockReturnValue('active');
    useWaitlistStore.getState().clear();
  });

  it.each(['EARLY_ACCESS_FULL', 'ALPHA_ADMISSION_PAUSED'])(
    'routes verified %s responses to an honest waitlist, without logging in',
    async (code) => {
      apiMock
        .mockResolvedValueOnce({ ok: true, expiresIn: 600, resendAfterSeconds: 30 })
        .mockRejectedValueOnce(
          new ApiRequestError('No new account was created.', 503, code, {
            capacity: 100,
            waitlistToken: 'purpose-bound-test-token',
          }),
        );
      render(<SignIn />);
      change('Email', 'new@orbit.test');
      fireEvent.click(screen.getByRole('button', { name: 'Send six-digit code' }));
      await screen.findByLabelText('Code');
      change('Code', '123456');
      change('What should we call you?', 'New adult');
      change('Date of birth', '1990-01-01');
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/waitlist'));
      expect(setTokensMock).not.toHaveBeenCalled();
      expect(useWaitlistStore.getState()).toMatchObject({
        email: 'new@orbit.test',
        capacity: 100,
        verificationToken: 'purpose-bound-test-token',
        paused: code === 'ALPHA_ADMISSION_PAUSED',
      });
    },
  );

  it('does not claim a waitlist entry on failure, and removes it only after confirmation and server success', async () => {
    useWaitlistStore.getState().set({
      email: 'new@orbit.test',
      verificationToken: 'verified-test-token',
      capacity: 100,
      paused: false,
    });
    apiMock
      .mockRejectedValueOnce(new Error('Connection unavailable'))
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    render(<Waitlist />);
    expect(screen.getByText(/no promised invitation date/iu)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(await screen.findByText('Connection unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Your verified email is saved')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    await screen.findByText('Your verified email is saved');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove my waitlist entry' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove my waitlist entry' }));
    expect(apiMock).toHaveBeenCalledTimes(2);
    fireEvent.click(await screen.findByRole('button', { name: 'Keep my entry' }));
    expect(screen.getByRole('button', { name: 'Remove my waitlist entry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove my waitlist entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal from waitlist' }));
    await waitFor(() =>
      expect(screen.queryByText('Your verified email is saved')).not.toBeInTheDocument(),
    );
    expect(apiMock).toHaveBeenLastCalledWith('/v1/waitlist', {
      method: 'DELETE',
      body: JSON.stringify({ verificationToken: 'verified-test-token' }),
    });
  });

  it('requires verified email before joining and clears the transient token on return to sign-in', () => {
    render(<Waitlist />);
    expect(screen.queryByRole('button', { name: 'Join the waitlist' })).not.toBeInTheDocument();
    expect(screen.getByText('Verify your email first')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to an existing account' }));
    expect(router.replace).toHaveBeenCalledWith('/sign-in');
    expect(useWaitlistStore.getState().verificationToken).toBeNull();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('confirms the permanent block, allows cancellation, and does not mislabel a committed block when cache refresh fails', async () => {
    apiMock.mockResolvedValue({ bidirectional: true, permanent: true });
    refreshSafetyMock.mockRejectedValueOnce(new Error('Refresh failed'));
    render(<Safety />);
    change('User ID', 'subject-12345678');
    fireEvent.click(screen.getByRole('button', { name: 'Block this person' }));
    expect(apiMock).not.toHaveBeenCalled();
    expect(screen.getByText('No expiry or unblock option')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel block' }));
    expect(apiMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Block this person' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm permanent block' }));
    expect(await screen.findByText(/Blocked immediately in both directions/iu)).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(refreshSafetyMock).toHaveBeenCalled();
    expect(screen.queryByText('Refresh failed')).not.toBeInTheDocument();
  });

  it('uses the real report receipt and discloses missing operator configuration instead of claiming delivery', async () => {
    apiMock.mockResolvedValueOnce({
      conversationSuppressed: false,
      operatorAlerts: { configured: false },
    });
    render(<Safety />);
    change('User ID', 'subject-12345678');
    change('What happened?', 'Please review this concern.');
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(
      await screen.findByText(/No conversation was attached.*not a staffed public alpha/iu),
    ).toBeInTheDocument();
    expect(screen.queryByText(/hidden pending review/iu)).not.toBeInTheDocument();
  });

  it('measures a foreground, focused reconnect prompt once per expiry episode, without blocking on telemetry failure', async () => {
    apiMock.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ recorded: true });
    const hook = renderHook(
      ({ visible, episode, updatedAt }: { visible: boolean; episode: string; updatedAt: number }) =>
        useGoogleReconnectPrompt('connections', visible, episode, updatedAt),
      { initialProps: { visible: false, episode: '2026-10-11T10:00:00.000Z', updatedAt: 1 } },
    );
    expect(apiMock).not.toHaveBeenCalled();
    hook.rerender({ visible: true, episode: '2026-10-11T10:00:00.000Z', updatedAt: 2 });
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    hook.rerender({ visible: true, episode: '2026-10-11T10:00:00.000Z', updatedAt: 3 });
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    hook.rerender({ visible: true, episode: '2026-10-11T10:00:00.000Z', updatedAt: 4 });
    expect(apiMock).toHaveBeenCalledTimes(2);
    vi.mocked(usePathname).mockReturnValue('/today');
    hook.rerender({ visible: true, episode: '2026-10-12T10:00:00.000Z', updatedAt: 5 });
    expect(apiMock).toHaveBeenCalledTimes(2);
    vi.mocked(usePathname).mockReturnValue('/connections');
    hook.rerender({ visible: true, episode: '2026-10-12T10:00:00.000Z', updatedAt: 6 });
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(3));
    expect(apiMock).toHaveBeenLastCalledWith('/v1/connections/gmail/reconnect-prompt', {
      method: 'POST',
      body: JSON.stringify({ source: 'connections', expiredAt: '2026-10-12T10:00:00.000Z' }),
    });
  });

  it('does not count a reconnect prompt when the application is backgrounded', () => {
    vi.spyOn(AppState, 'currentState', 'get').mockReturnValue('background');
    renderHook(() => useGoogleReconnectPrompt('connections', true, '2026-10-11T10:00:00.000Z', 1));
    expect(apiMock).not.toHaveBeenCalled();
  });
});
