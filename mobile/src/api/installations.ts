import { api, dataGet } from './client';

// An installation carries the same life as a service request: it is assigned,
// accepted, started, finished, billed on site, and paid whenever the money
// actually arrives. Payment is deliberately not part of finishing the job.
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

  assigned_employee_id?: string | null;
  employee_name?: string | null;
  assignment_status?: string | null;
  decline_reason?: string | null;
  assigned_at?: string | null;
  accepted_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  employee_update_detail?: string | null;
  employee_update_at?: string | null;

  items_total?: number | string | null;
  labour_charge?: number | string | null;
  gst_applied?: number | boolean | null;
  gst_amount?: number | string | null;
  bill_total?: number | string | null;
  bill_no?: string | null;
  bill_generated_at?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_received_at?: string | null;
  payment_note?: string | null;
}

export interface InstallationBillItem {
  id: string;
  item_id: string | null;
  name: string;
  kind: string;
  quantity: number | string;
  rate: number | string;
  amount: number | string;
}

export type InstallationAction = 'accept' | 'decline' | 'start' | 'update' | 'complete';

// Server auto-scopes GET /data/installations to assigned_employee_id = caller
// (server/index.cjs appendRoleScope) — the explicit eq here mirrors
// fetchMyTickets's existing convention rather than relying on that alone.
export function fetchMyInstallations(employeeId: string): Promise<InstallationJob[]> {
  return dataGet<InstallationJob[]>('installations', {
    eq: [`assigned_employee_id:${employeeId}`],
    order: 'created_at:desc',
  });
}

// Admin sees every booking, assigned or not.
export function fetchAllInstallations(): Promise<InstallationJob[]> {
  return dataGet<InstallationJob[]>('installations', { order: 'preferred_date:desc' });
}

export function fetchInstallation(id: string): Promise<{ installation: InstallationJob; items: InstallationBillItem[] }> {
  return api.get(`/installations/${encodeURIComponent(id)}`);
}

// accept / decline / start / update / complete — `detail` is the technician's
// own note, or the reason when declining.
export function installationAction(id: string, action: InstallationAction, detail?: string): Promise<InstallationJob> {
  return api.post(`/installations/${encodeURIComponent(id)}/status`, { action, detail });
}

export function assignInstallation(id: string, employeeId: string | null): Promise<InstallationJob> {
  return api.post(`/installations/${encodeURIComponent(id)}/assign`, { employee_id: employeeId });
}

// Parts go in through /bill-items first; this totals them with the labour
// charge and adds GST only when this particular bill is meant to carry it.
export function saveInstallationBill(id: string, body: { labour_charge: number; gst_applied: boolean }): Promise<InstallationJob> {
  return api.post(`/installations/${encodeURIComponent(id)}/bill`, body);
}

// Cash taken on site, or admin settling the bill later. Marking a bill back to
// unpaid is admin-only on the server.
export function setInstallationPayment(
  id: string,
  body: { paid: boolean; method?: string; note?: string },
): Promise<InstallationJob> {
  return api.post(`/installations/${encodeURIComponent(id)}/payment`, body);
}
