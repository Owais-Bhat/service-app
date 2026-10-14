import { api } from './client';

// Every figure is paise; the screens convert with `rupees` from adminBooks.
const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export interface ReminderCustomer {
  party_id: string;
  party: string;
  phone: string | null;
  overdue_paise: number;
  outstanding_paise: number;
  oldest_days: number;
  times_reminded: number;
  last_reminded_at: string | null;
  whatsapp_url: string | null;
}
export interface Reminders {
  scope: { basis: string };
  totals: { customers_paise: number; suppliers_paise: number };
  customers: ReminderCustomer[];
  suppliers: { party: string; overdue_paise: number; outstanding_paise: number; oldest_days: number }[];
}
export const fetchReminders = (asOn: string) => api.get<Reminders>(`/reports/reminders?${q({ as_on: asOn })}`);
export const markReminded = (partyId: string, amountPaise: number, channel: string) =>
  api.post('/reports/reminders/mark', { party_id: partyId, amount_paise: amountPaise, channel });
export const sendPaymentReminder = (partyId: string) =>
  api.post<{ ok?: boolean; error?: string }>('/whatsapp/send/payment-reminder', { party_id: partyId });

export interface AccountLine {
  code: string;
  name: string;
  amount_paise: number;
}
export interface ProfitLoss {
  scope: { from: string; to: string; basis: string };
  income: AccountLine[];
  cogs: AccountLine[];
  expenses: AccountLine[];
  totals: { income_paise: number; cogs_paise: number; gross_profit_paise: number; expenses_paise: number; net_profit_paise: number };
}
export const fetchProfitLoss = (from: string, to: string) => api.get<ProfitLoss>(`/reports/profit-loss?${q({ from, to })}`);

export interface BalanceLine {
  code: string;
  name: string;
  balance_paise: number;
}
export interface BalanceSheet {
  scope: { as_on: string; basis: string };
  balanced: boolean;
  assets: BalanceLine[];
  liabilities: BalanceLine[];
  equity: BalanceLine[];
  totals: {
    assets_paise: number;
    liabilities_and_equity_paise: number;
    profit_to_date_paise: number;
    difference_paise: number;
  };
}
export const fetchBalanceSheet = (asOn: string) => api.get<BalanceSheet>(`/reports/balance-sheet?${q({ as_on: asOn })}`);

export interface AgeingParty {
  party: string;
  phone: string | null;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  outstanding_paise: number;
  advance_paise: number;
}
export interface Ageing {
  scope: { as_on: string; basis: string };
  parties: AgeingParty[];
  totals: { d0_30: number; d31_60: number; d61_90: number; d90_plus: number; outstanding_paise: number; advance_paise: number };
}
export const fetchAgeing = (kind: 'receivable' | 'payable', asOn: string) => api.get<Ageing>(`/reports/ageing?${q({ kind, as_on: asOn })}`);

export interface LedgerRow {
  date: string;
  journal_no: string;
  narration: string | null;
  party?: string | null;
  status?: string;
  debit_paise: number;
  credit_paise: number;
  balance_paise: number;
}
export interface AccountLedger {
  scope: { from: string; to: string };
  account: { code: string; name: string };
  opening_paise: number;
  rows: LedgerRow[];
  totals: { debit_paise: number; credit_paise: number };
  closing_paise: number;
}
export const fetchAccountLedger = (account: string, from: string, to: string) =>
  api.get<AccountLedger>(`/reports/account-ledger?${q({ account, from, to })}`);

export interface PartyStatement {
  scope: { from: string; to: string };
  party: { display_name: string };
  opening_paise: number;
  rows: LedgerRow[];
  totals: { debit_paise: number; credit_paise: number };
  closing_paise: number;
}
export const fetchPartyStatement = (partyId: string, from: string, to: string) =>
  api.get<PartyStatement>(`/reports/party-statement?${q({ party_id: partyId, from, to })}`);

export interface PartyOption {
  id: string;
  display_name: string;
}
export const fetchPartyOptions = () => api.get<PartyOption[]>('/parties?limit=5000');

export interface GstTotals {
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  tax_paise: number;
}
export interface GstSummary {
  scope: { basis: string };
  output: GstTotals & {
    by_category: { category: string; documents: number; taxable_paise: number; cgst_paise: number; sgst_paise: number; igst_paise: number; total_paise: number }[];
  };
  input: GstTotals & { ineligible_tax_paise: number };
  payable: { cgst_paise: number; sgst_paise: number; igst_paise: number; total_paise: number };
  against_ledger: Record<string, { documents_paise: number; ledger_paise: number; difference_paise: number }>;
}
export const fetchGstSummary = (from: string, to: string) => api.get<GstSummary>(`/reports/gst/summary?${q({ from, to })}`);

export interface GstSalesRow {
  date: string;
  doc_no: string;
  doc_type: string;
  party: string;
  gstin: string | null;
  category: string;
  source?: string;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
}
export const fetchGstSales = (from: string, to: string) =>
  api.get<{ rows: GstSalesRow[] }>(`/reports/gst/sales-register?${q({ from, to })}`).then((r) => r.rows);

export interface GstPurchaseRow {
  date: string;
  doc_no: string;
  supplier_ref: string | null;
  party: string;
  gstin: string | null;
  eligible: boolean;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
}
export const fetchGstPurchases = (from: string, to: string) =>
  api.get<{ rows: GstPurchaseRow[] }>(`/reports/gst/purchase-register?${q({ from, to })}`).then((r) => r.rows);

export interface HsnRow {
  hsn_sac: string | null;
  unit: string;
  rate_pct: number;
  quantity: number;
  taxable_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
}
export const fetchGstHsn = (from: string, to: string) =>
  api.get<{ rows: HsnRow[]; note: string }>(`/reports/gst/hsn-summary?${q({ from, to })}`);

export interface StockValuation {
  scope: { basis: string };
  total_value_paise: number;
  ledger_inventory_paise: number;
  difference_paise: number;
  items: {
    name: string;
    sku: string | null;
    unit: string | null;
    quantity: number;
    avg_cost_paise: number;
    value_paise: number;
    quantity_matches?: boolean;
  }[];
}
export const fetchStockValuation = () => api.get<StockValuation>('/reports/stock-valuation');

export interface JobProfit {
  scope: { basis: string };
  totals: { revenue_paise: number; cost_paise: number; margin_paise: number; unbilled_jobs: number; unbilled_cost_paise: number };
  jobs: {
    job_date: string;
    ticket_no: string | null;
    customer: string | null;
    unbilled: boolean;
    revenue_paise: number;
    total_cost_paise: number;
    margin_paise: number;
    margin_pct: number | null;
  }[];
}
export const fetchJobProfit = (from: string, to: string) => api.get<JobProfit>(`/jobs/profitability?${q({ from, to })}`);

export interface Reconciliation {
  ok: boolean;
  checks: { label: string; note?: string; ok: boolean; count?: boolean | number; a_paise: number; b_paise: number; difference_paise: number }[];
}
export const fetchReconciliation = (asOn: string) => api.get<Reconciliation>(`/reports/reconciliation?${q({ as_on: asOn })}`);
