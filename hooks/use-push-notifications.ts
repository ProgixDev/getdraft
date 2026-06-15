import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { notificationsService } from '@/services/notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Route the user to the right screen based on the notification's `data` payload.
 * Backend schema:
 *   { type: 'new_match' | 'new_message', matchId: string }
 *   { type: 'outreach', outreachId: string }
 */
function routeFromNotificationData(data: unknown) {
  if (!data || typeof data !== 'object') return;
  const { type, matchId, outreachId } = data as {
    type?: string;
    matchId?: string;
    outreachId?: string;
  };
  if ((type === 'new_match' || type === 'new_message') && matchId) {
    router.push(`/chat/${matchId}` as never);
    return;
  }
  if (type === 'outreach' && outreachId) {
    // No dedicated outreach detail screen yet — drop into the Draft Board
    // (parent's outreach inbox) so the new thread is visible.
    router.push('/(tabs)/matches' as never);
  }
}

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

export function usePushNotifications(
  enabled: boolean,
  /**
   * True once the navigation <Stack> is mounted (appState === "app"). The
   * cold-start deep-link replay waits for this — otherwise router.push runs
   * during the splash/welcome screens before any navigator exists, throws
   * "navigation hasn't mounted", and the tapped notification is lost.
   */
  routingReady: boolean = true,
) {
  const attemptedRef = useRef(false);
  const coldStartHandledRef = useRef(false);

  // Token registration: runs once after auth.
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

  // Tap-handling: deep-link into chat/outreach when the user opens a
  // notification. Only active while the user is authenticated.
  useEffect(() => {
    if (!enabled) {
      coldStartHandledRef.current = false;
      return;
    }

    // Cold-start: app launched by tapping a notification. Wait until the
    // navigator is mounted before replaying it (the launch response persists,
    // so deferring loses nothing).
    if (routingReady && !coldStartHandledRef.current) {
      coldStartHandledRef.current = true;
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (response) routeFromNotificationData(response.notification.request.content.data);
        })
        .catch(() => {});
    }

    // Warm: tapped while app is foreground/background.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromNotificationData(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, [enabled, routingReady]);
}
