import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  onboarded: boolean;
  resumeOnboarding: boolean;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  setOnboarded: (value: boolean) => void;
  hydrate: () => Promise<void>;
  signOut: () => Promise<void>;
}

const accessKey = 'orbit.access-token';
const refreshKey = 'orbit.refresh-token';
const onboardingKey = 'orbit.onboarding-progress.v1';

export interface OnboardingProgress {
  started: boolean;
  interviewComplete: boolean;
  sessionId?: string;
  question: string;
  progress: number;
  adaptive: boolean;
  facts: { kind: string; content: string }[];
  answer?: string;
  agentName?: string;
}

export const loadOnboardingProgress = async (): Promise<OnboardingProgress | null> => {
  const stored = await AsyncStorage.getItem(onboardingKey);
  if (stored === null) return null;
  try {
    return JSON.parse(stored) as OnboardingProgress;
  } catch {
    await AsyncStorage.removeItem(onboardingKey);
    return null;
  }
};

export const saveOnboardingProgress = async (progress: OnboardingProgress): Promise<void> => {
  await AsyncStorage.setItem(onboardingKey, JSON.stringify(progress));
};

export const clearOnboardingProgress = async (): Promise<void> => {
  await AsyncStorage.removeItem(onboardingKey);
};

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
  resumeOnboarding: false,
  setTokens: async (accessToken, refreshToken) => {
    await Promise.all([
      setCredential(accessKey, accessToken),
      setCredential(refreshKey, refreshToken),
    ]);
    set({ accessToken, refreshToken });
  },
  setOnboarded: (onboarded) => set({ onboarded, resumeOnboarding: !onboarded }),
  hydrate: async () => {
    const [accessToken, refreshToken, savedProgress] = await Promise.all([
      getCredential(accessKey),
      getCredential(refreshKey),
      loadOnboardingProgress(),
    ]);
    set({
      accessToken,
      refreshToken,
      hydrated: true,
      resumeOnboarding: accessToken !== null && savedProgress !== null,
    });
  },
  signOut: async () => {
    set({ accessToken: null, refreshToken: null, onboarded: false, resumeOnboarding: false });
    const [{ queryClient }, { clearOfflineData }] = await Promise.all([
      import('./query'),
      import('./offline'),
    ]);
    await queryClient.cancelQueries();
    queryClient.clear();
    await Promise.all([
      deleteCredential(accessKey),
      deleteCredential(refreshKey),
      clearOnboardingProgress(),
      clearOfflineData(),
    ]);
    set({ accessToken: null, refreshToken: null, onboarded: false, resumeOnboarding: false });
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
