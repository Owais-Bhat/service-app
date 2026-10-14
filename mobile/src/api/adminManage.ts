import { api, dataDelete, dataGet, dataPatch, dataPost } from './client';
import { todayIso } from '../utils/format';

// ── Request actions the web detail modal offers ───────────────
export function transferInquiry(id: string, employeeId: string, reason: string): Promise<unknown> {
  return api.post(`/admin/inquiries/${encodeURIComponent(id)}/transfer`, { employee_id: employeeId, reason });
}

export function releaseToPool(id: string): Promise<unknown> {
  return api.post(`/inquiries/${encodeURIComponent(id)}/release-to-pool`);
}

// inquiry_services has no cascade FK, so it goes first; the linked ticket and
// its comments go with the request so it also leaves the employee's portal.
export async function deleteInquiry(id: string, ticketId: string | null): Promise<void> {
  await dataDelete('inquiry_services', `inquiry_id:${id}`).catch(() => {});
  if (ticketId) {
    await dataDelete('ticket_comments', `ticket_id:${ticketId}`).catch(() => {});
    await dataDelete('tickets', `id:${ticketId}`).catch(() => {});
  }
  await dataDelete('inquiries', `id:${id}`);
}

// ── Admin "Register request" ──────────────────────────────────
export interface OnlineEmployee {
  id: string;
  full_name: string;
  phone: string | null;
}

// Employees who are clocked in right now — the only ones a new request may be
// handed to (the server re-checks restrictions when it assigns).
export async function fetchOnlineEmployees(): Promise<OnlineEmployee[]> {
  const [att, people] = await Promise.all([
    dataGet<{ user_id: string; clock_in: string | null; clock_out: string | null }[]>('attendance', {
      select: 'user_id,clock_in,clock_out',
      eq: `date:${todayIso()}`,
    }),
    dataGet<(OnlineEmployee & { role: string })[]>('profiles', { select: 'id,full_name,phone,role', order: 'full_name:asc' }),
  ]);
  const online = new Set(att.filter((a) => a.clock_in && !a.clock_out).map((a) => a.user_id));
  return people.filter((p) => (p.role === 'employee' || p.role === 'team_lead') && online.has(p.id));
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface AdminRequestInput {
  name: string;
  phone10: string;
  company: string;
  location: string;
  serviceItem: string;
  description: string;
  billNo: string;
  preferredTime: string;
  lat: number | null;
  lng: number | null;
  employeeId: string;
}

export async function createAdminRequest(input: AdminRequestInput): Promise<string> {
  const id = uuid();
  const d = new Date();
  const ticket = `NE-${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(
    1000 + Math.random() * 9000,
  )}`;
  await dataPost('inquiries', {
    id,
    full_name: input.name,
    phone: `+91${input.phone10}`,
    company_name: input.company || null,
    location: input.location,
    customer_lat: input.lat,
    customer_lng: input.lng,
    bill_no: input.billNo || null,
    service_item: input.serviceItem,
    description: input.description || null,
    ticket_no: ticket,
    preferred_time: input.preferredTime,
    status: 'open',
    assignment_status: 'none',
  });
  if (input.employeeId) {
    await dataPatch('inquiries', `id:${id}`, { assigned_employee_id: input.employeeId, assignment_status: 'pending', decline_reason: null });
  }
  return ticket;
}

// ── Auto assignment ───────────────────────────────────────────
export interface QueueEntry {
  id: string;
  full_name: string | null;
  clock_in: string | null;
  queue_position: number;
  assignments_today: number;
  always_assign: number | boolean;
  is_next: boolean;
}

export interface AutoAssignStatus {
  auto_assignment_enabled: boolean;
  total_today: number;
  queue: QueueEntry[];
}

export interface AutoAssignLog {
  inquiry_id: string;
  ticket_no: string | null;
  customer_name: string | null;
  service_item: string | null;
  employee_name: string | null;
  queue_position: number;
  inquiry_status: string | null;
  assigned_at: string;
}

export function fetchAutoAssignStatus(): Promise<AutoAssignStatus> {
  return api.get<AutoAssignStatus>('/auto-assignment/status');
}

export async function fetchAutoAssignLogs(): Promise<AutoAssignLog[]> {
  const res = await api.get<{ logs?: AutoAssignLog[] }>('/auto-assignment/logs?limit=50');
  return res.logs ?? [];
}

export function setAutoAssign(enabled: boolean): Promise<unknown> {
  return api.put('/auto-assignment/status', { enabled });
}

// ── Assignment tracker ────────────────────────────────────────
export interface TrackerRow {
  id: string;
  kind: 'inquiry' | 'installation' | string;
  ticket_no: string | null;
  customer_name: string;
  service: string | null;
  place: string | null;
  employee_name: string | null;
  employee_phone: string | null;
  minutes_waiting: number | null;
  seen: boolean;
  accepted: boolean;
  app_opened_at: string | null;
  whatsapp: { state: string; at: string | null; error: string | null };
  group_text: string;
}

export interface TrackerResponse {
  rows: TrackerRow[];
  counts: { all: number; not_seen: number; not_accepted: number };
}

export function fetchTracker(filter: string): Promise<TrackerResponse> {
  return api.get<TrackerResponse>(`/assignments/tracker?filter=${filter}`);
}

export function resendAssignment(kind: string, id: string): Promise<unknown> {
  return api.post(`/assignments/${kind}/${id}/resend`);
}

// ── Device types & companies ──────────────────────────────────
export interface NamedRow {
  id: string;
  name: string;
  description?: string | null;
}

export const fetchDeviceTypes = () => dataGet<NamedRow[]>('device_types', { select: '*', order: 'name:asc' });
export const fetchCompanyList = () => dataGet<NamedRow[]>('companies', { select: '*', order: 'name:asc' });

export const saveDeviceType = (row: { id?: string; name: string; description: string | null }) =>
  row.id ? dataPatch('device_types', `id:${row.id}`, { name: row.name, description: row.description }) : dataPost('device_types', { id: uuid(), ...row });
export const removeDeviceType = (id: string) => dataDelete('device_types', `id:${id}`);

export const saveCompany = (row: { id?: string; name: string }) =>
  row.id ? dataPatch('companies', `id:${row.id}`, { name: row.name }) : dataPost('companies', { id: uuid(), name: row.name });
export const removeCompany = (id: string) => dataDelete('companies', `id:${id}`);

// ── Settings: keys, geofence ──────────────────────────────────
export interface RegistrationKeys {
  admin: string;
  employee: string;
}

export const fetchRegistrationKeys = () => api.get<RegistrationKeys>('/settings/registration-keys');
export const regenerateRegistrationKey = (role: 'admin' | 'employee') => api.post<{ role: string; key: string }>('/settings/registration-keys/regenerate', { role });

export interface Geofence {
  lat: number | null;
  lng: number | null;
  radiusM: number;
}

export const fetchGeofence = () => api.get<Geofence>('/settings/attendance-geofence');
export const saveGeofence = (g: { lat: number; lng: number; radiusM: number }) => api.put('/settings/attendance-geofence', g);

// ── Attendance restrictions ───────────────────────────────────
// An employee who forgot EOD is blocked from clocking in; clearing it files a
// stand-in EOD report for each missed day, exactly as the web button does.
export async function resolveRestriction(userId: string, dates: string[]): Promise<void> {
  for (const date of dates) {
    await dataPost('eod_reports', { employee_id: userId, content: 'Admin cleared missed EOD warning', date });
  }
}

export function resetFaceId(userId: string): Promise<unknown> {
  return api.post('/attendance/face-reset', { userId });
}
