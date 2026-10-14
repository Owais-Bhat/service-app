import { api } from './client';

export interface PartyFull {
  id: string;
  display_name: string;
  legal_name: string | null;
  kind: string;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  gst_treatment: string | null;
  gstin: string | null;
  place_of_supply_state_code: string | null;
  credit_days: number | null;
  credit_limit_paise: number | null;
  opening_balance_paise: number | null;
  opening_balance_type: string | null;
  notes: string | null;
  booking_exempt: number | null;
  active: number;
}

export interface PartyAddress {
  id: string;
  kind: string | null;
  line1: string | null;
  city: string | null;
  pincode: string | null;
}

export interface PartyDetail {
  party: PartyFull;
  addresses: PartyAddress[];
  receivable_paise: number;
}

export function fetchPartyDetail(id: string): Promise<PartyDetail> {
  return api.get<PartyDetail>(`/parties/${encodeURIComponent(id)}`);
}

export interface SupplierSummary {
  totals: { bought_paise: number; paid_paise: number; billed_due_paise: number; other_paise: number; returned_paise: number };
  items: { name: string; quantity: number; unit: string | null; last_rate_paise: number; spent_paise: number; last_date: string | null }[];
  bills: { id: string; doc_no: string; supplier_ref: string | null; doc_date: string; total_paise: number; paid_paise: number; balance_paise: number }[];
}

export function fetchSupplierSummary(id: string): Promise<SupplierSummary> {
  return api.get<SupplierSummary>(`/purchases/suppliers/${encodeURIComponent(id)}/summary`);
}

export interface PartyInput {
  display_name: string;
  legal_name: string;
  phone: string;
  email: string;
  kind: string;
  gst_treatment: string;
  gstin: string;
  place_of_supply_state_code: string;
  credit_days: number;
  credit_limit: string | number;
  opening_balance: string | number;
  opening_balance_type: string;
  notes: string;
  booking_exempt: boolean;
  reason?: string;
  active?: boolean;
  addresses?: { kind: string; line1: string; city: string; pincode: string; state_code: string; is_default: boolean }[];
}

export function createParty(body: PartyInput): Promise<unknown> {
  return api.post('/parties', body);
}

export function updateParty(id: string, body: PartyInput): Promise<unknown> {
  return api.patch(`/parties/${encodeURIComponent(id)}`, body);
}

export interface GstLookup {
  configured: boolean;
  found: boolean;
  error?: string;
  details?: {
    legal_name: string;
    trade_name: string | null;
    status: string | null;
    address: { line1: string; city: string; pincode: string; state_code: string; full: string };
  };
}

export function lookupGstin(gstin: string): Promise<GstLookup> {
  return api.get<GstLookup>(`/parties/gst-lookup/${encodeURIComponent(gstin)}`);
}

export interface DuplicateGroup {
  reason: string;
  parties: { id: string; display_name: string; phone: string | null; gstin: string | null; created_at: string | null }[];
}

export async function fetchDuplicates(): Promise<DuplicateGroup[]> {
  const res = await api.get<DuplicateGroup[] | { groups?: DuplicateGroup[] }>('/parties/duplicates/suggest');
  return Array.isArray(res) ? res : res.groups ?? [];
}

export function mergeParties(keepId: string, mergeIds: string[], reason: string): Promise<unknown> {
  return api.post('/parties/merge', { keep_id: keepId, merge_ids: mergeIds, reason });
}
