import * as Location from 'expo-location';
import { dataGet, dataPatch, dataPost, postForm } from './client';

export interface AttendanceRow {
  id: string;
  user_id: string;
  clock_in: string | null;
  clock_out: string | null;
  date: string;
  location: string | null;
  status: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
}

const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, matches server/index.cjs

export async function fetchTodayAttendance(userId: string): Promise<AttendanceRow | null> {
  const rows = await dataGet<AttendanceRow[]>('attendance', {
    select: '*',
    eq: [`user_id:${userId}`, `date:${todayStr()}`],
  });
  return rows[0] ?? null;
}

// No `limit` support on the generic data endpoint — fetch everything for
// this user and let callers slice client-side (design spec §2).
export async function fetchAttendanceHistory(userId: string): Promise<AttendanceRow[]> {
  return dataGet<AttendanceRow[]>('attendance', {
    select: '*',
    eq: [`user_id:${userId}`],
    order: 'date:desc',
  });
}

interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
}

async function getCoordsIfAvailable(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0 };
  } catch {
    return null;
  }
}

export async function clockInGig(userId: string): Promise<AttendanceRow> {
  const coords = await getCoordsIfAvailable();
  return dataPost<AttendanceRow>('attendance', {
    user_id: userId,
    date: todayStr(),
    clock_in: new Date().toISOString(),
    status: 'present',
    ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
  });
}

// Fixed employees always go through the photo-capable endpoint even though
// this build never attaches a photo — the server (not this client) knows
// per-employee exemptions and decides whether one was actually required,
// rejecting with a specific error if so. See design spec §2: real
// photo/face-match clock-in isn't built; the honest cases (not required,
// or this employee is exempted) still work for real through this same call.
export async function clockInFixed(): Promise<AttendanceRow> {
  const coords = await getCoordsIfAvailable();
  const form = new FormData();
  if (coords) {
    form.append('lat', String(coords.lat));
    form.append('lng', String(coords.lng));
    form.append('accuracy', String(coords.accuracy));
  }
  return postForm<AttendanceRow>('/attendance/clock-in-photo', form);
}

export async function clockOut(attendanceId: string): Promise<void> {
  await dataPatch('attendance', `id:${attendanceId}`, { clock_out: new Date().toISOString() });
}

export async function fetchLeaveRequests(userId: string): Promise<LeaveRequest[]> {
  return dataGet<LeaveRequest[]>('leave_requests', {
    select: '*',
    eq: [`employee_id:${userId}`],
    order: 'start_date:desc',
  });
}

export async function submitLeaveRequest(
  userId: string,
  startDate: string,
  endDate: string,
  reason: string,
): Promise<LeaveRequest> {
  return dataPost<LeaveRequest>('leave_requests', {
    employee_id: userId,
    start_date: startDate,
    end_date: endDate,
    reason,
    status: 'pending',
  });
}
