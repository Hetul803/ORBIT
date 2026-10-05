import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  onboarded: boolean;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  setOnboarded: (value: boolean) => void;
  hydrate: () => Promise<void>;
  signOut: () => Promise<void>;
}

const accessKey = 'orbit.access-token';
const refreshKey = 'orbit.refresh-token';

const getCredential = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') return globalThis.sessionStorage.getItem(key);
  return SecureStore.getItemAsync(key);
};

const setCredential = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    globalThis.sessionStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

const deleteCredential = async (key: string): Promise<void> => {
  if (Platform.OS === 'web') {
    globalThis.sessionStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  hydrated: false,
  onboarded: false,
  setTokens: async (accessToken, refreshToken) => {
    await Promise.all([
      setCredential(accessKey, accessToken),
      setCredential(refreshKey, refreshToken),
    ]);
    set({ accessToken, refreshToken });
  },
  setOnboarded: (onboarded) => set({ onboarded }),
  hydrate: async () => {
    const [accessToken, refreshToken] = await Promise.all([
      getCredential(accessKey),
      getCredential(refreshKey),
    ]);
    set({ accessToken, refreshToken, hydrated: true });
  },
  signOut: async () => {
    await Promise.all([deleteCredential(accessKey), deleteCredential(refreshKey)]);
    set({ accessToken: null, refreshToken: null, onboarded: false });
  },
}));

interface NetworkState {
  reachable: boolean;
  lastOfflineAt: number | null;
  queuedWrites: number;
  markReachable: () => void;
  markOffline: () => void;
  setQueuedWrites: (count: number) => void;
}

/** Transport state only; it reflects ORBIT API requests rather than guessing internet access. */
export const useNetworkStore = create<NetworkState>((set) => ({
  reachable: true,
  lastOfflineAt: null,
  queuedWrites: 0,
  markReachable: () => set({ reachable: true }),
  markOffline: () => set({ reachable: false, lastOfflineAt: Date.now() }),
  setQueuedWrites: (queuedWrites) => set({ queuedWrites }),
}));
