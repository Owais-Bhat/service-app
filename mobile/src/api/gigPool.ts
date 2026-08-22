import { api, dataGet } from './client';

export interface PoolJob {
  id: string;
  ticket_no: string;
  full_name: string;
  phone: string;
  location: string;
  service_item: string;
  description: string | null;
  created_at: string;
}

// pool_status: null = not in pool, 'pool' = released & claimable, 'claimed'
// = already taken — so this filter alone identifies claimable jobs, and the
// server's own gig-worker read-scope (assigned_employee_id = me OR
// pool_status = 'pool') ANDs in cleanly with it.
export function fetchPoolJobs(): Promise<PoolJob[]> {
  return dataGet<PoolJob[]>('inquiries', {
    eq: ['pool_status:pool'],
    order: 'created_at:desc',
  });
}

// Atomic on the server — a 409 here means someone else claimed it first, or
// the caller already has an active job (one job at a time for gig workers).
export function claimPoolJob(inquiryId: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/inquiries/${inquiryId}/claim`);
}
