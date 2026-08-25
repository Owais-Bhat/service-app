import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Foreground behavior — without this, a push arriving while the app is open
// would be silently swallowed instead of shown as a banner/sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('[push] skipped — not a physical device (simulator/emulator)');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#15a05a',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    console.warn('[push] permission not granted, status:', status);
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn('[push] no EAS projectId found in Constants.expoConfig.extra.eas');
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[push] got Expo push token:', data);
    return data;
  } catch (e) {
    console.warn('[push] getExpoPushTokenAsync failed:', e);
    return null;
  }
}

// Screen a tapped notification should land on, keyed by the same `subject`
// values the server's recordNotification() uses (server/index.cjs).
export function resolveNotificationRoute(
  subject: string | null | undefined,
  data: Record<string, unknown> | undefined
): { name: string; params?: Record<string, unknown> } {
  const s = (subject || '').toLowerCase();
  const inquiryId = data?.inquiry_id;

  if (s.includes('device')) return { name: 'DeviceFollowUp' };
  if (inquiryId && (s.includes('assign') || s.includes('sla') || s.includes('verification') || s.includes('job_completed') || s.includes('pool_job_claimed'))) {
    return { name: 'TaskDetail', params: { ticketId: inquiryId } };
  }
  if (s.includes('pool')) return { name: 'GigPool' };
  if (s.includes('training') || s.includes('tutorial')) return { name: 'TrainingCourses' };
  if (s.includes('leaderboard') || s.includes('rank') || s.includes('award')) return { name: 'Leaderboard' };
  if (s.includes('eod')) return { name: 'EodReport' };
  return { name: 'Notifications' };
}
