import { api, dataDelete, dataGet, dataPatch, dataPost } from './client';

// ── Users ─────────────────────────────────────────────────────
export interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company?: string | null;
  address?: string | null;
  allowed_tabs?: string | string[] | null;
  role: string;
  salary: number | string | null;
  worker_type: string | null;
  can_add_service: number | null;
  can_assign_tickets: number | null;
  can_update_profile: number | null;
  always_assign: number | null;
  eod_exempt: number | null;
  photo_clockin_exempt: number | null;
  geofence_clockin_exempt: number | null;
  installations_enabled: number | null;
  allow_foc: number | null;
}

export function fetchUsers(): Promise<UserRow[]> {
  return api.get<UserRow[]>('/admin/users');
}

// The server takes camelCase for these switches (PATCH /admin/users/:id).
export type UserPatch = Partial<{
  fullName: string;
  phone: string;
  salary: number;
  role: 'admin' | 'employee' | 'team_lead' | 'client';
  workerType: 'fixed' | 'gig';
  can_add_service: boolean;
  can_assign_tickets: boolean;
  can_update_profile: boolean;
  alwaysAssign: boolean;
  eodExempt: boolean;
  photoClockinExempt: boolean;
  geofenceClockinExempt: boolean;
  installationsEnabled: boolean;
  allowFoc: boolean;
}>;

export function patchUserAccess(id: string, body: UserPatch): Promise<unknown> {
  return api.patch(`/admin/users/${id}`, body);
}

// Employee tabs an admin can switch off per person. Ids must match the web
// getNavItems('employee'); dashboard, notifications and profile are always on.
export const EMPLOYEE_TABS: { id: string; label: string }[] = [
  { id: 'all-tickets', label: 'My Tasks' },
  { id: 'my-installations', label: 'Installations' },
  { id: 'my-attendance', label: 'Attendance Records' },
  { id: 'my-leaves', label: 'Leave Requests' },
  { id: 'my-eod', label: 'EOD Reports' },
  { id: 'my-cash', label: 'My Cash' },
  { id: 'my-collections', label: 'Collections' },
  { id: 'my-salary', label: 'Salary' },
  { id: 'my-stats', label: 'Stats' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'my-reviews', label: 'Bonus Reviews' },
  { id: 'employee-training', label: 'Tutorials' },
  { id: 'my-training-courses', label: 'Training' },
  { id: 'device-followup', label: 'Device Follow-up' },
  { id: 'estimator', label: 'Estimator' },
  { id: 'service-pricing', label: 'Service Pricing' },
];

export interface UserSave {
  fullName: string;
  email: string;
  password?: string;
  role: string;
  phone: string | null;
  salary: number;
  company: string | null;
  address: string | null;
  can_add_service: number;
  can_assign_tickets: number;
  can_update_profile: number;
  alwaysAssign: number;
  eodExempt: number;
  photoClockinExempt: number;
  geofenceClockinExempt: number;
  workerType: string;
  installationsEnabled: boolean;
  allowFoc: boolean;
  allowed_tabs: string[] | null;
}

export function createUser(body: UserSave): Promise<unknown> {
  return api.post('/admin/users', body);
}

export function updateUser(id: string, body: UserSave): Promise<unknown> {
  return api.patch(`/admin/users/${id}`, body);
}

export function deleteUser(id: string): Promise<unknown> {
  return api.del(`/admin/users/${id}`);
}

// ── Complaints ────────────────────────────────────────────────
export interface ComplaintRow {
  id: string;
  ticket_no: string;
  inquiry_id: string | null;
  phone: string;
  complaint_text: string;
  status: string;
  admin_response: string | null;
  resolved_at: string | null;
  created_at: string;
}

export function fetchComplaints(): Promise<ComplaintRow[]> {
  return dataGet<ComplaintRow[]>('complaints', { select: '*', order: 'created_at:desc', limit: '500' });
}

export function respondToComplaint(
  row: ComplaintRow,
  input: { status: string; response: string },
): Promise<unknown> {
  const updates: Record<string, unknown> = { status: input.status };
  const prev = (row.admin_response || '').trim();
  if (input.response.trim() !== prev) updates.admin_response = input.response.trim() || null;
  if (input.status === 'resolved' && !row.resolved_at) {
    updates.resolved_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  return dataPatch('complaints', `id:${row.id}`, updates);
}

// ── Queries & follow-ups ──────────────────────────────────────
export interface QueryRow {
  id: string;
  full_name: string;
  phone: string;
  address: string | null;
  query_details: string;
  estimate_sent: number | boolean;
  created_at: string;
}

export function fetchQueries(): Promise<QueryRow[]> {
  return dataGet<QueryRow[]>('queries', { select: '*', order: 'created_at:desc', limit: '500' });
}

export function createQuery(body: { full_name: string; phone: string; address: string | null; query_details: string }): Promise<unknown> {
  return dataPost('queries', body);
}

export function setEstimateSent(id: string, sent: boolean): Promise<unknown> {
  return dataPatch('queries', `id:${id}`, { estimate_sent: sent ? 1 : 0 });
}

export function deleteQuery(id: string): Promise<unknown> {
  return dataDelete('queries', `id:${id}`);
}

// ── Notices ───────────────────────────────────────────────────
export interface NoticeRow {
  id: string;
  title: string;
  body: string;
  priority: 'normal' | 'high' | 'urgent' | string;
  active: number;
  expires_at: string | null;
  created_at: string;
}

export function fetchAllNotices(): Promise<NoticeRow[]> {
  return dataGet<NoticeRow[]>('notices', { select: '*', order: 'created_at:desc', limit: '300' });
}

export type NoticeInput = Pick<NoticeRow, 'title' | 'body' | 'priority' | 'active' | 'expires_at'>;

export function createNotice(body: NoticeInput, authorId: string | null): Promise<unknown> {
  return dataPost('notices', { ...body, created_by: authorId });
}

export function updateNotice(id: string, body: Partial<NoticeInput>): Promise<unknown> {
  return dataPatch('notices', `id:${id}`, body);
}

export function deleteNotice(id: string): Promise<unknown> {
  return dataDelete('notices', `id:${id}`);
}

// ── Landing / popup ads ───────────────────────────────────────
export interface AdRow {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  duration_ms: number | null;
  active: number;
  placement: string | null;
  device_target: string | null;
  position: number | null;
  starts_at: string | null;
  expires_at: string | null;
  audio_enabled?: number | null;
}

export function fetchAds(): Promise<AdRow[]> {
  return dataGet<AdRow[]>('ads', { select: '*', order: 'position:asc', limit: '300' });
}

export function updateAd(id: string, body: Partial<Pick<AdRow, 'active' | 'caption' | 'duration_ms' | 'device_target' | 'position'>>): Promise<unknown> {
  return dataPatch('ads', `id:${id}`, body);
}

export function deleteAd(id: string): Promise<unknown> {
  return dataDelete('ads', `id:${id}`);
}

export interface AdInput {
  kind: string;
  url: string;
  caption: string | null;
  placement: string;
  device_target: string;
  duration_ms: number;
  position: number;
  active: number;
  audio_enabled?: number;
  starts_at?: string | null;
  expires_at?: string | null;
}

export function createAd(body: AdInput): Promise<unknown> {
  return dataPost('ads', body);
}

export function saveAd(id: string, body: AdInput): Promise<unknown> {
  return dataPatch('ads', `id:${id}`, body);
}
