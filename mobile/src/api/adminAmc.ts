import { api } from './client';
import { AmcContract } from './adminBooks';

export interface AmcDetailContract extends AmcContract {
  party_id: string;
  site: string | null;
  equipment: string | null;
  terms: string | null;
  notes: string | null;
  tax_rate_bps: number | string | null;
  tax_treatment: string | null;
  invoice_no: string | null;
  invoice_id: string | null;
  invoice_status: string | null;
  invoice_total_paise: number | null;
  invoice_paid_paise: number | null;
  visits_chargeable?: number;
  reminders_sent?: number;
}

export interface AmcVisit {
  id: string;
  visit_date: string;
  kind: string;
  ticket_ref: string | null;
  note: string | null;
  chargeable: number;
}

export interface AmcLoaded {
  contract: AmcDetailContract;
  visits: AmcVisit[];
  earlier_terms: { id: string; contract_no: string; start_date: string; end_date: string; amount_paise: number }[];
}

export const loadAmc = (id: string) => api.get<AmcLoaded>(`/amc/contracts/${encodeURIComponent(id)}`);

export interface AmcPayload {
  party_id: string;
  title: string;
  site: string;
  equipment: string;
  start_date: string;
  end_date: string;
  visits_included: number | null;
  terms: string;
  notes: string;
  amount?: string | number;
  tax_treatment?: string;
  tax_rate_bps?: number;
}

export const createAmc = (p: AmcPayload) => api.post<{ contract: { id: string; contract_no: string } }>('/amc/contracts', p);
export const updateAmc = (id: string, p: Partial<AmcPayload>) => api.patch<{ contract: { id: string } }>(`/amc/contracts/${encodeURIComponent(id)}`, p);
export const invoiceAmc = (id: string) => api.post<{ invoice: { doc_no: string } }>(`/amc/contracts/${encodeURIComponent(id)}/invoice`, {});
export const renewAmc = (id: string, body: { start_date: string; amount: string }) =>
  api.post<{ contract: { id: string; contract_no: string } }>(`/amc/contracts/${encodeURIComponent(id)}/renew`, body);
export const cancelAmc = (id: string, reason: string) => api.post(`/amc/contracts/${encodeURIComponent(id)}/cancel`, { reason });
export const coverDevices = (id: string) => api.post<{ covered?: number }>(`/amc/contracts/${encodeURIComponent(id)}/cover-devices`, {});
export const logVisit = (id: string, body: { visit_date: string; kind: string; ticket_ref: string; note: string }) =>
  api.post<{ chargeable?: boolean }>(`/amc/contracts/${encodeURIComponent(id)}/visits`, body);
export const removeVisit = (visitId: string) => api.del(`/amc/visits/${encodeURIComponent(visitId)}`);
export const markReminded = (id: string) => api.post(`/amc/contracts/${encodeURIComponent(id)}/reminded`);
export const sendRenewalWhatsapp = (id: string) => api.post<{ ok?: boolean; error?: string }>('/whatsapp/send/amc-renewal', { contract_id: id });

export interface RenewalDue extends AmcContract {
  urgency: string;
  whatsapp_url: string | null;
  reminders_sent: number;
  last_reminded_at: string | null;
}

export async function fetchRenewals(days = 45): Promise<RenewalDue[]> {
  const res = await api.get<{ contracts: RenewalDue[] }>(`/amc/renewals?days=${days}`);
  return res.contracts;
}
