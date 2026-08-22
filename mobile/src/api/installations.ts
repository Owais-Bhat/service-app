import { dataGet, dataPatch } from './client';

export interface InstallationJob {
  id: string;
  ticket_no: string;
  full_name: string;
  phone: string;
  company_name: string | null;
  location: string;
  installation_type: string;
  preferred_date: string;
  preferred_time: string;
  address: string;
  description: string | null;
  status: string;
  created_at: string;
}

// Server auto-scopes GET /data/installations to assigned_employee_id = caller
// (server/index.cjs appendRoleScope) — the explicit eq here mirrors
// fetchMyTickets's existing convention rather than relying on that alone.
export function fetchMyInstallations(employeeId: string): Promise<InstallationJob[]> {
  return dataGet<InstallationJob[]>('installations', {
    eq: [`assigned_employee_id:${employeeId}`],
    order: 'created_at:desc',
  });
}

export function advanceInstallationStatus(id: string, status: 'in_progress' | 'completed'): Promise<InstallationJob> {
  return dataPatch<InstallationJob>('installations', `id:${id}`, { status });
}
