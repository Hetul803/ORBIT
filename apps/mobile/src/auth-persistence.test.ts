import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactNative from 'react-native';

const credentials = vi.hoisted(() => new Map<string, string>());
vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<typeof ReactNative>();
  return { ...original, Platform: { ...original.Platform, OS: 'ios' } };
});
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn((key: string) => Promise.resolve(credentials.get(key) ?? null)),
  setItemAsync: vi.fn((key: string, value: string) => {
    credentials.set(key, value);
    return Promise.resolve();
  }),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(() => Promise.resolve(null)) },
}));

describe('native credential restoration', () => {
  beforeEach(() => {
    credentials.clear();
    vi.resetModules();
  });
  it('restores the saved iOS Keychain credentials after a fresh store initializes', async () => {
    const first = await import('./store');
    await first.useAuthStore.getState().setTokens('fixture-access', 'fixture-refresh');
    vi.resetModules();
    const reopened = await import('./store');
    expect(reopened.useAuthStore.getState().accessToken).toBeNull();
    await reopened.useAuthStore.getState().hydrate();
    expect(reopened.useAuthStore.getState()).toMatchObject({
      accessToken: 'fixture-access',
      refreshToken: 'fixture-refresh',
      hydrated: true,
    });
  });
});
