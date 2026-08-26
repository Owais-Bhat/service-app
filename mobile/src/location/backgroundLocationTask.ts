import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { pingLocation } from '../api/liveLocation';

// Replaces the old foreground-only setInterval ping (useLiveLocationPing) —
// this single continuous OS-level location subscription keeps firing while
// the app is backgrounded or fully swiped away, as long as the employee is
// clocked in, matching the "always tracking like Uber" requirement. Android
// requires this to run as a foreground service with a persistent
// notification the whole time it's active — that's an OS anti-abuse rule,
// not something this code can suppress.
export const LOCATION_TASK_NAME = 'nest-background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.log('[bg-location] task error:', error.message);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const loc = locations?.[locations.length - 1];
  if (!loc) return;
  try {
    await pingLocation(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy ?? undefined);
    console.log('[bg-location] ping sent:', loc.coords.latitude, loc.coords.longitude);
  } catch (e) {
    console.log('[bg-location] ping failed:', e instanceof Error ? e.message : String(e));
  }
});

export interface StartResult {
  ok: boolean;
  reason?: string;
}

// Called right after a successful clock-in. Requests foreground permission
// first (required before Android will even show the background prompt),
// then background permission (the second "Allow all the time" dialog).
export async function startBackgroundLocationTracking(): Promise<StartResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { ok: false, reason: `Foreground location permission not granted (${fg.status})` };
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    return { ok: false, reason: `Background location permission not granted (${bg.status})` };
  }

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (alreadyStarted) return { ok: true };

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10000,
    distanceInterval: 0,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'NEST — location sharing active',
      notificationBody: "Your location is shared with dispatch while you're clocked in.",
      notificationColor: '#15a05a',
    },
  });
  console.log('[bg-location] tracking started');
  return { ok: true };
}

// Called right after a successful clock-out — stops the foreground service
// and its notification immediately rather than waiting for the OS to kill it.
export async function stopBackgroundLocationTracking(): Promise<void> {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (!alreadyStarted) return;
  await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  console.log('[bg-location] tracking stopped');
}
