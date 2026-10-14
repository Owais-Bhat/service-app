import { api, API_BASE_URL, ApiError, getToken } from './client';

// Money here is paise, as everywhere in the books.

export interface Check {
  key: string;
  label: string;
  ok: boolean;
  a_paise: number;
  difference_paise: number;
}
export interface BeforeAfter {
  checks: Check[];
}

export const emailBackup = () => api.post<{ to: string }>('/admin/backup/email', {});

// ── Vyapar ──────────────────────────────────────────────────────────────
export interface VyaparStatus {
  last?: Record<string, { at: string; as_on?: string } | undefined>;
}
export const fetchVyaparStatus = () => api.get<VyaparStatus>('/vyapar/status');

export interface VyaparSummary {
  parties: { count: number; owe_us: { paise: number }; we_owe: { paise: number }; with_phone: number };
  items: { count: number; with_stock: number; stock_value_paise: number; negative_stock: number; negative_units: number; without_price: number };
  documents: {
    count: number;
    lines: number;
    by_type: Record<string, { count: number; from: string | null; to: string | null; total_paise: number }>;
  };
  warnings: string[];
  warnings_total: number;
}

// The backup is posted as raw bytes; the server reads it and holds it for an hour.
export async function uploadVyapar(uri: string, name: string): Promise<{ session: string; summary: VyaparSummary }> {
  const token = await getToken();
  const blob = await (await fetch(uri)).blob();
  const res = await fetch(`${API_BASE_URL}/vyapar/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': name,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: blob,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(out.error || 'Could not read that file', res.status);
  return out;
}

export const runVyaparStep = (session: string, step: 'parties' | 'items' | 'history', asOn: string) =>
  api.post<Record<string, number>>(`/vyapar/${encodeURIComponent(session)}/${step}`, { as_on: asOn });

// ── Older tickets ───────────────────────────────────────────────────────
export interface TicketPreview {
  from: string;
  current_from: string | null;
  totals: { tickets: number; customers: number; billed_paise: number; collected_paise: number; outstanding_paise: number; with_technicians_paise: number };
  months: { month: string; tickets: number; billed_paise: number; collected_paise: number; outstanding_paise: number }[];
  warnings: string[];
  skipped: { count: number; reason: string }[];
}
export const previewTickets = (from: string) => api.get<TicketPreview>(`/migration/tickets/preview?from=${encodeURIComponent(from)}`);
export const applyTickets = (from: string) =>
  api.post<{ posted: number; blocked: number; before: BeforeAfter; after: BeforeAfter }>('/migration/tickets/apply', { from });

// ── Stock on the shelf ──────────────────────────────────────────────────
export interface StockPreview {
  totals: { items: number; value_paise: number; flagged: number };
  ledger_inventory_paise: number;
  movements_value_paise: number;
  ledger_vs_movements_paise: number;
  bookable: { item_id: string; name: string; sku: string | null; unit: string | null; on_hand: number; unbooked_qty: number; avg_cost_paise: number; unbooked_value_paise: number }[];
  flagged: { item_id?: string; name: string; on_hand: number; reason: string }[];
}
export const previewStock = () => api.get<StockPreview>('/migration/stock/preview');
export const applyStock = (date: string, itemIds: string[]) =>
  api.post<{ items: number; value_paise: number; before: BeforeAfter; after: BeforeAfter }>('/migration/stock/apply', { date, item_ids: itemIds });

// ── Service register ────────────────────────────────────────────────────
export interface LogPreview {
  note: string;
  counts: { on_a_ticket: number; already_in: number };
  totals: { entries: number; billed_paise: number; paid_paise: number; unpaid_paise?: number };
  candidates: { id: string; date: string; customer: string; phone: string | null; service: string | null; technician: string | null; amount_paise: number; status: string }[];
}
export const previewServiceLog = () => api.get<LogPreview>('/migration/service-log/preview');
export const applyServiceLog = (ids: string[], paidInto: 'cash' | 'bank') =>
  api.post<{ posted: number; entries: number; billed_paise: number; results: { ok: boolean }[] }>('/migration/service-log/apply', { ids, paid_into: paidInto });

// ── History and the evening summary ─────────────────────────────────────
export interface MigrationRun {
  id?: string;
  kind: string;
  status: string;
  created_at: string;
  by?: string | null;
  summary: Record<string, unknown> & { posted?: number; blocked?: number; items?: number; value_paise?: number; entries?: number; billed_paise?: number; from?: string; expected?: { tickets?: number } };
  before: BeforeAfter;
  after: BeforeAfter;
}
export const fetchRuns = () => api.get<MigrationRun[]>('/migration/runs');

export interface Automation {
  owner_digest_on: boolean;
  last_digest: string | null;
}
export const fetchAutomation = () => api.get<Automation>('/migration/automation');
export const setDigest = (on: boolean) => api.put('/migration/automation', { owner_digest_on: on });
export const sendDigestNow = () => api.post<{ sent: boolean; text?: string; why?: string }>('/migration/automation/send-now', {});
