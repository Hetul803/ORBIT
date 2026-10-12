import 'react-native-reanimated';
import 'react-native-gesture-handler';

import {
  InstrumentSans_400Regular,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import { MartianMono_500Medium } from '@expo-google-fonts/martian-mono';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { OrbitText, useOrbitTheme } from '@orbit/ui';
import { scrubTelemetryEvent } from '@orbit/shared';

import { flushOfflineQueue, hydrateOfflineQueue } from '@/offline';
import { queryClient } from '@/query';
import { installNotificationResponseHandler } from '@/notifications';
import { useAuthStore, useNetworkStore } from '@/store';
import { apiTransport } from '@/transport';
import { configuredApiUrl } from '@/api';
import { clearSocialOfflineCache } from '@/offline';
import { subscribeSafetyUpdates } from '@/safety-updates';
import { MainNavigation } from '@/navigation';
import { GoogleSyncObserver } from '@/google-sync';

void SplashScreen.preventAutoHideAsync();

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled:
    process.env.EXPO_PUBLIC_SENTRY_DSN !== undefined &&
    process.env.EXPO_PUBLIC_SENTRY_DSN.length > 0,
  environment: process.env.NODE_ENV,
  // Keep the budgeted alpha error-only: no performance or replay collection.
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeBreadcrumb: () => null,
  beforeSend: scrubTelemetryEvent,
  beforeSendTransaction: scrubTelemetryEvent,
});

function RootLayout(): ReactNode {
  const hydrate = useAuthStore((state) => state.hydrate);
  const hydrated = useAuthStore((state) => state.hydrated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const resumeOnboarding = useAuthStore((state) => state.resumeOnboarding);
  const reachable = useNetworkStore((state) => state.reachable);
  const queuedWrites = useNetworkStore((state) => state.queuedWrites);
  const segments = useSegments();
  const router = useRouter();
  const { colors, dark } = useOrbitTheme();
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSans_400Regular,
    InstrumentSans_600SemiBold,
    MartianMono_500Medium,
  });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useEffect(() => {
    if (fontsLoaded && hydrated) void SplashScreen.hideAsync();
  }, [fontsLoaded, hydrated]);
  useEffect(() => {
    const subscription = installNotificationResponseHandler();
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    void hydrateOfflineQueue();
    void clearSocialOfflineCache();
    void flushOfflineQueue(apiTransport).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (accessToken === null || configuredApiUrl.length === 0) return;
    return subscribeSafetyUpdates(accessToken, configuredApiUrl);
  }, [accessToken]);

  const inAuth = segments[0] === '(auth)';
  const inOnboarding = segments[0] === '(onboarding)';
  const routeAllowed = accessToken === null ? inAuth : !inAuth;

  useEffect(() => {
    if (!fontsLoaded || !hydrated || routeAllowed) return;
    router.replace(accessToken === null ? '/sign-in' : resumeOnboarding ? '/agent' : '/today');
  }, [accessToken, fontsLoaded, hydrated, resumeOnboarding, routeAllowed, router]);

  if (!fontsLoaded || !hydrated || !routeAllowed) return null;
  return (
    <QueryClientProvider client={queryClient}>
      {accessToken !== null ? <GoogleSyncObserver /> : null}
      <View style={styles.flex}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        {!reachable ? (
          <View
            style={[
              styles.offlineBanner,
              { backgroundColor: colors.alert, borderColor: colors.ink },
            ]}
          >
            <OrbitText variant="label" style={{ color: colors.ink }}>
              ORBIT is offline. Cached information is shown
              {queuedWrites > 0
                ? `; ${String(queuedWrites)} action${queuedWrites === 1 ? '' : 's'} queued.`
                : '.'}
            </OrbitText>
          </View>
        ) : null}
        <View style={styles.flex}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.ground },
              animation: 'slide_from_right',
            }}
          />
        </View>
        {accessToken !== null && !inAuth && !inOnboarding ? <MainNavigation /> : null}
      </View>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  offlineBanner: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
