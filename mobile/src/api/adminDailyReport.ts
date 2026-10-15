import { fetchAttendanceLogs, fetchEodKeys } from './adminOps';
import { fetchCollections, paidDay } from './adminCollections';
import { fetchSalesDocs } from './adminBooks';
import { fetchReceipts } from './adminSales';
import { inr, shortTime } from '../utils/format';

// Same cut-off the Attendance Report uses.
const LATE_AFTER_MIN = 10 * 60;

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

function isSunday(date: string): boolean {
  return new Date(`${date}T00:00:00`).getDay() === 0;
}

// Everything the admin wants to post in the staff WhatsApp group at the end of
// the day: who clocked in and when, what each person collected, what was sold.
export async function fetchDailyReport(date: string): Promise<DailyReport> {
  // The books are optional: a failure there must not sink the whole report.
  const optional = <T,>(p: Promise<T[]>) => p.then((r) => (Array.isArray(r) ? r : null)).catch(() => null);
  const [logs, eod, coll, docs, receipts] = await Promise.all([
    fetchAttendanceLogs(),
    fetchEodKeys(),
    fetchCollections(),
    optional(fetchSalesDocs('invoice')),
    optional(fetchReceipts()),
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
      if (!s.clockIn || String(r.clock_in) < s.clockIn) s.clockIn = r.clock_in;
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

  const staff = [...byId.values()].filter((s) => s.clockIn || s.jobs > 0);
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
export function buildReportText(r: DailyReport): string {
  const out: string[] = [];
  out.push(`*Daily Report – ${PRETTY(r.date)}*`);

  out.push('', `*Attendance* (${r.totals.present} clocked in${r.totals.late ? `, ${r.totals.late} late` : ''})`);
  const present = r.staff.filter((s) => s.clockIn);
  if (present.length === 0) out.push('Nobody clocked in');
  present.forEach((s) => {
    const out_ = s.clockOut ? `out ${shortTime(s.clockOut)}` : 'still on duty';
    out.push(`• ${s.name} – in ${shortTime(s.clockIn)}${s.late ? ' (late)' : ''}, ${out_}`);
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
  if (r.eodPending.length) out.push('', `*EOD pending:* ${r.eodPending.join(', ')}`);
  return out.join('\n');
}
