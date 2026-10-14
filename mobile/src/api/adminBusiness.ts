import { api } from './client';

export interface Business {
  legal_name: string | null;
  trade_name: string | null;
  registration_type: string | null;
  gstin: string | null;
  pan: string | null;
  state_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  upi_id: string | null;
  logo_url: string | null;
  signature_url: string | null;
  fy_start_month: number | string | null;
  invoice_footer: string | null;
  payment_instructions: string | null;
  setup_complete: number | boolean | null;
}

export interface BusinessInfo {
  business: Business;
  setup_pending?: string[];
  fy_label: string;
}

export const fetchBusiness = () => api.get<BusinessInfo>('/accounting/business');
export const saveBusiness = (b: Record<string, unknown>) => api.put('/accounting/business', b);

export interface SeriesRow {
  id: string;
  doc_type: string;
  fy_label: string;
  prefix: string | null;
  suffix: string | null;
  padding: number | null;
  next_number: number;
}
export const fetchSeries = () => api.get<SeriesRow[]>('/accounting/series');
export const saveSeries = (id: string, b: { prefix: string; suffix: string; padding: number; next_number: number; reason: string }) =>
  api.patch(`/accounting/series/${encodeURIComponent(id)}`, b);

export interface TaxRateRow {
  id: string;
  name: string;
  treatment: string;
  rate_bps: number | string;
  effective_from: string;
  effective_to: string | null;
  is_default?: number | boolean;
}
export const fetchTaxRateRows = () => api.get<TaxRateRow[]>('/accounting/tax-rates');
export const saveTaxRate = (b: {
  name: string;
  treatment: string;
  rate_bps: number;
  effective_from: string;
  reason: string;
  supersedes_id?: string;
}) => api.post('/accounting/tax-rates', b);

export interface ServiceLedgerStatus {
  from: string | null;
  enabled: boolean;
  billed: number;
  collected: number;
  attention: { source_type: string; source_id: string; ticket_ref: string | null; note: string | null }[];
}
export const fetchServiceLedger = () => api.get<ServiceLedgerStatus>('/service-ledger/status');
export const setServiceLedgerFrom = (from: string | null) => api.put('/service-ledger/settings', { from });
export const syncServiceLedger = () => api.post<{ checked?: number; synced?: number; blocked?: number }>('/service-ledger/sync');

export interface WaTemplate {
  purpose: string;
  label: string;
  message_id: string | null;
  enabled: boolean;
  vars: string[];
  header?: string | null;
  suggested: string;
  media?: boolean;
}
export interface WaSettings {
  enabled: boolean;
  phone_number_id: string | null;
  api_key_set: boolean;
  templates: WaTemplate[];
}
export interface WaLogRow {
  id?: string;
  created_at: string;
  purpose: string;
  party_name: string | null;
  phone: string;
  status: string;
  error: string | null;
}
export const fetchWaSettings = () => api.get<WaSettings>('/whatsapp/settings');
export const fetchWaLog = () => api.get<WaLogRow[]>('/whatsapp/log?limit=15');
export const saveWaSettings = (b: {
  enabled: boolean;
  phone_number_id: string;
  templates: { purpose: string; message_id: string; enabled: boolean }[];
}) => api.put<Partial<WaSettings>>('/whatsapp/settings', b);
export const sendWaTest = (purpose: string, phone: string) => api.post('/whatsapp/test', { purpose, phone });
