import { api } from './client';
import { todayIso } from '../utils/format';

export interface DashInquiry {
  id: string;
  ticket_no: string | null;
  full_name: string | null;
  phone: string | null;
  service_item: string | null;
  status: string | null;
  assignment_status: string | null;
  assigned_employee_id: string | null;
  decline_reason: string | null;
  payment_status: string | null;
  bill_total: number | string | null;
  created_at: string;
}

export interface DashAttendance {
  id: string;
  user_id: string;
  clock_in: string | null;
  clock_out: string | null;
  location: string | null;
  profiles?: { full_name?: string | null } | null;
}

export interface DashInstallation {
  id: string;
  status: string | null;
  preferred_date: string | null;
}

export interface DashComplaint {
  id: string;
  ticket_no?: string | null;
  complaint?: string | null;
  status: string | null;
  created_at: string;
}

export interface DashProfile {
  id: string;
  full_name: string | null;
  role: string | null;
  phone: string | null;
}

export interface AdminDashboardData {
  inquiries: DashInquiry[];
  installations: DashInstallation[];
  complaints: DashComplaint[];
  attendance: DashAttendance[];
  profiles: DashProfile[];
  completed_total: number;
}

// Same endpoint the web dashboard reads: open jobs + the latest finished ones,
// today's attendance, open complaints — one round trip instead of five.
export function fetchAdminDashboard(): Promise<AdminDashboardData> {
  return api.get<AdminDashboardData>(`/dashboard/admin-data?today=${todayIso()}`);
}

export async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await api.get<{ unread?: number; count?: number }>('/notifications/unread-count');
    return Number(res.unread ?? res.count ?? 0);
  } catch {
    return 0;
  }
}
