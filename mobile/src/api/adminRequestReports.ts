import { dataGet } from './client';
import { calculateSlaDeadline } from './adminInquiries';

interface Inq {
  id: string;
  status: string | null;
  created_at: string;
  assigned_employee_id: string | null;
  assigned_at: string | null;
  scheduled_at: string | null;
  sla_pause_ms: number | string | null;
  sla_paused_at: string | null;
  service_item: string | null;
  bill_total: number | string | null;
  bill_amount: number | string | null;
}

interface Inst {
  id: string;
  status: string | null;
  preferred_date: string | null;
  created_at: string;
  assigned_employee_id: string | null;
  installation_type: string | null;
  completed_at: string | null;
}

export interface TechRow {
  id: string;
  name: string;
  total: number;
  open: number;
  done: number;
  overdue: number;
  billed: number;
  pending: number;
  upcoming: number;
}

export interface RequestReport {
  total: number;
  techs: TechRow[];
  top: { name: string; count: number; share: number }[];
}

const OPEN = new Set(['pending', 'open', 'assigned', 'in_progress', 'reopened', 'issue_not_resolved']);
const DONE = new Set(['resolved', 'closed', 'case_closed', 'foc']);
const day = (v: unknown) => String(v ?? '').slice(0, 10);

// The SLA deadline the web uses: a rescheduled visit time wins, otherwise 12
// working hours from assignment, pushed out by any time the device was away.
function deadlineOf(i: Inq): Date | null {
  if (!i.scheduled_at && !i.assigned_at) return null;
  const base = i.scheduled_at ? new Date(i.scheduled_at) : calculateSlaDeadline(i.assigned_at as string);
  let ms = base.getTime() + (Number(i.sla_pause_ms) || 0);
  if (i.sla_paused_at) {
    const at = new Date(i.sla_paused_at).getTime();
    if (!Number.isNaN(at)) ms += Math.max(0, Date.now() - at);
  }
  return new Date(ms);
}

const toTop = (counts: Map<string, number>, total: number) =>
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count, share: Math.round((count / (total || 1)) * 100) }));

async function employees() {
  const people = await dataGet<{ id: string; full_name: string | null }[]>('profiles', { select: 'id,full_name', eq: 'role:employee' });
  return new Map(people.map((p) => [p.id, p.full_name || 'Employee']));
}

export async function fetchServiceReport(from: string, to: string): Promise<RequestReport> {
  const [rows, names] = await Promise.all([
    dataGet<Inq[]>('inquiries', {
      select: 'id,status,created_at,assigned_employee_id,assigned_at,scheduled_at,sla_pause_ms,sla_paused_at,service_item,bill_total,bill_amount',
      order: 'created_at:desc',
      limit: '5000',
    }),
    employees(),
  ]);
  const inRange = rows.filter((r) => day(r.created_at) >= from && day(r.created_at) <= to);
  const map = new Map<string, TechRow>();
  const services = new Map<string, number>();
  inRange.forEach((r) => {
    const id = r.assigned_employee_id || 'unassigned';
    const t = map.get(id) || { id, name: r.assigned_employee_id ? names.get(id) || 'Employee' : 'Unassigned', total: 0, open: 0, done: 0, overdue: 0, billed: 0, pending: 0, upcoming: 0 };
    const st = String(r.status || '').toLowerCase();
    t.total++;
    if (OPEN.has(st)) t.open++;
    if (st === 'resolved' || st === 'case_closed') t.done++;
    const dl = deadlineOf(r);
    if (dl && !DONE.has(st) && Date.now() > dl.getTime()) t.overdue++;
    t.billed += Number(r.bill_total) || Number(r.bill_amount) || 0;
    map.set(id, t);
    const k = r.service_item || 'Other';
    services.set(k, (services.get(k) || 0) + 1);
  });
  return { total: inRange.length, techs: [...map.values()].sort((a, b) => b.total - a.total), top: toTop(services, inRange.length) };
}

export async function fetchInstallationReport(from: string, to: string): Promise<RequestReport> {
  const [rows, names] = await Promise.all([
    dataGet<Inst[]>('installations', {
      select: 'id,status,preferred_date,created_at,assigned_employee_id,installation_type,completed_at',
      order: 'preferred_date:desc',
      limit: '5000',
    }),
    employees(),
  ]);
  const today = new Date().toLocaleDateString('en-CA');
  const inRange = rows.filter((r) => {
    const d = day(r.preferred_date || r.created_at);
    return d >= from && d <= to;
  });
  const map = new Map<string, TechRow>();
  const types = new Map<string, number>();
  inRange.forEach((r) => {
    const id = r.assigned_employee_id || 'unassigned';
    const t = map.get(id) || { id, name: r.assigned_employee_id ? names.get(id) || 'Employee' : 'Unassigned', total: 0, open: 0, done: 0, overdue: 0, billed: 0, pending: 0, upcoming: 0 };
    t.total++;
    const finished = !!r.completed_at || ['completed', 'resolved', 'closed'].includes(String(r.status || '').toLowerCase());
    if (finished) t.done++;
    else if (day(r.preferred_date) > today) t.upcoming++;
    else t.pending++;
    map.set(id, t);
    const k = r.installation_type || 'Other';
    types.set(k, (types.get(k) || 0) + 1);
  });
  return { total: inRange.length, techs: [...map.values()].sort((a, b) => b.total - a.total), top: toTop(types, inRange.length) };
}
