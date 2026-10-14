import { api } from './client';

export interface PurchaseLine {
  id?: string;
  kind?: string;
  item_id: string | null;
  description: string;
  quantity: number | string;
  received_qty?: number | string;
  unit: string | null;
  rate_paise?: number | string;
  tax_rate_bps?: number | string;
  tax_treatment?: string;
  amount_paise?: number | string;
  serial_numbers?: string[] | null;
  base_quantity?: number | string;
  landed_cost_paise?: number | string;
}

export interface PurchaseDocFull {
  id: string;
  doc_type: string;
  doc_no: string | null;
  status: string;
  party_id: string | null;
  party_name: string | null;
  doc_date: string;
  due_date: string | null;
  supplier_ref: string | null;
  location_id: string | null;
  location_name: string | null;
  grn_id?: string | null;
  po_id?: string | null;
  notes: string | null;
  input_credit_eligible?: number | null;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
  cancel_reason?: string | null;
}

export interface PurchaseLoaded {
  document: PurchaseDocFull;
  lines: PurchaseLine[];
  allocations: { payment_no: string | null; payment_date: string; method: string | null; reference: string | null; amount_paise: number }[];
  paid_paise: number;
  balance_paise: number;
}

export const loadPurchase = (id: string) => api.get<PurchaseLoaded>(`/purchases/documents/${encodeURIComponent(id)}`);

export interface PurchasePayload {
  doc_type: string;
  party_id: string | null;
  doc_date: string;
  due_date: string | null;
  location_id: string | null;
  supplier_ref: string | null;
  grn_id: string | null;
  po_id: string | null;
  input_credit_eligible: boolean;
  notes: string;
  lines: {
    item_id: string | null;
    description: string;
    quantity: number;
    unit: string | null;
    rate: string | number;
    tax_rate_bps: number;
    tax_treatment: string;
    serial_numbers: string[] | null;
  }[];
  charges: { label: string; amount: string; tax_rate_bps: number; tax_treatment: string }[];
}

export const createPurchase = (p: PurchasePayload) => api.post<{ document: { id: string } }>('/purchases/documents', p);
export const updatePurchase = (id: string, p: PurchasePayload) => api.patch<{ document: { id: string } }>(`/purchases/documents/${id}`, p);
export const issuePurchase = (id: string) => api.post(`/purchases/documents/${id}/issue`);
export const cancelPurchase = (id: string, reason: string) => api.post(`/purchases/documents/${id}/cancel`, { reason });

export const receiveOrder = (
  orderId: string,
  body: { doc_date: string; location_id: string; supplier_ref: string | null; lines: { po_line_id: string; quantity: number; serial_numbers: string[] | null }[] },
) => api.post<{ document: { id: string } }>(`/purchases/orders/${orderId}/receive`, body);

export const paySupplier = (body: {
  party_id: string;
  payment_date: string;
  method: string;
  amount: string;
  reference: string;
  idempotency_key: string;
  allocations: { document_id: string; amount: string }[];
}) => api.post('/purchases/payments', body);
