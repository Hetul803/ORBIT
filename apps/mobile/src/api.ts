import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { resolveApiUrl } from './api-url';
import { offlineScope } from './offline-scope';
import {
  cacheResponse,
  cachedResponse,
  enqueueWrite,
  flushOfflineQueue,
  isOfflineQueueable,
  isOfflineReadable,
} from './offline';
import { useAuthStore, useNetworkStore } from './store';
import { setApiTransport } from './transport';

export { resolveApiUrl } from './api-url';

const developmentHost = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
// React Native defines window, but it does not provide a browser Location object.
// This module loads before the root layout/error monitor, so native startup must
// never inspect DOM globals even when an explicit production API URL is set.
const webHost =
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : undefined;

export const configuredApiUrl = resolveApiUrl({
  ...(process.env.EXPO_PUBLIC_API_URL === undefined
    ? {}
    : { configured: process.env.EXPO_PUBLIC_API_URL }),
  platform: Platform.OS,
  physicalDevice: Device.isDevice,
  ...(developmentHost === undefined ? {} : { developmentHost }),
  ...(webHost === undefined ? {} : { webHost }),
  production: process.env.NODE_ENV === 'production',
});

export const requireApiUrl = (): string => {
  if (configuredApiUrl.length > 0) return configuredApiUrl;
  throw new ApiRequestError(
    'ORBIT is not connected. Set EXPO_PUBLIC_API_URL for this device and restart the app.',
    0,
    'API_URL_MISSING',
  );
};

export class ApiRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const decode = async <T>(response: Response): Promise<T> => {
  if (response.status === 204) return undefined as T;
  const value: unknown = await response.json();
  if (!response.ok) {
    const record =
      typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
    const error =
      typeof record.error === 'object' && record.error !== null
        ? (record.error as Record<string, unknown>)
        : {};
    throw new ApiRequestError(
      typeof error.message === 'string' ? error.message : 'ORBIT could not complete the request.',
      response.status,
      typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
      error.details,
    );
  }
  return value as T;
};

const fetchBounded = async (
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> => {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (init.signal?.aborted) abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if (controller.signal.aborted)
      throw new TypeError('ORBIT request timed out or was cancelled.', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
};

let refreshFlight: { token: string; promise: Promise<void> } | null = null;

const refreshSession = async (baseUrl: string, refreshToken: string): Promise<void> => {
  if (refreshFlight?.token === refreshToken) return refreshFlight.promise;
  const promise = (async (): Promise<void> => {
    const refreshed = await fetchBounded(`${baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    // Never sign out because of an outage, and never overwrite a different account/session.
    if (useAuthStore.getState().refreshToken !== refreshToken) return;
    if (refreshed.status === 401) {
      await useAuthStore.getState().signOut();
      return;
    }
    if (!refreshed.ok)
      throw new ApiRequestError(
        'Your session could not reconnect yet. Please try again.',
        refreshed.status,
        'SESSION_REFRESH_UNAVAILABLE',
      );
    const tokens = await decode<{ accessToken: string; refreshToken: string }>(refreshed);
    if (useAuthStore.getState().refreshToken === refreshToken) {
      await useAuthStore.getState().setTokens(tokens.accessToken, tokens.refreshToken);
    }
  })();
  const flight = { token: refreshToken, promise };
  refreshFlight = flight;
  try {
    await promise;
  } finally {
    if (refreshFlight === flight) refreshFlight = null;
  }
};

const fetchWithAuth = async (path: string, init: RequestInit): Promise<Response> => {
  const state = useAuthStore.getState();
  const headers = new Headers(init.headers);
  // Fastify rejects an empty body advertised as JSON. Keep the content type attached
  // to actual JSON writes, but let bodyless POST/DELETE requests remain bodyless.
  if (init.body !== undefined && init.body !== null && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (state.accessToken !== null) headers.set('Authorization', `Bearer ${state.accessToken}`);
  const baseUrl = requireApiUrl();
  const timeoutMs = path === '/v1/connections/gmail/sync' ? 20 * 60_000 : 30_000;
  let response = await fetchBounded(`${baseUrl}${path}`, { ...init, headers }, timeoutMs);
  if (response.status !== 401 || state.refreshToken === null) return response;
  const current = useAuthStore.getState();
  if (offlineScope(current.accessToken) !== offlineScope(state.accessToken)) {
    throw new ApiRequestError('Your session changed. Please try again.', 401, 'SESSION_CHANGED');
  }
  if (current.accessToken === state.accessToken) await refreshSession(baseUrl, state.refreshToken);
  const next = useAuthStore.getState();
  if (next.accessToken === null) return response;
  if (offlineScope(next.accessToken) !== offlineScope(state.accessToken)) {
    throw new ApiRequestError('Your session changed. Please try again.', 401, 'SESSION_CHANGED');
  }
  headers.set('Authorization', `Bearer ${next.accessToken}`);
  response = await fetchBounded(`${baseUrl}${path}`, { ...init, headers }, timeoutMs);
  return response;
};

setApiTransport(fetchWithAuth);

export const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const scope = offlineScope(useAuthStore.getState().accessToken);
  const method = (init.method ?? 'GET').toUpperCase();
  try {
    const response = await fetchWithAuth(path, init);
    const value = await decode<T>(response);
    useNetworkStore.getState().markReachable();
    if (isOfflineReadable(path, method)) void cacheResponse(path, value, scope);
    void flushOfflineQueue(fetchWithAuth).catch(() => undefined);
    return value;
  } catch (error: unknown) {
    const offline =
      error instanceof TypeError || (error instanceof ApiRequestError && error.status === 0);
    if (!offline) throw error;
    if (scope !== offlineScope(useAuthStore.getState().accessToken)) {
      throw new ApiRequestError('Your session changed. Sign in again.', 401, 'SESSION_CHANGED');
    }
    useNetworkStore.getState().markOffline();
    if (isOfflineReadable(path, method)) {
      const cached = await cachedResponse(path);
      if (cached !== null) return cached.value as T;
    }
    if (isOfflineQueueable(path, method)) {
      await enqueueWrite(path, init);
      return { ok: true, queued: true } as T;
    }
    throw new ApiRequestError(
      'ORBIT cannot reach its server. Cached information is shown when available; try again when you are back online.',
      0,
      'NETWORK_UNAVAILABLE',
    );
  }
};

export const jsonBody = (value: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(value),
});

export const patchBody = (value: unknown): RequestInit => ({
  method: 'PATCH',
  body: JSON.stringify(value),
});

export const download = async (path: string): Promise<Uint8Array> => {
  const response = await fetchWithAuth(path, { method: 'GET' });
  if (!response.ok) await decode(response);
  return new Uint8Array(await response.arrayBuffer());
};
