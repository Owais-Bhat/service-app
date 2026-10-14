import { api } from './client';

export interface TaxRate {
  id: string;
  treatment: string;
  rate_bps: number;
  effective_to: string | null;
  name?: string | null;
}

export const fetchTaxRates = () => api.get<TaxRate[]>('/accounting/tax-rates');

export interface SalesLine {
  id?: string;
  kind?: string;
  item_id: string | null;
  description: string;
  hsn_sac: string | null;
  quantity: number | string;
  unit: string | null;
  rate_paise?: number | string;
  discount_bps?: number | string;
  tax_rate_bps?: number | string;
  info_tax_bps?: number | string;
  tax_treatment?: string;
  amount_paise?: number | string;
}

export interface SalesDocFull {
  id: string;
  doc_type: 'estimate' | 'invoice' | 'credit_note' | string;
  doc_no: string | null;
  status: string;
  bill_type: string | null;
  party_id: string | null;
  party_name?: string | null;
  party_phone?: string | null;
  party_snapshot?: { display_name?: string; phone?: string; gstin?: string } | null;
  doc_date: string;
  due_date: string | null;
  valid_until: string | null;
  reference: string | null;
  notes: string | null;
  terms: string | null;
  prices_include_tax: number | boolean | null;
  doc_discount_paise: number | string | null;
  show_gst: number | boolean | null;
  supply_type: string | null;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  utgst_paise: number;
  igst_paise: number;
  round_off_paise: number;
  total_paise: number;
  revision_no?: number | null;
  converted_to_id?: string | null;
  accepted_at?: string | null;
  acceptance_method?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
}

export interface Allocation {
  payment_no: string | null;
  payment_date: string;
  method: string | null;
  reference: string | null;
  amount_paise: number;
}

export interface SalesLoaded {
  document: SalesDocFull;
  lines: SalesLine[];
  allocations: Allocation[];
  paid_paise: number;
  balance_paise: number;
  payment_status: string;
}

export const loadSalesDoc = (id: string) => api.get<SalesLoaded>(`/sales/documents/${encodeURIComponent(id)}`);

export interface SalesPayload {
  doc_type: string;
  bill_type: string;
  show_gst: boolean;
  party_id: string | null;
  doc_date: string;
  due_date: string | null;
  valid_until: string | null;
  reference: string;
  prices_include_tax: boolean;
  doc_discount: string | number;
  notes: string;
  terms: string;
  lines: {
    item_id: string | null;
    description: string;
    hsn_sac: string | null;
    quantity: number;
    unit: string | null;
    rate: string | number;
    discount_bps: number;
    tax_rate_bps: number;
    tax_treatment: string;
  }[];
  reason?: string;
}

export interface Priced {
  totals: {
    taxable_paise: number;
    cgst_paise: number;
    sgst_paise: number;
    utgst_paise: number;
    igst_paise: number;
    round_off_paise: number;
    total_paise: number;
  };
  lines: { amount_paise: number }[];
  info?: { tax_paise: number } | null;
  supply_type?: string;
}

export const previewSales = (p: SalesPayload) => api.post<Priced>('/sales/preview', p);
export const createSales = (p: SalesPayload) => api.post<{ document: { id: string } }>('/sales/documents', p);
export const updateSales = (id: string, p: SalesPayload) => api.patch<{ document: { id: string } }>(`/sales/documents/${id}`, p);
export const issueSales = (id: string) => api.post(`/sales/documents/${id}/issue`);
export const amendSales = (id: string, p: SalesPayload) => api.post(`/sales/documents/${id}/amend`, p);
export const reviseSales = (id: string, p: SalesPayload) => api.post(`/sales/documents/${id}/revise`, p);
export const acceptSales = (id: string, method: string) => api.post(`/sales/documents/${id}/acceptance`, { status: 'accepted', method });
export const convertSales = (id: string) => api.post<{ document: { id: string }; reused?: boolean }>(`/sales/documents/${id}/convert`, { to: 'invoice' });
export const cancelSales = (id: string, reason: string) => api.post(`/sales/documents/${id}/cancel`, { reason });
export const salesShareLink = (id: string) => api.post<{ url: string }>(`/sales/documents/${id}/share-link`);
export const sendSalesWhatsapp = (id: string) => api.post<{ ok?: boolean; error?: string }>('/whatsapp/send/document', { document_id: id });

export interface ReceiptInput {
  party_id: string;
  payment_date: string;
  method: string;
  amount: string;
  reference: string;
  notes: string;
  idempotency_key: string;
  allocations: { document_id: string; amount: string }[];
}

export const recordReceipt = (b: ReceiptInput) => api.post('/payments', b);

export interface ReceiptRow {
  id: string;
  payment_no: string | null;
  payment_date: string;
  party_name: string | null;
  method: string | null;
  reference: string | null;
  amount_paise: number;
  unallocated_paise: number;
}

export const fetchReceipts = () => api.get<ReceiptRow[]>('/payments?direction=in&limit=200');

// One receipt in full: what it was put against, and what is still on account.
export interface PaymentLoaded {
  payment: {
    id: string;
    payment_no: string | null;
    payment_date: string;
    party_id: string;
    party_name: string | null;
    method: string | null;
    reference: string | null;
    amount_paise: number;
  };
  allocations: { doc_no: string | null; doc_date: string | null; amount_paise: number }[];
  unallocated_paise: number;
}

export const loadPayment = (id: string) => api.get<PaymentLoaded>(`/payments/${encodeURIComponent(id)}`);

export const allocatePayment = (id: string, documentId: string, amount: string) =>
  api.post(`/payments/${encodeURIComponent(id)}/allocate`, { allocations: [{ document_id: documentId, amount }] });
