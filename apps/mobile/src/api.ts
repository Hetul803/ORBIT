import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { useAuthStore } from './store';
import { resolveApiUrl } from './api-url';

export { resolveApiUrl } from './api-url';

const developmentHost =
  Constants.expoConfig?.hostUri ??
  (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost;

export const configuredApiUrl = resolveApiUrl({
  ...(process.env.EXPO_PUBLIC_API_URL === undefined
    ? {}
    : { configured: process.env.EXPO_PUBLIC_API_URL }),
  platform: Platform.OS,
  physicalDevice: Device.isDevice,
  ...(developmentHost === undefined ? {} : { developmentHost }),
  ...(typeof window === 'undefined' ? {} : { webHost: window.location.hostname }),
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
    );
  }
  return value as T;
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
  let response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (response.status !== 401 || state.refreshToken === null) return response;
  const refreshed = await fetch(`${baseUrl}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: state.refreshToken }),
  });
  if (!refreshed.ok) {
    await state.signOut();
    return response;
  }
  const tokens = await decode<{ accessToken: string; refreshToken: string }>(refreshed);
  await state.setTokens(tokens.accessToken, tokens.refreshToken);
  headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  return response;
};

export const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetchWithAuth(path, init);
  return decode<T>(response);
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
