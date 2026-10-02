import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api, jsonBody } from './api';

export const defaultPushPreferences = {
  brief: true,
  reveal: true,
  approval: true,
  watcher: true,
  safety: true,
} as const;

Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

export const registerPushDevice = async (): Promise<{
  ok: boolean;
  message: string;
}> => {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      message: 'Remote push registration is available only in the native iOS and Android apps.',
    };
  }
  if (!Device.isDevice) {
    return { ok: false, message: 'Expo remote push requires a physical iOS or Android device.' };
  }
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  if (projectId === undefined || projectId.length === 0) {
    return {
      ok: false,
      message: 'Push is unavailable until EXPO_PUBLIC_EAS_PROJECT_ID is configured.',
    };
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    return { ok: false, message: 'Notification permission was not granted.' };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'ORBIT',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api(
    '/v1/push/register',
    jsonBody({
      pushToken: token,
      platform: Platform.OS,
      preferences: defaultPushPreferences,
    }),
  );
  return { ok: true, message: 'This device is registered for ORBIT push notifications.' };
};

export const installNotificationResponseHandler = (): Notifications.EventSubscription =>
  Notifications.addNotificationResponseReceivedListener((response) => {
    const deepLink = response.notification.request.content.data?.deepLink;
    if (typeof deepLink === 'string' && deepLink.startsWith('orbit://')) {
      void Linking.openURL(deepLink);
    }
  });
