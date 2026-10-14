import { calculateSlaDeadline } from '../api/adminInquiries';

// Pure calculations behind the Stats page — same rules as src/pages/stats-admin.js
// so the phone and the portal never disagree about a number.

export interface StatInquiry {
  status: string | null;
  assigned_employee_id: string | null;
  assignment_status: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at?: string | null;
  service_item: string | null;
  bill_total: number | string | null;
  bill_amount: number | string | null;
  payment_status: string | null;
  bill_generated_at: string | null;
  payment_received_at: string | null;
  reopened: number | null;
  employee_update_at?: string | null;
}

export const OPEN_STATUSES = ['pending', 'open', 'assigned', 'in_progress', 'reopened', 'issue_not_resolved'];
export const DONE_STATUSES = ['resolved', 'closed', 'case_closed', 'foc'];

const lower = (s: string | null | undefined) => (s || '').toLowerCase();
const num = (n: unknown) => Number(n) || 0;
const dayKey = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('en-CA') : '');

export const isOpen = (r: StatInquiry) => OPEN_STATUSES.includes(lower(r.status));
export const isDone = (r: StatInquiry) => DONE_STATUSES.includes(lower(r.status));
export const amountOf = (r: StatInquiry) => num(r.bill_total) || num(r.bill_amount);
export const isUnpaid = (r: StatInquiry) => amountOf(r) > 0 && r.payment_status !== 'paid' && r.payment_status !== 'foc';

const CATEGORIES: { key: string; match: RegExp }[] = [
  { key: 'CCTV', match: /cctv|camera|dvr|nvr/i },
  { key: 'Networking', match: /network|router|wifi|lan|internet/i },
  { key: 'Gate Automation', match: /gate|barrier|boom/i },
  { key: 'VDP', match: /door phone|vdp|intercom|doorbell/i },
  { key: 'Biometric', match: /biometric|fingerprint|attendance machine|face/i },
  { key: 'Access Control', match: /access control|lock|rfid/i },
];

export function categoryOf(item: string | null | undefined): string {
  return CATEGORIES.find((c) => c.match.test(String(item || '')))?.key || 'Other';
}

export type RangeKey = 'today' | '7d' | '30d' | '90d';
export const RANGE_DAYS: Record<RangeKey, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 };

export function withinRange(rows: StatInquiry[], range: RangeKey, now = new Date()): StatInquiry[] {
  const from = new Date(now);
  from.setDate(from.getDate() - (RANGE_DAYS[range] - 1));
  from.setHours(0, 0, 0, 0);
  return rows.filter((r) => new Date(r.created_at) >= from);
}

export interface Operations {
  newCount: number;
  pendingAssign: number;
  inProgress: number;
  resolvedToday: number;
  overdue: number;
}

export function operations(all: StatInquiry[], range: RangeKey, now = new Date()): Operations {
  const open = all.filter(isOpen);
  const today = dayKey(now);
  return {
    newCount: withinRange(all, range, now).length,
    pendingAssign: open.filter((r) => !r.assigned_employee_id).length,
    inProgress: open.filter((r) => lower(r.status) === 'in_progress').length,
    resolvedToday: all.filter((r) => isDone(r) && dayKey(r.updated_at || r.created_at) === today).length,
    overdue: open.filter((r) => r.assigned_at && now > calculateSlaDeadline(r.assigned_at)).length,
  };
}

export interface Pipeline {
  label: string;
  n: number;
}

export function pipeline(all: StatInquiry[]): Pipeline[] {
  const open = all.filter(isOpen);
  return [
    { label: 'New', n: open.filter((r) => ['open', 'pending'].includes(lower(r.status)) && !r.assigned_employee_id).length },
    { label: 'Pending', n: open.filter((r) => r.assigned_employee_id && r.assignment_status === 'pending').length },
    { label: 'Assigned', n: open.filter((r) => r.assigned_employee_id && r.assignment_status === 'accepted' && lower(r.status) !== 'in_progress').length },
    { label: 'In progress', n: open.filter((r) => lower(r.status) === 'in_progress').length },
    { label: 'Reopened', n: open.filter((r) => Number(r.reopened) === 1).length },
    { label: 'Resolved', n: all.filter((r) => ['resolved', 'closed', 'foc'].includes(lower(r.status))).length },
    { label: 'Issue', n: all.filter((r) => lower(r.status) === 'issue_not_resolved').length },
  ];
}

export interface Collection {
  billedToday: number;
  collectedToday: number;
  pending: number;
  unpaidCount: number;
}

export function collection(all: StatInquiry[], now = new Date()): Collection {
  const today = dayKey(now);
  const unpaid = all.filter(isUnpaid);
  return {
    billedToday: all.filter((r) => dayKey(r.bill_generated_at || r.updated_at) === today).reduce((s, r) => s + amountOf(r), 0),
    collectedToday: all
      .filter((r) => r.payment_status === 'paid' && dayKey(r.payment_received_at || r.updated_at) === today)
      .reduce((s, r) => s + amountOf(r), 0),
    pending: unpaid.reduce((s, r) => s + amountOf(r), 0),
    unpaidCount: unpaid.length,
  };
}

export function monthRevenue(all: StatInquiry[], now = new Date()): Collection {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = all.filter((r) => dayKey(r.bill_generated_at || r.created_at).startsWith(key));
  const unpaid = month.filter(isUnpaid);
  return {
    billedToday: month.reduce((s, r) => s + amountOf(r), 0),
    collectedToday: month.filter((r) => r.payment_status === 'paid').reduce((s, r) => s + amountOf(r), 0),
    pending: unpaid.reduce((s, r) => s + amountOf(r), 0),
    unpaidCount: unpaid.length,
  };
}

export function categories(rows: StatInquiry[]): { key: string; n: number; pct: number }[] {
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(categoryOf(r.service_item), (counts.get(categoryOf(r.service_item)) || 0) + 1));
  const total = rows.length || 1;
  return [...counts.entries()]
    .map(([key, n]) => ({ key, n, pct: Math.round((n / total) * 100) }))
    .sort((a, b) => b.n - a.n);
}

export function trend(all: StatInquiry[], days: number, now = new Date()): { key: string; label: string; n: number }[] {
  const buckets: { key: string; label: string; n: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.push({ key: dayKey(d), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), n: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  all.forEach((r) => {
    const i = index.get(dayKey(r.created_at));
    if (i != null) buckets[i].n++;
  });
  return buckets;
}

export interface TechRow {
  id: string;
  name: string;
  active: number;
  completed: number;
  onTime: number | null;
  pending: number;
}

export function technicians(rows: StatInquiry[], profiles: { id: string; full_name: string | null; role: string | null }[]): TechRow[] {
  return profiles
    .filter((p) => p.role === 'employee')
    .map((t) => {
      const mine = rows.filter((r) => r.assigned_employee_id === t.id);
      const done = mine.filter(isDone);
      const onTime = done.filter((r) => r.assigned_at && new Date(r.updated_at || r.created_at) <= calculateSlaDeadline(r.assigned_at)).length;
      const active = mine.filter(isOpen);
      return {
        id: t.id,
        name: t.full_name || 'Employee',
        active: active.length,
        completed: done.length,
        onTime: done.length ? Math.round((onTime / done.length) * 100) : null,
        pending: active.filter((r) => !r.employee_update_at).length,
      };
    })
    .filter((r) => r.active || r.completed)
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 8);
}
