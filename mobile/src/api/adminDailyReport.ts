import { api, dataGet } from './client';
import { fetchAttendanceLogs } from './adminOps';

// Anything clocked in after 10:00 counts as late — same cut-off the Attendance
// Report and the web page use.
const LATE_AFTER_MIN = 10 * 60;

export interface AttendanceLine {
  id: string;
  name: string;
  clockIn: string | null;
  late: boolean;
}

export interface PendingJob {
  ticket: string;
  customer: string;
  service: string;
  deadline: string | null;
  paused: boolean;
  overdue: boolean;
  // Installations have no SLA clock: their time is the booked visit.
  install: boolean;
  visitDate: string;
  visitTime: string;
}

export interface PendingGroup {
  id: string;
  name: string;
  jobs: PendingJob[];
}

export interface DailyReport {
  date: string;
  attendance: AttendanceLine[];
  present: number;
  late: number;
  pending: PendingGroup[];
  // false = the pending-jobs list could not be loaded.
  pendingKnown: boolean;
  pendingTotal: number;
  overdueTotal: number;
}

interface RawPending {
  employee_id: string;
  employee_name: string | null;
  ticket_no: string | null;
  full_name: string | null;
  service_item: string | null;
  sla_deadline: string | null;
  sla_paused: boolean | number;
  overdue: boolean | number;
  kind?: string;
  visit_date?: string | null;
  visit_time?: string | null;
}

export const localToday = () => new Date().toLocaleDateString('en-CA');

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

// What the admin posts to the staff group: who clocked in (and when) on the
// chosen day, and every job still open per employee with its SLA deadline.
export async function fetchDailyReport(date: string): Promise<DailyReport> {
  const [logs, people, jobs] = await Promise.all([
    fetchAttendanceLogs(),
    dataGet<{ id: string; full_name: string | null }[]>('profiles', { select: 'id,full_name', eq: 'role:employee' }),
    api.get<RawPending[]>('/admin/pending-jobs').then((r) => (Array.isArray(r) ? r : null)).catch(() => null),
  ]);

  const first = new Map<string, string>(); // employee id -> earliest clock-in that day
  logs
    .filter((r) => r.clock_in && day(r.date || r.clock_in) === date)
    .forEach((r) => {
      const cur = first.get(r.user_id);
      if (!cur || new Date(r.clock_in as string) < new Date(cur)) first.set(r.user_id, r.clock_in as string);
    });

  const attendance: AttendanceLine[] = people
    .map((p) => {
      const clockIn = first.get(p.id) ?? null;
      const t = clockIn ? new Date(clockIn) : null;
      return {
        id: p.id,
        name: p.full_name || 'Employee',
        clockIn,
        late: !!t && t.getHours() * 60 + t.getMinutes() > LATE_AFTER_MIN,
      };
    })
    // Clocked-in first (earliest first), then the ones who are not in.
    .sort((a, b) =>
      a.clockIn && b.clockIn
        ? new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime()
        : a.clockIn
          ? -1
          : b.clockIn
            ? 1
            : a.name.localeCompare(b.name),
    );

  const groups = new Map<string, PendingGroup>();
  (jobs ?? []).forEach((j) => {
    if (!groups.has(j.employee_id)) groups.set(j.employee_id, { id: j.employee_id, name: j.employee_name || 'Employee', jobs: [] });
    groups.get(j.employee_id)!.jobs.push({
      ticket: j.ticket_no || '—',
      customer: j.full_name || 'Customer',
      service: j.service_item || '',
      deadline: j.sla_deadline,
      paused: !!j.sla_paused,
      overdue: !!j.overdue,
      install: j.kind === 'installation',
      visitDate: j.visit_date || '',
      visitTime: j.visit_time || '',
    });
  });
  // Earliest due first: SLA deadline for service jobs, visit date for installations.
  const when = (j: PendingJob) =>
    j.install
      ? j.visitDate
        ? new Date(`${j.visitDate}T00:00:00`).getTime()
        : Infinity
      : j.deadline
        ? new Date(j.deadline).getTime()
        : Infinity;
  const pending = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  pending.forEach((g) => g.jobs.sort((a, b) => when(a) - when(b)));

  return {
    date,
    attendance,
    present: attendance.filter((a) => a.clockIn).length,
    late: attendance.filter((a) => a.late).length,
    pending,
    pendingKnown: jobs !== null,
    pendingTotal: pending.reduce((n, g) => n + g.jobs.length, 0),
    overdueTotal: pending.reduce((n, g) => n + g.jobs.filter((j) => j.overdue).length, 0),
  };
}

const clock = (v: string | Date) =>
  new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();

// Short form for the narrow pending-jobs table: "2:05PM".
const shortClock = (d: Date) =>
  d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, '').toUpperCase();

export const dayTime = (v: string | null): string => {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${shortClock(d)}`;
};

const visitDay = (v: string) =>
  v ? new Date(`${v}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

const clip = (v: string, n: number) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// WhatsApp does not draw tables, but a ``` block is monospaced, so padded
// columns line up exactly like one.
function monoTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  return ['```', line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line), '```'].join('\n');
}

const pretty = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// Message 1 — employee and clock-in time, nothing else.
export function buildAttendanceText(r: DailyReport): string {
  const head = `*Attendance – ${pretty(r.date)}*\n${r.present} of ${r.attendance.length} clocked in`;
  if (r.attendance.length === 0) return `${head}\n\nNo employees found.`;
  const rows = r.attendance.map((a) => [clip(a.name, 22), a.clockIn ? `${clock(a.clockIn)}${a.late ? ' (late)' : ''}` : 'Not in']);
  return `${head}\n\n${monoTable(['Employee', 'Clock-in'], rows)}`;
}

// "!" in front = the time has already passed. Installations have no SLA clock,
// so their cell is the booked visit, marked with "V".
export function slaCell(j: PendingJob): string {
  if (j.install) {
    if (!j.visitDate) return 'V —';
    return `${j.overdue ? '!' : ''}V ${visitDay(j.visitDate)}${j.visitTime ? ` ${clip(j.visitTime, 12)}` : ''}`;
  }
  if (!j.deadline) return '—';
  if (j.paused) return `${dayTime(j.deadline)} (paused)`;
  return `${j.overdue ? '!' : ''}${dayTime(j.deadline)}`;
}

// Message 2 — per employee: ticket number, the customer it is for, SLA time.
export function buildPendingText(r: DailyReport, now = new Date()): string {
  const head = `*Pending jobs – ${pretty(now.toLocaleDateString('en-CA'))}, ${clock(now)}*`;
  if (!r.pendingKnown) return `${head}\n\nPending jobs could not be loaded.`;
  if (r.pending.length === 0) return `${head}\n\nNo pending jobs.`;
  const parts = [`${head}\n${r.pendingTotal} pending${r.overdueTotal ? ` · ${r.overdueTotal} past SLA` : ''}`];
  r.pending.forEach((g) => {
    const rows = g.jobs.map((j) => [clip(j.ticket, 16), clip(j.customer, 14), slaCell(j)]);
    parts.push(`*${g.name}* – ${g.jobs.length} job${g.jobs.length === 1 ? '' : 's'}\n${monoTable(['Ticket', 'Customer', 'SLA'], rows)}`);
  });
  parts.push('! = time already passed · V = installation visit');
  return parts.join('\n\n');
}
