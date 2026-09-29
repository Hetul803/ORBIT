import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuthStore } from './store';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100';
const cachePrefix = 'orbit.api-cache:';

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
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (state.accessToken !== null) headers.set('Authorization', `Bearer ${state.accessToken}`);
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
  const method = init.method ?? 'GET';
  try {
    const response = await fetchWithAuth(path, init);
    const value = await decode<T>(response);
    if (method === 'GET')
      await AsyncStorage.setItem(`${cachePrefix}${path}`, JSON.stringify(value));
    return value;
  } catch (error: unknown) {
    if (method === 'GET') {
      const cached = await AsyncStorage.getItem(`${cachePrefix}${path}`);
      if (cached !== null) return JSON.parse(cached) as T;
    }
    throw error;
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
