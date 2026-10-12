import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  accessToken: null as string | null,
  refreshToken: null as string | null,
}));
const setTokens = vi.hoisted(() =>
  vi.fn((access: string, refresh: string) => {
    session.accessToken = access;
    session.refreshToken = refresh;
    return Promise.resolve();
  }),
);
const signOut = vi.hoisted(() =>
  vi.fn(() => {
    session.accessToken = null;
    session.refreshToken = null;
    return Promise.resolve();
  }),
);
vi.mock('@/store', () => ({
  useAuthStore: { getState: () => ({ ...session, setTokens, signOut }) },
  useNetworkStore: { getState: () => ({ markReachable: vi.fn(), markOffline: vi.fn() }) },
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
vi.mock('expo-device', () => ({ isDevice: true }));
vi.mock('@/offline', () => ({
  cacheResponse: vi.fn(),
  cachedResponse: vi.fn(),
  enqueueWrite: vi.fn(),
  flushOfflineQueue: vi.fn(() => Promise.resolve()),
  isOfflineQueueable: () => false,
  isOfflineReadable: () => false,
}));
vi.mock('@/transport', () => ({ setApiTransport: vi.fn() }));

const token = (subject: string, version: number): string =>
  `fixture.${btoa(JSON.stringify({ sub: subject, version }))}.fixture`;
const reply = (status: number, data: unknown): Response =>
  new Response(JSON.stringify(data), { status });

describe('persistent-session refresh', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://session.orbit.example');
    session.accessToken = token('fixture-user-one', 1);
    session.refreshToken = 'fixture-refresh-one';
    setTokens.mockClear();
    signOut.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('shares one rotating refresh across simultaneous expired requests', async () => {
    const next = token('fixture-user-one', 2);
    const fetchMock = vi.fn((url: string, init: RequestInit) =>
      url.endsWith('/v1/auth/refresh')
        ? reply(200, { accessToken: next, refreshToken: 'fixture-refresh-two' })
        : new Headers(init.headers).get('Authorization') === `Bearer ${next}`
          ? reply(200, { ok: true })
          : reply(401, {}),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { api } = await import('./api');
    expect(await Promise.all(['/one', '/two', '/three'].map((path) => api(path)))).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/v1/auth/refresh'))).toHaveLength(
      1,
    );
    expect(setTokens).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('keeps credentials when refresh is temporarily unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => reply(url.endsWith('/v1/auth/refresh') ? 503 : 401, {})),
    );
    const { api } = await import('./api');
    await expect(api('/one')).rejects.toMatchObject({ code: 'SESSION_REFRESH_UNAVAILABLE' });
    expect(session.refreshToken).toBe('fixture-refresh-one');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('requires sign-in only when the server actually rejects the refresh credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => reply(401, {})),
    );
    const { api } = await import('./api');
    await expect(api('/one')).rejects.toMatchObject({ status: 401 });
    expect(signOut).toHaveBeenCalledOnce();
    expect(session.accessToken).toBeNull();
  });

  it('never overwrites a new account while an old refresh is in flight', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/v1/auth/refresh')) {
          session.accessToken = token('fixture-user-two', 1);
          session.refreshToken = 'second-account-refresh';
          return reply(200, {
            accessToken: token('fixture-user-one', 2),
            refreshToken: 'old-account-refreshed',
          });
        }
        return reply(401, {});
      }),
    );
    const { api } = await import('./api');
    await expect(api('/one')).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(setTokens).not.toHaveBeenCalled();
    expect(session.refreshToken).toBe('second-account-refresh');
  });
});
