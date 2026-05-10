import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { notificationsService } from '@/services/notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFFFFF',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  const status =
    existing === 'granted'
      ? existing
      : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) return null;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  return token;
}

export function usePushNotifications(enabled: boolean) {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      attemptedRef.current = false;
      return;
    }
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    (async () => {
      try {
        const token = await getExpoPushToken();
        if (!token) {
          attemptedRef.current = false;
          return;
        }
        await notificationsService.registerToken(
          token,
          Platform.OS === 'ios' ? 'ios' : 'android',
        );
      } catch {
        attemptedRef.current = false;
      }
    })();
  }, [enabled]);
}
