import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchTodayAttendance, AttendanceRow } from '../api/attendance';
import { startBackgroundLocationTracking } from '../location/backgroundLocationTask';
import { useAuth } from './AuthContext';

interface AttendanceContextValue {
  attendance: AttendanceRow | null;
  loaded: boolean;
  refresh: () => Promise<void>;
}

const AttendanceContext = createContext<AttendanceContextValue>({ attendance: null, loaded: false, refresh: async () => {} });

const POLL_MS = 60000;

// Single shared fetch of today's attendance row, used by every employee
// tab's header status strip (date/time/location/clocked-in state), plus
// ClockInGateModal's "haven't clocked in yet" check, so nothing re-fetches
// the same thing on its own. Dashboard/Attendance's own clock in/out
// actions call refresh() directly for an immediate update instead of
// waiting for the next poll.
//
// `loaded` only flips true on a SUCCESSFUL fetch — on failure it stays
// false and the poll keeps retrying. This matters for the gate: it must
// never block the whole app just because of a transient network error, so
// it only ever gates once we have a confirmed answer from the server.
export function AttendanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const row = await fetchTodayAttendance(user.id);
      setAttendance(row);
      setLoaded(true);
      // Re-arm background tracking if the app relaunched (OS process kill,
      // phone reboot, etc.) while the employee was still clocked in —
      // startBackgroundLocationTracking() is a no-op if already running.
      if (row?.clock_in && !row.clock_out) startBackgroundLocationTracking().catch(() => {});
    } catch {
      // Best-effort — keep showing the last known value, don't flip `loaded`.
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return <AttendanceContext.Provider value={{ attendance, loaded, refresh }}>{children}</AttendanceContext.Provider>;
}

export function useAttendanceStatus(): AttendanceContextValue {
  return useContext(AttendanceContext);
}
