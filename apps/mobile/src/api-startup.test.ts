import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { platform } = vi.hoisted(() => ({ platform: { OS: 'ios' } }));

vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-constants', () => ({ default: { expoConfig: {}, expoGoConfig: null } }));
vi.mock('expo-device', () => ({ isDevice: true }));
vi.mock('./store', () => ({ useAuthStore: {}, useNetworkStore: {} }));
vi.mock('./offline', () => ({
  cacheResponse: vi.fn(),
  cachedResponse: vi.fn(),
  enqueueWrite: vi.fn(),
  flushOfflineQueue: vi.fn(),
  isOfflineQueueable: vi.fn(),
  isOfflineReadable: vi.fn(),
}));
vi.mock('./transport', () => ({ setApiTransport: vi.fn() }));

describe('API module startup across native and browser globals', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://startup-api.orbit.example/');
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(['ios', 'android'])('starts on %s with a window global but no location', async (os) => {
    platform.OS = os;
    // React Native defines window without providing a browser Location object.
    vi.stubGlobal('window', {});
    const api = await import('./api');
    expect(api.configuredApiUrl).toBe('https://startup-api.orbit.example');
  });

  it('does not inspect browser location at all on native', async () => {
    platform.OS = 'ios';
    vi.stubGlobal('window', {
      get location(): never {
        throw new Error('Native startup must not inspect browser location');
      },
    });
    const api = await import('./api');
    expect(api.configuredApiUrl).toBe('https://startup-api.orbit.example');
  });

  it('preserves development hostname resolution in the web app', async () => {
    platform.OS = 'web';
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EXPO_PUBLIC_API_URL', '');
    vi.stubGlobal('window', { location: { hostname: 'founder.orbit.example' } });
    const api = await import('./api');
    expect(api.configuredApiUrl).toBe('http://founder.orbit.example:4100');
  });

  it('starts with explicit production configuration without a browser window', async () => {
    platform.OS = 'web';
    vi.stubGlobal('window', undefined);
    const api = await import('./api');
    expect(api.configuredApiUrl).toBe('https://startup-api.orbit.example');
  });
});
