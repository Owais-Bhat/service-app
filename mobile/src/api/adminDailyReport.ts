import { api } from './client';
import { fetchAttendanceLogs, fetchEodKeys } from './adminOps';
import { fetchCollections, paidDay } from './adminCollections';
import { fetchSalesDocs } from './adminBooks';
import { fetchReceipts } from './adminSales';
import { inr, shortTime } from '../utils/format';

// Same cut-off the Attendance Report uses.
const LATE_AFTER_MIN = 10 * 60;

// One job an employee worked on the day, from /admin/daily-jobs.
export interface DailyJob {
  ticket: string;
  customer: string;
  company: string;
  service: string;
  address: string;
  customerMap: string;
  billMap: string;
  status: string;
  start: string | null;
  end: string | null;
  note: string;
  amount: number;
  paid: boolean;
  method: string;
  secondary: string;
}

interface RawJob {
  ticket_no: string | null;
  full_name: string | null;
  company_name: string | null;
  service_item: string | null;
  location: string | null;
  status: string | null;
  customer_lat: number | string | null;
  customer_lng: number | string | null;
  employee_bill_lat: number | string | null;
  employee_bill_lng: number | string | null;
  assigned_employee_id: string | null;
  claimed_by_gig_worker_id: string | null;
  job_start_time: string | null;
  job_end_time: string | null;
  job_card_filled_at: string | null;
  employee_update_at: string | null;
  employee_update_status: string | null;
  employee_update_detail: string | null;
  work_done_note: string | null;
  bill_generated_at: string | null;
  bill_total: number | string | null;
  payment_status: string | null;
  payment_method: string | null;
  payment_received_at: string | null;
  employee_name: string | null;
  secondary_name: string | null;
}

export interface DailyStaff {
  id: string;
  name: string;
  worker: string;
  clockIn: string | null;
  clockOut: string | null;
  late: boolean;
  eod: boolean;
  jobs: number;
  cash: number;
  online: number;
  clockWhere: string;
  clockMap: string;
  jobList: DailyJob[];
}

export interface DailySaleLine {
  docNo: string;
  party: string;
  total: number;
}

export interface DailyReport {
  date: string;
  staff: DailyStaff[];
  notIn: string[];
  eodPending: string[];
  totals: { present: number; late: number; jobs: number; cash: number; online: number; collected: number };
  // false = the job list could not be loaded (the rest of the report stands).
  jobsKnown: boolean;
  // null = the books could not be read (the rest of the report still stands).
  sales: { count: number; total: number; lines: DailySaleLine[] } | null;
  receipts: { count: number; total: number } | null;
}

