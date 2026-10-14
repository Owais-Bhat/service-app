import { api } from './client';

// Every money figure in the books is in paise; `rupees` is the one conversion.
export const rupees = (paise: number | string | null | undefined): number => (Number(paise) || 0) / 100;

// ── Customers & suppliers ─────────────────────────────────────
export interface PartyRow {
  id: string;
  display_name: string;
  kind: 'customer' | 'supplier' | 'both' | string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  gst_treatment: string | null;
  balance_paise: number | string | null;
  active: number;
}

export interface PartySummary {
  count: number;
  owing_count: number;
  owing_paise: number;
  credit_count: number;
  credit_paise: number;
  net_paise: number;
}

export function fetchParties(kind: string, q: string): Promise<PartyRow[]> {
  const qs = new URLSearchParams({ limit: '300' });
  if (kind !== 'all') qs.set('kind', kind);
  if (q) qs.set('q', q);
  return api.get<PartyRow[]>(`/parties?${qs.toString()}`);
}

export function fetchPartySummary(kind: string): Promise<PartySummary> {
  const qs = new URLSearchParams();
  if (kind !== 'all') qs.set('kind', kind);
  return api.get<PartySummary>(`/parties/summary?${qs.toString()}`);
}

// ── AMC ───────────────────────────────────────────────────────
export interface AmcContract {
  id: string;
  contract_no: string;
  title: string | null;
  party_name: string | null;
  party_phone: string | null;
  start_date: string;
  end_date: string;
  amount_paise: number;
  state: 'active' | 'expired' | 'upcoming' | 'renewed' | 'cancelled' | string;
  days_left: number | null;
  days_overdue: number | null;
  visits_included: number | null;
  visits_used: number;
  visits_left: number | null;
  has_invoice: boolean;
  invoice_due_paise: number | null;
}

export interface AmcSummary {
  running: number;
  running_value_paise: number;
  lapsing_30: number;
  lapsed: number;
  not_invoiced: number;
  unpaid_paise: number;
}

export function fetchAmc(): Promise<{ contracts: AmcContract[]; summary: AmcSummary }> {
  return api.get('/amc/contracts');
}

// ── Sales ─────────────────────────────────────────────────────
export interface SalesDoc {
  id: string;
  doc_type: 'quotation' | 'invoice' | 'credit_note' | string;
  doc_no: string;
  doc_date: string;
  due_date: string | null;
  status: string;
  party_name: string | null;
  party_phone: string | null;
  total_paise: number;
  paid_paise: number;
  bill_type?: string | null;
}

export function fetchSalesDocs(docType: string): Promise<SalesDoc[]> {
  return api.get<SalesDoc[]>(`/sales/documents?doc_type=${docType}&limit=300`);
}

export interface OpenInvoice {
  id: string;
  doc_no: string;
  doc_date: string;
  due_date: string | null;
  party_name: string | null;
  party_phone: string | null;
  total_paise: number;
  outstanding_paise: number;
  days_overdue: number;
}

export async function fetchReceivables(): Promise<OpenInvoice[]> {
  const res = await api.get<OpenInvoice[] | { open?: OpenInvoice[]; invoices?: OpenInvoice[] }>('/sales/receivables');
  if (Array.isArray(res)) return res;
  return res.open ?? res.invoices ?? [];
}

// ── Purchases ─────────────────────────────────────────────────
export interface PurchaseDoc {
  id: string;
  doc_type: string;
  doc_no: string;
  supplier_ref: string | null;
  doc_date: string;
  due_date: string | null;
  status: string;
  party_name: string | null;
  location_name: string | null;
  total_paise: number;
  paid_paise: number;
}

export function fetchPurchaseDocs(docType: string): Promise<PurchaseDoc[]> {
  return api.get<PurchaseDoc[]>(`/purchases/documents?doc_type=${docType}&limit=300`);
}

export interface OpenBill {
  id: string;
  doc_no: string;
  supplier_ref: string | null;
  doc_date: string;
  due_date: string | null;
  party_name: string | null;
  total_paise: number;
  outstanding_paise: number;
  days_overdue: number;
  bucket: string;
}

export async function fetchPayables(): Promise<OpenBill[]> {
  const res = await api.get<OpenBill[] | { open?: OpenBill[]; bills?: OpenBill[] }>('/purchases/payables');
  if (Array.isArray(res)) return res;
  return res.open ?? res.bills ?? [];
}

// ── Stock & items ─────────────────────────────────────────────
export interface StockValuationItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  active: boolean;
  quantity: number;
  quantity_matches: boolean;
  avg_cost_paise: number;
  value_paise: number;
}

export interface StockValuation {
  method: string;
  items: StockValuationItem[];
  total_value_paise: number;
  discrepancies: StockValuationItem[];
}

export function fetchStockValuation(): Promise<StockValuation> {
  return api.get<StockValuation>('/stock/valuation');
}

export interface StockLocation {
  id: string;
  name: string;
  kind?: string | null;
  employee_name: string | null;
  is_default: number;
}

export function fetchStockLocations(): Promise<StockLocation[]> {
  return api.get<StockLocation[]>('/stock/locations');
}

export interface ItemRow {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  brand: string | null;
  model: string | null;
  selling_rate: number | string | null;
  purchase_rate?: number | string | null;
  gst_rate: number | string | null;
  quantity: number | string | null;
  min_stock: number | string | null;
  active: number;
}

export function fetchItems(): Promise<ItemRow[]> {
  return api.get<ItemRow[]>('/inventory/items?all=1');
}

// ── Ledger & reports ──────────────────────────────────────────
export interface TrialAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  debit_paise: number;
  credit_paise: number;
  balance_paise: number;
}

export interface TrialBalance {
  accounts: TrialAccount[];
  totals: { debit_paise: number; credit_paise: number };
  scope?: { from: string; to: string; basis: string };
}

export function fetchTrialBalance(): Promise<TrialBalance> {
  return api.get<TrialBalance>('/accounting/trial-balance');
}

export interface OwnerSummary {
  as_on: string;
  today: { sales_paise: number; collected_paise: number };
  month: { from: string; sales_paise: number; collected_paise: number; expenses_paise: number; profit_paise: number };
  money: { cash_in_hand_paise: number; bank_paise: number; with_technicians_paise: number; technician_cash_tickets: number };
  receivable: {
    total_paise: number;
    overdue_paise: number;
    top: { party: string; phone: string | null; outstanding_paise: number; oldest_days: number }[];
  };
  payable: { total_paise: number; overdue_paise: number };
  gst: { month_payable_paise: number; collected_paise: number; claimable_paise: number };
  stock: { value_paise: number; low_items: number };
  attention: { unposted_tickets: number; failing_checks: string[] };
}

export function fetchOwnerSummary(): Promise<OwnerSummary> {
  return api.get<OwnerSummary>('/reports/owner-summary');
}
