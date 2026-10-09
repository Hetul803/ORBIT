import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { useAuthStore } from './store';
import {
  cacheResponse,
  cachedResponse,
  clearOfflineData,
  enqueueWrite,
  flushOfflineQueue,
} from './offline';

const token = (sub: string): string => `header.${btoa(JSON.stringify({ sub }))}.signature`;
describe('offline account isolation', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ accessToken: token('user-alpha-123') });
  });
  it("never presents another account's cached Catch", async () => {
    await cacheResponse('/v1/life/catch', { privateItem: 'alpha-only' });
    expect((await cachedResponse('/v1/life/catch'))?.value).toEqual({ privateItem: 'alpha-only' });
    useAuthStore.setState({ accessToken: token('user-beta-123') });
    expect(await cachedResponse('/v1/life/catch')).toBeNull();
    useAuthStore.setState({ accessToken: null });
    expect(await cachedResponse('/v1/life/catch')).toBeNull();
  });
  it("does not replay one account's writes under another account or persist credentials", async () => {
    await enqueueWrite('/v1/life/catch/record-123/dismiss', {
      method: 'POST',
      headers: { Authorization: 'Bearer private-access-token' },
    });
    expect(JSON.stringify(localStorage)).not.toContain('private-access-token');
    useAuthStore.setState({ accessToken: token('user-beta-123') });
    const send = vi.fn(async () => Promise.resolve(new Response(null, { status: 204 })));
    expect(await flushOfflineQueue(send)).toEqual({ replayed: 0, remaining: 0 });
    expect(send).not.toHaveBeenCalled();
    await clearOfflineData();
    expect(localStorage.length).toBe(0);
  });
});
