import { api } from './client';

// ── Job costing ───────────────────────────────────────────────
export interface JobProfit {
  job_type: string;
  job_id: string;
  ticket_no: string | null;
  customer: string | null;
  job_status: string | null;
  job_date: string | null;
  invoice_no: string | null;
  material_cost_paise: number;
  other_cost_paise: number;
  total_cost_paise: number;
  revenue_paise: number;
  margin_paise: number;
  margin_pct: number | null;
  unbilled: boolean;
}

export interface Profitability {
  scope: { from: string; to: string; basis: string };
  jobs: JobProfit[];
  totals: { revenue_paise: number; cost_paise: number; margin_paise: number; unbilled_jobs: number; unbilled_cost_paise: number };
}

export function fetchProfitability(): Promise<Profitability> {
  return api.get<Profitability>('/jobs/profitability');
}

export interface PendingMaterials {
  id: string;
  job_type: string;
  employee_name: string | null;
  location_name: string | null;
  line_count: number;
  kind: string;
  submitted_at: string | null;
  job: { ticket_no: string | null; full_name: string | null; phone: string | null } | null;
}

export function fetchPendingMaterials(): Promise<PendingMaterials[]> {
  return api.get<PendingMaterials[]>('/jobs/materials/pending');
}

export function approveMaterials(id: string): Promise<unknown> {
  return api.post(`/jobs/materials/${id}/approve`);
}

export function rejectMaterials(id: string, reason: string): Promise<unknown> {
  return api.post(`/jobs/materials/${id}/reject`, { reason });
}

// ── Sites & devices ───────────────────────────────────────────
export interface CustomerDevice {
  id: string;
  party_name: string | null;
  party_phone: string | null;
  site_name: string | null;
  category: string;
  category_label: string;
  brand: string | null;
  model: string | null;
  serial_no: string | null;
  location_note: string | null;
  quantity: number;
  status: 'working' | 'faulty' | string;
  installed_on: string | null;
  warranty_until: string | null;
  warranty_state: 'in_warranty' | 'ending' | 'expired' | 'unknown' | string;
  warranty_days: number | null;
  amc_contract_no: string | null;
  amc_status: string | null;
}

export interface DeviceSummary {
  devices: number;
  units: number;
  customers: number;
  faulty: number;
  in_warranty: number;
  warranty_ending: number;
  under_amc: number;
}

export function fetchDevices(): Promise<{ devices: CustomerDevice[]; summary: DeviceSummary }> {
  return api.get('/devices');
}

// ── Past records (Vyapar import) ──────────────────────────────
export interface PastRecord {
  id: string;
  doc_type: string;
  doc_no: string | null;
  doc_date: string | null;
  party_name: string | null;
  party_phone: string | null;
  total_paise: number;
  payment_state: string | null;
  payment_mode: string | null;
}

export interface PastRecordPage {
  rows: PastRecord[];
  total: number;
  total_paise: number;
}

export function fetchPastRecords(type: string, q: string, offset: number): Promise<PastRecordPage> {
  const qs = new URLSearchParams({ type, limit: '50', offset: String(offset) });
  if (q) qs.set('q', q);
  return api.get<PastRecordPage>(`/vyapar/history?${qs.toString()}`);
}

// ── WhatsApp campaigns ────────────────────────────────────────
export interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduled_at: string | null;
  recurrence: string | null;
  is_standing: boolean;
  progress: { queued: number; sent: number; failed: number; skipped: number; total: number };
}

export function fetchCampaigns(): Promise<Campaign[]> {
  return api.get<Campaign[]>('/campaigns');
}

// ── One job in full: costs, materials, invoice ───────────────
export interface JobSummary {
  basis: string;
  job: {
    ticket_no: string | null;
    customer: string | null;
    phone: string | null;
    type: string;
    status: string | null;
  };
  material_lines: {
    item_name: string | null;
    description: string | null;
    kind: string;
    base_quantity: number | string;
    cost_paise: number;
    status: string;
  }[];
  costs: {
    id: string;
    kind: string;
    description: string | null;
    basis: string;
    billable: number | boolean;
    quantity: number | string;
    rate_paise: number;
    amount_paise: number;
  }[];
  documents: { doc_type: string; status: string; doc_no: string | null; total_paise: number }[];
  totals: {
    estimated_cost_paise: number;
    material_cost_paise: number;
    other_cost_paise: number;
    revenue_paise: number;
    margin_paise: number;
    margin_pct: number | null;
    pending_approvals: number;
  };
}

export const fetchJobSummary = (jobType: string, jobId: string) =>
  api.get<JobSummary>(`/jobs/${encodeURIComponent(jobType)}/${encodeURIComponent(jobId)}/summary`);

export const addJobCost = (b: { job_type: string; job_id: string; kind: string; description: string; quantity: number; rate: string; billable: boolean }) =>
  api.post('/jobs/costs', b);

export const reverseJobCost = (id: string, reason: string) => api.del(`/jobs/costs/${encodeURIComponent(id)}`, { reason });

export const invoiceJob = (jobType: string, jobId: string) =>
  api.post<{ reused?: boolean }>(`/jobs/${encodeURIComponent(jobType)}/${encodeURIComponent(jobId)}/invoice`, {});

// ── Stock held by technicians ────────────────────────────────
export interface TechnicianVans {
  scope: { basis: string };
  vans: {
    location_name: string;
    employee_name: string | null;
    value_paise: number;
    items: { name: string; held_qty: number | string; base_unit?: string | null; unit?: string | null; value_paise: number }[];
  }[];
}
export const fetchTechnicianStock = () => api.get<TechnicianVans>('/jobs/technician-stock');
