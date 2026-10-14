import { api, dataGet } from './client';

// ── Attendance ────────────────────────────────────────────────
export interface AttendanceLog {
  id: string;
  user_id: string;
  date: string | null;
  clock_in: string | null;
  clock_out: string | null;
  location: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  selfie_url?: string | null;
  profiles?: { full_name?: string | null } | null;
}

export function fetchAttendanceLogs(): Promise<AttendanceLog[]> {
  return dataGet<AttendanceLog[]>('attendance', { select: '*,profiles(full_name)', order: 'date:desc', limit: '2000' });
}

export interface EodKey {
  employee_id: string;
  date: string;
}

export function fetchEodKeys(): Promise<EodKey[]> {
  return dataGet<EodKey[]>('eod_reports', { select: 'employee_id,date', limit: '4000' });
}

// ── EOD summaries ─────────────────────────────────────────────
export interface EodReport {
  id: string;
  employee_id: string;
  date: string;
  content: string;
  profiles?: { full_name?: string | null } | null;
}

export function fetchEodReports(): Promise<EodReport[]> {
  return dataGet<EodReport[]>('eod_reports', { select: '*,profiles(full_name)', order: 'date:desc', limit: '1000' });
}

// ── Job cards ─────────────────────────────────────────────────
export interface JobCardRow {
  id: string;
  ticket_no: string | null;
  full_name: string | null;
  phone: string | null;
  service_item: string | null;
  assigned_name: string | null;
  secondary_name: string | null;
  created_at: string;
  verification_call_status?: string | null;
  verification_attempts?: number | null;
  verification_call_note?: string | null;
  verification_due_at?: string | null;
}

export function fetchJobCards(status: 'pending' | 'awaiting-verification'): Promise<JobCardRow[]> {
  return api.get<JobCardRow[]>(`/job-cards?status=${status}`);
}

export interface JobCardInput {
  job_card_type: 'installation' | 'service';
  category: string;
  secondary_employee_id: string | null;
  job_start_time: string | null;
  job_end_time: string | null;
  expected_time_minutes: number | null;
  work_done_note: string;
  rework_required: boolean;
  items: { item_name: string; quantity: string; notes: string }[];
}

export function saveJobCard(inquiryId: string, body: JobCardInput): Promise<unknown> {
  return api.post(`/inquiries/${encodeURIComponent(inquiryId)}/job-card`, body);
}

export type VerificationOutcome = 'confirmed_ok' | 'issue_found' | 'call_later' | 'unreachable';

export function logVerificationCall(
  inquiryId: string,
  body: { status: VerificationOutcome; rating: number | null; note: string; call_again_at?: string },
): Promise<unknown> {
  return api.post(`/inquiries/${encodeURIComponent(inquiryId)}/verification-call`, body);
}

export interface LeaderboardRow {
  employeeId: string;
  name: string;
  avgRating: number | null;
  avgTimeEfficiency: number | null;
  jobsCount: number;
  bonusPoints: number;
  totalScore: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardRow[];
  awarded?: { employee_id: string; amount: number } | null;
}

export function fetchJobCardLeaderboard(month: string): Promise<LeaderboardResponse> {
  return api.get<LeaderboardResponse>(`/admin/leaderboard?month=${month}`);
}

export function awardTechnician(month: string, employeeId: string): Promise<unknown> {
  return api.post(`/admin/leaderboard/${month}/award`, { employee_id: employeeId });
}

// ── Device tracking ───────────────────────────────────────────
export interface DeviceTrackingRow {
  id: string;
  ticket_no: string | null;
  full_name: string | null;
  phone: string | null;
  service_item: string | null;
  status: string | null;
  device_status: string | null;
  follow_up_status: string | null;
  device_taken_logs?: { taken_at: string; profiles?: { full_name?: string | null } | null }[];
  device_return_logs?: unknown[];
}

export async function fetchDeviceTracking(): Promise<DeviceTrackingRow[]> {
  const res = await api.get<DeviceTrackingRow[] | { data: DeviceTrackingRow[] }>('/device-tracking/all');
  return Array.isArray(res) ? res : res.data ?? [];
}

// ── Response times ────────────────────────────────────────────
export interface ResponseMissRow {
  id: string;
  kind: 'assignment' | 'employee';
  ticket_no: string | null;
  full_name: string | null;
  service_item: string | null;
  employee_name: string | null;
  started_at: string;
  due_at: string;
  responded_at: string | null;
  response_minutes: number | null;
}

export function fetchResponseTimes(): Promise<ResponseMissRow[]> {
  return api.get<ResponseMissRow[]>('/response-times');
}

// ── Service log ───────────────────────────────────────────────
export interface ServiceLogRow {
  id: string;
  log_date: string;
  ticket_no: string | null;
  technician_name: string | null;
  customer_name: string;
  customer_phone: string | null;
  service_type: string | null;
  problem: string | null;
  items_used: string | null;
  amount: number | string | null;
  payment_status: 'paid' | 'pending' | 'unpaid' | string;
}

export function fetchServiceLogs(from: string, to: string): Promise<ServiceLogRow[]> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const s = qs.toString();
  return api.get<ServiceLogRow[]>(`/service-logs${s ? `?${s}` : ''}`);
}

// ── Bonus reviews (admin queue) ───────────────────────────────
export interface ReviewSubmission {
  id: string;
  employee_name: string | null;
  ticket_no: string | null;
  customer_name?: string | null;
  claimed_customer_name?: string | null;
  full_name?: string | null;
  review_type: string;
  photo_url: string | null;
  star_rating: number | null;
  status: string;
  points: number | null;
}

export function fetchReviewSubmissions(status: 'pending' | 'approved' | 'rejected'): Promise<ReviewSubmission[]> {
  return api.get<ReviewSubmission[]>(`/review-submissions?status=${status}`);
}

export function verifyReview(
  id: string,
  body: { status: 'approved' | 'rejected'; star_rating?: number | null; admin_note?: string | null },
): Promise<unknown> {
  return api.post(`/review-submissions/${id}/verify`, body);
}

// Requests whose two-working-hour assignment clock has run out with nobody on them.
export interface AssignmentAlert {
  id: string;
  ticket_no: string | null;
  full_name: string | null;
  service_item: string | null;
  created_at: string;
  late_minutes: number;
}

export function fetchAssignmentAlerts(): Promise<AssignmentAlert[]> {
  return api.get<AssignmentAlert[]>('/response-times/alerts').catch(() => [] as AssignmentAlert[]);
}
