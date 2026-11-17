import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { del, post } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

let current: string | null = null;

/** Ask permission, get an Expo push token and register it with the API. */
export async function registerForPush() {
  if (!Device.isDevice) return null; // emulators can't receive push
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'General', importance: Notifications.AndroidImportance.HIGH, lightColor: '#0d6b5c', vibrationPattern: [0, 200, 120, 200] });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) { console.warn('Push disabled: set EAS_PROJECT_ID (run `eas init`).'); return null; }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  current = data;
  await post('/notifications/push-token', { token: data, platform: Platform.OS });
  return data;
}

export async function unregisterPush() {
  if (current) await del('/notifications/push-token').catch(() => undefined);
  current = null;
}
