import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { api, ApiError, dataGet, dataPatch, dataPost, postForm } from './client';
import { startBackgroundLocationTracking, stopBackgroundLocationTracking } from '../location/backgroundLocationTask';

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

interface ClockInRequirements {
  photoRequired: boolean;
  geofenceRequired: boolean;
}

// Public, no-auth setting (mirrors src/pages/employee.js's loadClockInRequirements)
// so the app can decide whether to open the camera before submitting.
async function loadClockInRequirements(): Promise<ClockInRequirements> {
  try {
    return await api.get<ClockInRequirements>('/settings/clockin-requirements');
  } catch {
    return { photoRequired: false, geofenceRequired: false };
  }
}

interface ExemptionRow {
  photo_clockin_exempt?: boolean | number;
  geofence_clockin_exempt?: boolean | number;
}

async function loadExemptions(userId: string): Promise<ExemptionRow> {
  try {
    const rows = await dataGet<ExemptionRow[]>('profiles', {
      select: 'photo_clockin_exempt,geofence_clockin_exempt',
      eq: [`id:${userId}`],
    });
    return rows[0] ?? {};
  } catch {
    return {};
  }
}

// No on-device face-recognition model on mobile (unlike web's face-api.js
// descriptor extraction) — the selfie is captured and uploaded for admin
// visual review only. Omitting the `faceDescriptor` field entirely tells the
// server to skip automatic face-matching for this submission (see
// server/index.cjs's clock-in-photo handler).
async function captureSelfie(): Promise<{ uri: string; name: string; type: string } | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.6,
    allowsEditing: false,
    cameraType: ImagePicker.CameraType.front,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
  return { uri: asset.uri, name: `selfie.${ext}`, type: asset.mimeType || `image/${ext}` };
}

// Shared by both fixed and gig employees — the server applies the same
// global photo/geofence settings and per-employee exemptions to everyone
// (see server/index.cjs's clock-in-photo handler), so there's no longer a
// worker-type-specific clock-in path.
export async function clockIn(userId: string): Promise<AttendanceRow> {
  const [requirements, exemptions, coords] = await Promise.all([
    loadClockInRequirements(),
    loadExemptions(userId),
    getCoordsIfAvailable(),
  ]);
  const photoRequired = requirements.photoRequired && !exemptions.photo_clockin_exempt;
  const geofenceRequired = requirements.geofenceRequired && !exemptions.geofence_clockin_exempt;

  if (geofenceRequired && !coords) {
    throw new ApiError('Could not get your location. Enable location access and try again.', 400);
  }

  let selfie: { uri: string; name: string; type: string } | null = null;
  if (photoRequired) {
    selfie = await captureSelfie();
    if (!selfie) {
      throw new ApiError('A clock-in photo is required — grant camera permission and try again.', 400);
    }
  }

  const form = new FormData();
  if (selfie) {
    // React Native's FormData accepts { uri, name, type } file parts —
    // not the DOM File/Blob shape TypeScript's lib.dom.d.ts expects here.
    form.append('photo', selfie as unknown as Blob);
  }
  if (coords) {
    form.append('lat', String(coords.lat));
    form.append('lng', String(coords.lng));
    form.append('accuracy', String(coords.accuracy));
  }

  const row = await postForm<AttendanceRow>('/attendance/clock-in-photo', form);
  startBackgroundLocationTracking().catch(() => {});
  return row;
}

export async function clockOut(attendanceId: string): Promise<void> {
  await dataPatch('attendance', `id:${attendanceId}`, { clock_out: new Date().toISOString() });
  stopBackgroundLocationTracking().catch(() => {});
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
