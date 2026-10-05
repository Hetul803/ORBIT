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
import * as Sentry from '@sentry/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useOrbitTheme } from '@orbit/ui';

import { queryClient } from '@/query';
import { installNotificationResponseHandler } from '@/notifications';
import { useAuthStore } from '@/store';

void SplashScreen.preventAutoHideAsync();

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled:
    process.env.EXPO_PUBLIC_SENTRY_DSN !== undefined &&
    process.env.EXPO_PUBLIC_SENTRY_DSN.length > 0,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

function RootLayout(): ReactNode {
  const hydrate = useAuthStore((state) => state.hydrate);
  const hydrated = useAuthStore((state) => state.hydrated);
  const accessToken = useAuthStore((state) => state.accessToken);
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

  const inAuth = segments[0] === '(auth)';
  const routeAllowed = accessToken === null ? inAuth : !inAuth;

  useEffect(() => {
    if (!fontsLoaded || !hydrated || routeAllowed) return;
    router.replace(accessToken === null ? '/sign-in' : '/today');
  }, [accessToken, fontsLoaded, hydrated, routeAllowed, router]);

  if (!fontsLoaded || !hydrated || !routeAllowed) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.ground },
          animation: 'slide_from_right',
        }}
      />
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
