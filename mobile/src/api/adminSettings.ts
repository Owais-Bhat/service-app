import { api } from './client';

export interface AppSettings {
  photoRequired: boolean;
  geofenceRequired: boolean;
  popupEnabled: boolean;
  deviceTrackingEnabled: boolean;
  reopenLimit: number;
  reopenButtonEnabled: boolean;
  poolMinutes: number;
  autoClockOut: string;
}

// The same GET endpoints the web Settings page reads, gathered into one object.
// A single failing read falls back to a default instead of blanking the page.
export async function fetchSettings(): Promise<AppSettings> {
  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };
  const [clockin, popup, device, reopen, pool, attendance] = await Promise.all([
    safe(api.get<{ photoRequired: boolean; geofenceRequired: boolean }>('/settings/clockin-requirements'), { photoRequired: false, geofenceRequired: false }),
    safe(api.get<{ enabled: boolean }>('/settings/popup'), { enabled: true }),
    safe(api.get<{ enabled: boolean }>('/settings/device-tracking'), { enabled: true }),
    safe(api.get<{ limit: number; button_enabled: boolean }>('/settings/reopen'), { limit: 1, button_enabled: true }),
    safe(api.get<{ minutes: number }>('/settings/pool-timeout'), { minutes: 15 }),
    safe(api.get<{ autoClockOutTime: string }>('/settings/attendance'), { autoClockOutTime: '' }),
  ]);
  return {
    photoRequired: !!clockin.photoRequired,
    geofenceRequired: !!clockin.geofenceRequired,
    popupEnabled: popup.enabled !== false,
    deviceTrackingEnabled: device.enabled !== false,
    reopenLimit: Number(reopen.limit) || 0,
    reopenButtonEnabled: reopen.button_enabled !== false,
    poolMinutes: Number(pool.minutes) || 15,
    autoClockOut: attendance.autoClockOutTime || '',
  };
}

export function saveClockinRequirements(photoRequired: boolean, geofenceRequired: boolean): Promise<unknown> {
  return api.put('/settings/clockin-requirements', { photoRequired, geofenceRequired });
}

export function savePopupEnabled(enabled: boolean): Promise<unknown> {
  return api.put('/settings/popup', { enabled });
}

export function saveDeviceTracking(enabled: boolean): Promise<unknown> {
  return api.put('/settings/device-tracking', { enabled });
}

export function saveReopen(body: { limit?: number; button_enabled?: boolean }): Promise<unknown> {
  return api.put('/settings/reopen', body);
}

export function savePoolMinutes(minutes: number): Promise<unknown> {
  return api.put('/settings/pool-timeout', { minutes });
}

export function saveAutoClockOut(autoClockOutTime: string): Promise<unknown> {
  return api.put('/settings/attendance', { autoClockOutTime });
}

// ── Training (admin) ──────────────────────────────────────────
export interface TrainingCourseRow {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  active: number;
  lesson_count: number;
  quiz_count: number;
  assign_count: number;
}

export interface ComplianceRow {
  course_id: string;
  completed: number;
  assigned: number;
}

export interface CourseProgress {
  course: { id: string; title: string };
  lessons: { id: string; title: string }[];
  quizCount: number;
  employees: {
    employee_id: string;
    name: string;
    due_date: string | null;
    done_count: number;
    completion: { passed: number | boolean; quiz_score: number | null; completed_at: string | null } | null;
    last_activity: string | null;
  }[];
}

export function fetchTrainingCourses(): Promise<TrainingCourseRow[]> {
  return api.get<TrainingCourseRow[]>('/training/courses');
}

export function fetchTrainingCompliance(): Promise<ComplianceRow[]> {
  return api.get<ComplianceRow[]>('/training/compliance');
}

export function fetchCourseProgress(id: string): Promise<CourseProgress> {
  return api.get<CourseProgress>(`/training/courses/${id}/progress`);
}

export function setCourseActive(id: string, active: boolean): Promise<unknown> {
  return api.patch(`/training/courses/${id}`, { active });
}

// ── Who can book a service ─────────────────────────────────────
export interface BookingRules {
  blockOnDues: boolean;
  minDuesRupees: number;
  radiusKm: number;
  centre: { lat: number; lng: number };
  centreIsDefault: boolean;
}

export function fetchBookingRules(): Promise<BookingRules> {
  return api.get<BookingRules>('/settings/booking-rules');
}

export function saveBookingRules(b: {
  blockOnDues: boolean;
  minDuesRupees: number;
  radiusKm: number;
  centre?: { lat: number; lng: number } | null;
}): Promise<BookingRules> {
  return api.put<BookingRules>('/settings/booking-rules', b);
}
