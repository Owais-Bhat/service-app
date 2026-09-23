import { api, dataGet, dataPatch } from './client';

export interface AdminInquiryRow {
  id: string;
  ticket_no: string | null;
  full_name: string;
  phone: string | null;
  service_item: string | null;
  status: string;
  payment_status: string | null;
  bill_amount: number | string | null;
  bill_total: number | string | null;
  assigned_employee_id: string | null;
  assignment_status: string | null;
  company_name: string | null;
  reopened: number | null;
  created_at: string;
}

export async function fetchInquiries(): Promise<AdminInquiryRow[]> {
  return dataGet<AdminInquiryRow[]>('inquiries', {
    select: '*',
    order: 'created_at:desc',
  });
}

export interface ManageContextEmployee {
  id: string;
  full_name: string;
  clockedIn: boolean;
  restricted: boolean;
  always_assign: boolean;
}

export interface ManageContextInquiry {
  id: string;
  ticket_no: string | null;
  full_name: string;
  phone: string | null;
  service_item: string | null;
  description: string | null;
  location: string | null;
  preferred_time: string | null;
  status: string;
  assignment_status: string | null;
  decline_reason: string | null;
  assigned_employee_id: string | null;
  assigned_at: string | null;
  company_name: string | null;
  customer_lat: number | string | null;
  customer_lng: number | string | null;
  device_type: string | null;
  device_serial_no: string | null;
  extra_cost: number | string | null;
  extra_cost_reason: string | null;
  bill_total: number | string | null;
  bill_amount: number | string | null;
  payment_status: string | null;
  feedback_rating: number | null;
  feedback_comment: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ManageContext {
  inquiry: ManageContextInquiry;
  employees: ManageContextEmployee[];
}

export async function fetchInquiryManageContext(id: string): Promise<ManageContext> {
  return api.get<ManageContext>(`/admin/inquiries/${encodeURIComponent(id)}/manage-context`);
}

// Mirrors web's save-assignment payload (src/pages/admin.js's openInquiryDetail)
// minus the legacy `tickets` table insert — see design spec §2 for why that's
// safe to skip. The server's generic PATCH handler stamps `assigned_at`
// itself the moment assigned_employee_id changes (server/index.cjs).
export async function assignInquiryEmployee(inquiryId: string, employeeId: string | null): Promise<void> {
  await dataPatch('inquiries', `id:${inquiryId}`, {
    assigned_employee_id: employeeId,
    assignment_status: employeeId ? 'pending' : null,
    decline_reason: null,
  });
}

// --- SLA (ported from src/utils.js's calculateSLA/formatSLADeadline/formatTimeRemaining) ---
// Jammu & Kashmir working hours: 10:00-18:00, Sunday excluded. Same 12-hour
// default budget as web's admin detail modal.
export function calculateSlaDeadline(assignedAt: string, slaHours = 12): Date {
  const date = new Date(assignedAt);
  let hoursRemaining = slaHours;
  const startHour = 10;
  const endHour = 18;

  while (hoursRemaining > 0) {
    const curHour = date.getHours();
    const day = date.getDay();

    if (day === 0) {
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
      continue;
    }
    if (curHour < startHour) {
      date.setHours(startHour, 0, 0, 0);
      continue;
    }
    if (curHour >= endHour) {
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
      continue;
    }

    const endOfDay = new Date(date);
    endOfDay.setHours(endHour, 0, 0, 0);
    const workdayRemainingMs = endOfDay.getTime() - date.getTime();
    const workdayRemainingHours = workdayRemainingMs / (1000 * 60 * 60);

    if (hoursRemaining <= workdayRemainingHours) {
      date.setMilliseconds(date.getMilliseconds() + hoursRemaining * 60 * 60 * 1000);
      hoursRemaining = 0;
    } else {
      hoursRemaining -= workdayRemainingHours;
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
    }
  }
  return date;
}

export function formatSlaDeadlineLabel(deadline: Date): { label: string; isOverdue: boolean } {
  const isOverdue = deadline.getTime() < Date.now();
  const day = deadline.getDate();
  const dayName = deadline.toLocaleDateString('en-US', { weekday: 'long' });
  const time = deadline.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return { label: `${day} ${dayName} ${time}`, isOverdue };
}

export function formatTimeRemainingLabel(deadline: Date): { label: string; isOverdue: boolean } {
  const diff = deadline.getTime() - Date.now();
  if (diff <= 0) return { label: 'OVERDUE', isOverdue: true };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { label: `${hours}h ${mins}m left`, isOverdue: false };
}
