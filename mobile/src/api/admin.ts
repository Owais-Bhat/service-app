import { api } from './client';
import { dataGet } from './client';

export interface AdminUserRow {
  id: string;
  role: string;
  full_name: string;
}

export interface InquiryRow {
  id: string;
  status: string;
  assignment_status: string;
}

export function fetchAllUsers() {
  return api.get<AdminUserRow[]>('/admin/users');
}

export function fetchOpenInquiries() {
  return dataGet<InquiryRow[]>('inquiries', { select: 'id,status,assignment_status' });
}

export interface AssignmentQueueRow {
  id: string;
  ticket_no: string;
  full_name: string;
  service_item: string | null;
  assignment_status: string;
  status: string;
  created_at: string;
  employee_name: string | null;
}

export async function fetchAssignmentQueue(): Promise<AssignmentQueueRow[]> {
  const rows = await dataGet<(AssignmentQueueRow & { profiles?: { full_name?: string } })[]>('inquiries', {
    select: 'id,ticket_no,full_name,service_item,assignment_status,status,created_at,profiles(full_name)',
    order: 'created_at:desc',
  });
  return rows.map((r) => ({ ...r, employee_name: r.profiles?.full_name ?? null }));
}
