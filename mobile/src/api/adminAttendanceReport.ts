import { dataGet } from './client';

export interface AttendanceReportRow {
  id: string;
  name: string;
  worker: string;
  present: number;
  absent: number;
  late: number;
  missingEod: number;
  hours: number;
  avg: number;
  pct: number;
}

export interface AttendanceReport {
  from: string;
  to: string;
  workingDays: number;
  rows: AttendanceReportRow[];
}

// Anything clocked in after 10:00 counts as late — the same start the web uses.
const LATE_AFTER_MIN = 10 * 60;

function workingDays(from: string, to: string): number {
  let n = 0;
  const cur = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cur <= end) {
    if (cur.getDay() !== 0) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

const day = (v: unknown) => String(v ?? '').slice(0, 10);

// Per-employee attendance for a date range: present, absent (working days with
// no record), late, missing EOD, hours and attendance percentage.
export async function fetchAttendanceReport(from: string, to: string): Promise<AttendanceReport> {
  const [att, eod, people] = await Promise.all([
    dataGet<{ user_id: string; date: string | null; clock_in: string | null; clock_out: string | null }[]>('attendance', {
      select: 'user_id,date,clock_in,clock_out',
      order: 'date:desc',
      limit: '5000',
    }),
    dataGet<{ employee_id: string; date: string }[]>('eod_reports', { select: 'employee_id,date', limit: '5000' }),
    dataGet<{ id: string; full_name: string | null; worker_type: string | null }[]>('profiles', { select: 'id,full_name,worker_type', eq: 'role:employee' }),
  ]);
  const eodSet = new Set(eod.map((e) => `${e.employee_id}|${day(e.date)}`));
  const days = workingDays(from, to);

  const rows: AttendanceReportRow[] = people.map((p) => {
    const mine = att.filter((r) => r.user_id === p.id).map((r) => ({ ...r, d: day(r.date || r.clock_in) })).filter((r) => r.d >= from && r.d <= to);
    const worked = mine.filter((r) => r.clock_in);
    const hours = worked.reduce((s, r) => {
      if (!r.clock_in || !r.clock_out) return s;
      const ms = new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime();
      return s + (Number.isFinite(ms) && ms > 0 ? ms / 3600000 : 0);
    }, 0);
    const late = worked.filter((r) => {
      const t = new Date(r.clock_in as string);
      return t.getHours() * 60 + t.getMinutes() > LATE_AFTER_MIN;
    }).length;
    const missingEod = worked.filter((r) => !eodSet.has(`${p.id}|${r.d}`)).length;
    const distinct = new Set(mine.map((r) => r.d)).size;
    return {
      id: p.id,
      name: p.full_name || 'Employee',
      worker: p.worker_type === 'gig' ? 'Gig' : 'Fixed',
      present: worked.length,
      absent: Math.max(0, days - distinct),
      late,
      missingEod,
      hours,
      avg: worked.length ? hours / worked.length : 0,
      pct: days ? Math.round((worked.length / days) * 100) : 0,
    };
  });
  rows.sort((a, b) => b.present - a.present);
  return { from, to, workingDays: days, rows };
}
