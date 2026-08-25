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

export interface PushRegistrationResult {
  token: string | null;
  reason: string | null; // set whenever token is null, explains why
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return { token: null, reason: 'Not a physical device (simulator/emulator)' };
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
    return { token: null, reason: `Permission not granted (status: ${status})` };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return { token: null, reason: 'No EAS projectId in Constants.expoConfig.extra.eas' };
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: data, reason: null };
  } catch (e) {
    return { token: null, reason: `getExpoPushTokenAsync failed: ${e instanceof Error ? e.message : String(e)}` };
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
