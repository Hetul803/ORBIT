import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { useAuthStore, useNetworkStore } from './store';
import { offlineScope } from './offline-scope';

const cachePrefix = 'orbit.offline.cache.v2:';
const queuePrefix = 'orbit.offline.queue.v2:';
const currentScope = (): string | null => offlineScope(useAuthStore.getState().accessToken);
const maxQueuedWrites = 80;

interface CachedRecord {
  cachedAt: string;
  value: unknown;
}

interface QueuedWrite {
  id: string;
  path: string;
  init: { method: string; body?: string; headers?: Record<string, string> };
  queuedAt: string;
}

const storage = {
  getItem: async (key: string): Promise<string | null> =>
    Platform.OS === 'web' ? globalThis.localStorage.getItem(key) : AsyncStorage.getItem(key),
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      globalThis.localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
};

const cacheKey = (path: string, scope: string): string =>
  `${cachePrefix}${scope}:${encodeURIComponent(path)}`;

export const clearOfflineData = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    for (const key of Object.keys(globalThis.localStorage)) {
      if (key.startsWith('orbit.offline.')) globalThis.localStorage.removeItem(key);
    }
  } else {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
      key.startsWith('orbit.offline.'),
    );
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  }
  useNetworkStore.getState().setQueuedWrites(0);
};

export { isOfflineQueueable, isOfflineReadable } from './offline-policy';

export const cacheResponse = async (
  path: string,
  value: unknown,
  scope = currentScope(),
): Promise<void> => {
  if (scope === null || scope !== currentScope()) return;
  await storage.setItem(
    cacheKey(path, scope),
    JSON.stringify({ cachedAt: new Date().toISOString(), value }),
  );
};

export const cachedResponse = async (
  path: string,
): Promise<{ value: unknown; cachedAt: string } | null> => {
  const scope = currentScope();
  if (scope === null) return null;
  const raw = await storage.getItem(cacheKey(path, scope));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as CachedRecord;
    if (typeof parsed.cachedAt !== 'string' || !('value' in parsed)) return null;
    return { value: parsed.value, cachedAt: parsed.cachedAt };
  } catch {
    return null;
  }
};

const readQueue = async (scope = currentScope()): Promise<QueuedWrite[]> => {
  if (scope === null) return [];
  const raw = await storage.getItem(`${queuePrefix}${scope}`);
  if (raw === null) return [];
  try {
    const queue = JSON.parse(raw) as unknown;
    return Array.isArray(queue) ? (queue as QueuedWrite[]) : [];
  } catch {
    return [];
  }
};

const writeQueue = async (queue: readonly QueuedWrite[], scope = currentScope()): Promise<void> => {
  if (scope === null || scope !== currentScope()) return;
  await storage.setItem(`${queuePrefix}${scope}`, JSON.stringify(queue));
  useNetworkStore.getState().setQueuedWrites(queue.length);
};

export const hydrateOfflineQueue = async (): Promise<void> => {
  useNetworkStore.getState().setQueuedWrites((await readQueue()).length);
};

export const enqueueWrite = async (path: string, init: RequestInit): Promise<void> => {
  const queue = await readQueue();
  const headers = new Headers(init.headers);
  headers.delete('Authorization');
  headers.delete('Cookie');
  const method = init.method ?? 'POST';
  const body = typeof init.body === 'string' ? init.body : undefined;
  queue.push({
    id: `${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
    path,
    init: {
      method,
      ...(body === undefined ? {} : { body }),
      headers: Object.fromEntries(headers.entries()),
    },
    queuedAt: new Date().toISOString(),
  });
  await writeQueue(queue.slice(-maxQueuedWrites));
};

export const flushOfflineQueue = async (
  send: (path: string, init: RequestInit) => Promise<Response>,
): Promise<{ replayed: number; remaining: number }> => {
  const scope = currentScope();
  const queue = await readQueue(scope);
  const remaining: QueuedWrite[] = [];
  let replayed = 0;
  for (let index = 0; index < queue.length; index += 1) {
    if (scope !== currentScope()) return { replayed, remaining: 0 };
    const write = queue[index];
    if (write === undefined) continue;
    try {
      const response = await send(write.path, write.init);
      if (!response.ok && response.status >= 500) throw new Error('server unavailable');
      // A 4xx is terminal client feedback, so it does not replay indefinitely.
      replayed += 1;
    } catch {
      remaining.push(...queue.slice(index));
      break;
    }
  }
  await writeQueue(remaining, scope);
  return { replayed, remaining: remaining.length };
};
