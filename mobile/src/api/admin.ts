import { api, dataGet } from './client';

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

export function patchUser(userId: string, body: { role?: string }): Promise<void> {
  return api.patch<void>(`/admin/users/${userId}`, body);
}

export interface EmployeePickRow {
  id: string;
  full_name: string;
}

export function fetchEmployees(): Promise<EmployeePickRow[]> {
  return api.get<EmployeePickRow[]>('/admin/users').then((rows: any[]) =>
    rows.filter((r) => r.role === 'employee' || r.role === 'team_lead').map((r) => ({ id: r.id, full_name: r.full_name }))
  );
}

export function assignTicket(inquiryId: string, employeeId: string): Promise<void> {
  return api.patch<void>(`/admin/assign/${inquiryId}`, { employeeId });
}

export async function fetchAssignmentQueue(): Promise<AssignmentQueueRow[]> {
  const rows = await dataGet<(AssignmentQueueRow & { profiles?: { full_name?: string } })[]>('inquiries', {
    select: 'id,ticket_no,full_name,service_item,assignment_status,status,created_at,profiles(full_name)',
    order: 'created_at:desc',
  });
  return rows.map((r) => ({ ...r, employee_name: r.profiles?.full_name ?? null }));
}
