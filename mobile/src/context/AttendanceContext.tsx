import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchTodayAttendance, AttendanceRow } from '../api/attendance';
import { useAuth } from './AuthContext';

interface AttendanceContextValue {
  attendance: AttendanceRow | null;
  refresh: () => Promise<void>;
}

const AttendanceContext = createContext<AttendanceContextValue>({ attendance: null, refresh: async () => {} });

const POLL_MS = 60000;

// Single shared fetch of today's attendance row, used by every employee
// tab's header status strip (date/time/location/clocked-in state) so each
// screen doesn't re-fetch the same thing on its own. Dashboard's clock
// in/out action calls refresh() directly for an immediate update instead
// of waiting for the next poll.
export function AttendanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setAttendance(await fetchTodayAttendance(user.id));
    } catch {
      // Header status is best-effort — keep showing the last known value.
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return <AttendanceContext.Provider value={{ attendance, refresh }}>{children}</AttendanceContext.Provider>;
}

export function useAttendanceStatus(): AttendanceContextValue {
  return useContext(AttendanceContext);
}
