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
