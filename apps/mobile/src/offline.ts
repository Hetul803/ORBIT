import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { useNetworkStore } from './store';

const cachePrefix = 'orbit.offline.cache.v1:';
const queueKey = 'orbit.offline.queue.v1';
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

const cacheKey = (path: string): string => `${cachePrefix}${encodeURIComponent(path)}`;

export { isOfflineQueueable, isOfflineReadable } from './offline-policy';

export const cacheResponse = async (path: string, value: unknown): Promise<void> => {
  await storage.setItem(
    cacheKey(path),
    JSON.stringify({ cachedAt: new Date().toISOString(), value }),
  );
};

export const cachedResponse = async (
  path: string,
): Promise<{ value: unknown; cachedAt: string } | null> => {
  const raw = await storage.getItem(cacheKey(path));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as CachedRecord;
    if (typeof parsed.cachedAt !== 'string' || !('value' in parsed)) return null;
    return { value: parsed.value, cachedAt: parsed.cachedAt };
  } catch {
    return null;
  }
};

const readQueue = async (): Promise<QueuedWrite[]> => {
  const raw = await storage.getItem(queueKey);
  if (raw === null) return [];
  try {
    const queue = JSON.parse(raw) as unknown;
    return Array.isArray(queue) ? (queue as QueuedWrite[]) : [];
  } catch {
    return [];
  }
};

const writeQueue = async (queue: readonly QueuedWrite[]): Promise<void> => {
  await storage.setItem(queueKey, JSON.stringify(queue));
  useNetworkStore.getState().setQueuedWrites(queue.length);
};

export const hydrateOfflineQueue = async (): Promise<void> => {
  useNetworkStore.getState().setQueuedWrites((await readQueue()).length);
};

export const enqueueWrite = async (path: string, init: RequestInit): Promise<void> => {
  const queue = await readQueue();
  const headers = new Headers(init.headers);
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
  const queue = await readQueue();
  const remaining: QueuedWrite[] = [];
  let replayed = 0;
  for (let index = 0; index < queue.length; index += 1) {
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
  await writeQueue(remaining);
  return { replayed, remaining: remaining.length };
};
