import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// The admin's end-of-day nudge: a local notification that fires every day at a
// fixed time (default 5:30 PM) even when the app is closed. Tapping it opens the
// Daily Report, where the admin sends the text to the WhatsApp group by hand.

const PREFS_KEY = 'daily_report_reminder';
const REMINDER_ID = 'daily-report-reminder';
const CHANNEL_ID = 'daily-report';

export interface ReminderPrefs {
  enabled: boolean;
  hour: number;
  minute: number;
}

export const DEFAULT_PREFS: ReminderPrefs = { enabled: true, hour: 17, minute: 30 };

export function parseTime(text: string): { hour: number; minute: number } | null {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

export const timeText = (p: { hour: number; minute: number }) =>
  `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;

export async function loadReminderPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<ReminderPrefs>;
    return {
      enabled: p.enabled !== false,
      hour: Number.isInteger(p.hour) ? (p.hour as number) : DEFAULT_PREFS.hour,
      minute: Number.isInteger(p.minute) ? (p.minute as number) : DEFAULT_PREFS.minute,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveReminderPrefs(p: ReminderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Not fatal — the reminder still gets scheduled for this session.
  }
}

const SENT_KEY = 'daily_report_sent_date';

// Remembers that the admin passed today's text to WhatsApp, so the dashboard
// card can stop asking.
export async function markReportSent(date: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SENT_KEY, date);
  } catch {
    // Cosmetic only.
  }
}

export async function lastReportSent(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SENT_KEY);
  } catch {
    return null;
  }
}

export async function cancelDailyReportReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    // Nothing scheduled.
  }
}

// Re-schedules from the saved choice. Safe to call on every launch / login —
// the fixed identifier replaces the previous schedule instead of stacking.
// Returns whether a reminder is now set (false when switched off or the phone
// has not allowed notifications).
export async function syncDailyReportReminder(prefs?: ReminderPrefs): Promise<boolean> {
  try {
    const p = prefs ?? (await loadReminderPrefs());
    await cancelDailyReportReminder();
    if (!p.enabled) return false;

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Daily report reminder',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: 'Daily report is ready',
        body: 'The attendance and pending-jobs messages are ready. Review them and send them to the WhatsApp group.',
        data: { subject: 'daily_report' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: p.hour,
        minute: p.minute,
        channelId: CHANNEL_ID,
      },
    });
    return true;
  } catch {
    return false;
  }
}

// True once the reminder time has passed today — the dashboard uses it to
// promote the report card from a shortcut to a call to action.
export function isReportTime(p: { hour: number; minute: number }, now = new Date()): boolean {
  return now.getHours() * 60 + now.getMinutes() >= p.hour * 60 + p.minute;
}
