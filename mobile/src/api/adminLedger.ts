import { api } from './client';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  is_system: number;
  active: number;
  opening_balance_paise: number | string | null;
}

export const fetchAccounts = () => api.get<Account[]>('/accounting/accounts');

export function saveAccount(
  existing: Account | null,
  body: { code?: string; name: string; type?: string; subtype: string; opening_balance: string | number; active?: boolean },
): Promise<unknown> {
  return existing ? api.patch(`/accounting/accounts/${existing.id}`, body) : api.post('/accounting/accounts', body);
}

export interface Journal {
  id: string;
  journal_no: string | null;
  journal_date: string;
  narration: string | null;
  source_type: string;
  status: string;
  reversal_of_id: string | null;
  reversed_by_id: string | null;
  reversal_reason: string | null;
  total_paise: number;
  posted_by_name: string | null;
  posted_at: string;
}

export interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  party_name: string | null;
  debit_paise: number;
  credit_paise: number;
  memo: string | null;
}

export const fetchJournals = (from: string, to: string) => {
  const qs = new URLSearchParams({ limit: '300' });
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return api.get<Journal[]>(`/accounting/journals?${qs.toString()}`);
};

export const loadJournal = (id: string) => api.get<{ journal: Journal; lines: JournalLine[] }>(`/accounting/journals/${encodeURIComponent(id)}`);

export const reverseJournal = (id: string, reason: string) => api.post(`/accounting/journals/${encodeURIComponent(id)}/reverse`, { reason });

export const postJournal = (b: {
  date: string;
  narration: string;
  lines: { account_id: string; debit: string | number; credit: string | number; memo: string }[];
  idempotency_key: string;
}) => api.post('/accounting/journals', b);

export const postOpeningBalances = (asOn: string) => api.post<{ journal?: { journal_no?: string }; reused?: boolean }>('/accounting/opening-balances', { as_on: asOn });

export interface PeriodLock {
  id: string;
  locked_upto: string;
  reason: string | null;
  locked_by_name: string | null;
  created_at: string;
}

export const fetchLocks = () => api.get<PeriodLock[]>('/accounting/period-locks');
export const createLock = (locked_upto: string, reason: string) => api.post('/accounting/period-locks', { locked_upto, reason });
export const removeLock = (id: string, reason: string) => api.del(`/accounting/period-locks/${encodeURIComponent(id)}`, { reason });

export interface AuditRow {
  id: string;
  actor_name?: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  created_at: string;
}

export const fetchAudit = () => api.get<AuditRow[]>('/accounting/audit?limit=200');
