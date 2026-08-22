import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { fetchTodayAttendance } from '../api/attendance';
import { pingLocation } from '../api/liveLocation';

const PING_INTERVAL_MS = 45000;

// Foreground-only "where is this employee right now" reporting — while
// clocked in, pings the server every ~45s so admin's Live Locations view
// (mobile + web) has something current to show. Deliberately does NOT use
// background location: true always-on tracking needs expo-task-manager +
// native background-mode config (a custom dev build, not plain Expo Go —
// see AGENTS.md's SDK-compatibility lesson), plus that's a bigger product
// decision than this ping loop. This pauses the moment the app is
// backgrounded and resumes when it's foregrounded again.
export function useLiveLocationPing(userId: string | undefined) {
  const permissionDeniedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || permissionDeniedRef.current) return;
      if (AppState.currentState !== 'active') return;
      try {
        const attendance = await fetchTodayAttendance(userId);
        if (!attendance?.clock_in || attendance.clock_out) return;

        const perm = await Location.getForegroundPermissionsAsync();
        let granted = perm.granted;
        if (!granted) {
          const req = await Location.requestForegroundPermissionsAsync();
          granted = req.granted;
        }
        if (!granted) {
          permissionDeniedRef.current = true;
          return;
        }

        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await pingLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? undefined);
      } catch {
        // Best-effort — a missed ping just leaves a slightly stale dot for one interval.
      }
    };

    tick();
    const interval = setInterval(tick, PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);
}