const num = (v: unknown) => Number(v) || 0;
// DATE columns can arrive as plain YYYY-MM-DD, SQL datetimes or full ISO
// timestamps; all are reduced to the local calendar day.
function day(v: unknown): string {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const sql = /^(\d{4}-\d{2}-\d{2}) \d{2}:/.exec(s);
  if (sql) return sql[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
}
const rupees = (paise: unknown) => num(paise) / 100;

export const localToday = () => new Date().toLocaleDateString('en-CA');

const mapUrl = (lat: unknown, lng: unknown) => (num(lat) && num(lng) ? `https://maps.google.com/?q=${num(lat)},${num(lng)}` : '');
const nice = (v: string | null | undefined) => String(v || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const cut = (v: string | null | undefined, n: number) => {
  const t = String(v || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function jobOf(j: RawJob): DailyJob {
  return {
    ticket: j.ticket_no || '',
    customer: j.full_name || 'Customer',
    company: j.company_name || '',
    service: j.service_item || '',
    address: String(j.location || '').trim(),
    customerMap: mapUrl(j.customer_lat, j.customer_lng),
    billMap: mapUrl(j.employee_bill_lat, j.employee_bill_lng),
    status: nice(j.employee_update_status || j.status),
    start: j.job_start_time || j.employee_update_at || j.job_card_filled_at || j.bill_generated_at || j.payment_received_at,
    end: j.job_end_time || null,
    note: cut(j.work_done_note || j.employee_update_detail, 160),
    amount: num(j.bill_total),
    paid: String(j.payment_status || '').toLowerCase() === 'paid',
    method: nice(j.payment_method),
    secondary: j.secondary_name || '',
  };
}

function isSunday(date: string): boolean {
  return new Date(`${date}T00:00:00`).getDay() === 0;
}

// Everything the admin wants to post in the staff WhatsApp group at the end of
// the day: who clocked in and when, what each person collected, what was sold.
export async function fetchDailyReport(date: string): Promise<DailyReport> {
  // The books are optional: a failure there must not sink the whole report.
  const optional = <T,>(p: Promise<T[]>) => p.then((r) => (Array.isArray(r) ? r : null)).catch(() => null);
  const [logs, eod, coll, docs, receipts, jobRows] = await Promise.all([
    fetchAttendanceLogs(),
    fetchEodKeys(),
    fetchCollections(),
    optional(fetchSalesDocs('invoice')),
    optional(fetchReceipts()),
    optional(api.get<RawJob[]>(`/admin/daily-jobs?date=${encodeURIComponent(date)}`)),
  ]);

  const eodSet = new Set(eod.map((e) => `${e.employee_id}|${day(e.date)}`));
  const byId = new Map<string, DailyStaff>();
  const person = (id: string, name: string | null | undefined, worker?: string | null): DailyStaff => {
    let s = byId.get(id);
    if (!s) {
      s = {
        id,
        name: name || 'Employee',
        worker: worker === 'gig' ? 'Gig' : 'Fixed',
        clockIn: null,
        clockOut: null,
        late: false,
        eod: eodSet.has(`${id}|${date}`),
        jobs: 0,
        cash: 0,
        online: 0,
        clockWhere: '',
        clockMap: '',
        jobList: [],
      };
      byId.set(id, s);
    }
    return s;
  };

  coll.employees.forEach((e) => person(e.id, e.full_name, e.worker_type));

  logs
    .filter((r) => r.clock_in && day(r.date || r.clock_in) === date)
    .forEach((r) => {
      const s = person(r.user_id, r.profiles?.full_name);
      // Several clock-ins in a day: the first one counts, the last clock-out.
      if (!s.clockIn || String(r.clock_in) < s.clockIn) {
        s.clockIn = r.clock_in;
        s.clockWhere = String(r.location || '').trim();
        s.clockMap = mapUrl(r.latitude, r.longitude);
      }
      if (r.clock_out && (!s.clockOut || r.clock_out > s.clockOut)) s.clockOut = r.clock_out;
    });
  byId.forEach((s) => {
    if (!s.clockIn) return;
    const t = new Date(s.clockIn);
    s.late = t.getHours() * 60 + t.getMinutes() > LATE_AFTER_MIN;
  });

  coll.paid
    .filter((r) => paidDay(r) === date)
    .forEach((r) => {
      const id = r.assigned_employee_id || r.claimed_by_gig_worker_id;
      if (!id) return;
      const s = person(id, null);
      const amount = num(r.bill_total);
      s.jobs += 1;
      if ((r.payment_method || '').toLowerCase() === 'cash') s.cash += amount;
      else s.online += amount;
    });

  (jobRows ?? []).forEach((j) => {
    const id = j.claimed_by_gig_worker_id || j.assigned_employee_id;
    if (id) person(id, j.employee_name).jobList.push(jobOf(j));
  });

  const staff = [...byId.values()].filter((s) => s.clockIn || s.jobs > 0 || s.jobList.length > 0);
  staff.sort((a, b) => (a.clockIn || '9').localeCompare(b.clockIn || '9') || a.name.localeCompare(b.name));

  const everyone = [...byId.values()];
  const present = staff.filter((s) => s.clockIn);
  const notIn = isSunday(date)
    ? []
    : coll.employees.filter((e) => !present.some((s) => s.id === e.id)).map((e) => e.full_name || 'Employee');
  const eodPending = present.filter((s) => !s.eod).map((s) => s.name);

  const invoices = (docs ?? []).filter((d) => day(d.doc_date) === date && !['draft', 'cancelled', 'void'].includes((d.status || '').toLowerCase()));
  const dayReceipts = (receipts ?? []).filter((r) => day(r.payment_date) === date);

  const cash = everyone.reduce((n, s) => n + s.cash, 0);
  const online = everyone.reduce((n, s) => n + s.online, 0);
  return {
    date,
    staff,
    notIn,
    eodPending,
    totals: {
      present: present.length,
      late: present.filter((s) => s.late).length,
      jobs: everyone.reduce((n, s) => n + s.jobs, 0),
      cash,
      online,
      collected: cash + online,
    },
    jobsKnown: jobRows !== null,
    sales: docs
      ? {
          count: invoices.length,
          total: invoices.reduce((n, d) => n + rupees(d.total_paise), 0),
          lines: invoices.map((d) => ({ docNo: d.doc_no, party: d.party_name || 'Customer', total: rupees(d.total_paise) })),
        }
      : null,
    receipts: receipts
      ? { count: dayReceipts.length, total: dayReceipts.reduce((n, r) => n + rupees(r.amount_paise), 0) }
      : null,
  };
}

const PRETTY = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// WhatsApp formatting: *bold*. Kept to short lines so it reads well in a group.
export function buildReportText(r: DailyReport, withJobs = true): string {
  const out: string[] = [];
  out.push(`*Daily Report – ${PRETTY(r.date)}*`);

  out.push('', `*Attendance* (${r.totals.present} clocked in${r.totals.late ? `, ${r.totals.late} late` : ''})`);
  const present = r.staff.filter((s) => s.clockIn);
  if (present.length === 0) out.push('Nobody clocked in');
  present.forEach((s) => {
    const out_ = s.clockOut ? `out ${shortTime(s.clockOut)}` : 'still on duty';
    out.push(`• ${s.name} – in ${shortTime(s.clockIn)}${s.late ? ' (late)' : ''}, ${out_}`);
    if (withJobs && (s.clockWhere || s.clockMap)) out.push(`   Clock-in place: ${[s.clockWhere, s.clockMap].filter(Boolean).join(' ')}`);
  });
  if (r.notIn.length) out.push(`Not clocked in: ${r.notIn.join(', ')}`);

  out.push('', `*Collections* – ${inr(r.totals.collected)}`);
  if (r.totals.collected > 0) out.push(`Cash ${inr(r.totals.cash)} · Online ${inr(r.totals.online)}`);
  const collectors = r.staff.filter((s) => s.jobs > 0);
  if (collectors.length === 0) out.push('No payments collected');
  collectors.forEach((s) => out.push(`• ${s.name} – ${inr(s.cash + s.online)} (${s.jobs} job${s.jobs === 1 ? '' : 's'})`));

  if (r.sales) {
    out.push('', `*Sales* – ${r.sales.count} invoice${r.sales.count === 1 ? '' : 's'}, ${inr(r.sales.total)}`);
    r.sales.lines.slice(0, 12).forEach((l) => out.push(`• ${l.docNo} · ${l.party} – ${inr(l.total)}`));
    if (r.sales.lines.length > 12) out.push(`…and ${r.sales.lines.length - 12} more`);
  }
  if (r.receipts && r.receipts.count > 0) {
    out.push(`Receipts recorded: ${r.receipts.count} · ${inr(r.receipts.total)}`);
  }
  if (withJobs) {
    const workers = r.staff.filter((s) => s.jobList.length > 0);
    if (workers.length) {
      out.push('', '*Jobs by employee*');
      workers.forEach((s) => {
        out.push('', `*${s.name}* – ${s.jobList.length} job${s.jobList.length === 1 ? '' : 's'}`);
        s.jobList.forEach((j, i) => {
          out.push(`${i + 1}. ${[j.ticket, j.customer].filter(Boolean).join(' · ')}${j.company ? ` (${j.company})` : ''}`);
          if (j.service) out.push(`   Service: ${j.service}`);
          if (j.address) out.push(`   Place: ${j.address}`);
          if (j.customerMap) out.push(`   Map: ${j.customerMap}`);
          const when = j.start ? `${shortTime(j.start)}${j.end ? ` – ${shortTime(j.end)}` : ''}` : '';
          out.push(`   ${[when, j.status].filter(Boolean).join(' · ')}`);
          if (j.billMap) out.push(`   Billed from: ${j.billMap}`);
          if (j.amount > 0) out.push(`   Bill: ${inr(j.amount)} (${j.paid ? `Paid${j.method ? ` · ${j.method}` : ''}` : 'Not paid yet'})`);
          if (j.secondary) out.push(`   With: ${j.secondary}`);
          if (j.note) out.push(`   Note: ${j.note}`);
        });
      });
    } else if (!r.jobsKnown) {
      out.push('', '_Job details could not be loaded_');
    }
  }
  if (r.eodPending.length) out.push('', `*EOD pending:* ${r.eodPending.join(', ')}`);
  return out.join('\n');
}
