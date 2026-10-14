import { api, dataGet } from './client';

export interface AssistantVideo {
  id: string;
  title: string;
  url: string;
  embed: string;
  search: string;
}

export interface AssistantReply {
  answer: string;
  videos: AssistantVideo[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// The server keeps the system prompt and the video catalogue; the app only
// sends the running conversation.
export const askAssistant = (messages: ChatTurn[]) => api.post<AssistantReply>('/ai/assistant', { messages });

interface ReportInquiry {
  id: string;
  status: string | null;
  payment_status: string | null;
  bill_amount: number | string | null;
  bill_total: number | string | null;
  is_gig_job: number | null;
  gig_payout_amount: number | string | null;
  assigned_employee_id: string | null;
  payment_method: string | null;
  cash_collected_at: string | null;
  cash_submitted_at: string | null;
}

export interface EmployeeProgress {
  id: string;
  name: string;
  gig: boolean;
  assigned: number;
  resolved: number;
  issues: number;
  online: boolean;
}

export interface AiReport {
  paidRevenue: number;
  unpaid: number;
  cashPending: number;
  resolved: number;
  issues: number;
  active: number;
  gigJobs: number;
  gigRevenue: number;
  gigPayout: number;
  eodCount: number;
  online: number;
  employees: EmployeeProgress[];
}

const n = (v: unknown) => Number(v) || 0;

// Same arithmetic as the web AI Report, read from the same tables.
export async function fetchAiReport(): Promise<AiReport> {
  const today = new Date().toLocaleDateString('en-CA');
  const [rows, emps, attendance, eod] = await Promise.all([
    dataGet<ReportInquiry[]>('inquiries', {
      select: 'id,status,payment_status,bill_amount,bill_total,is_gig_job,gig_payout_amount,assigned_employee_id,payment_method,cash_collected_at,cash_submitted_at',
      limit: '5000',
    }),
    dataGet<{ id: string; full_name: string | null; worker_type: string | null }[]>('profiles', { select: 'id,full_name,worker_type', eq: 'role:employee' }),
    dataGet<{ user_id: string; clock_in: string | null; clock_out: string | null }[]>('attendance', { select: 'user_id,clock_in,clock_out,date', eq: `date:${today}` }),
    dataGet<{ id: string }[]>('eod_reports', { select: 'id', limit: '5000' }),
  ]);
  const total = (r: ReportInquiry) => n(r.bill_total || r.bill_amount);
  const done = (s: string | null) => s === 'resolved' || s === 'closed';
  const gig = rows.filter((r) => n(r.is_gig_job) === 1);
  const employees = emps
    .map((e) => {
      const mine = rows.filter((r) => r.assigned_employee_id === e.id);
      const att = attendance.find((a) => a.user_id === e.id);
      return {
        id: e.id,
        name: e.full_name || 'Employee',
        gig: e.worker_type === 'gig',
        assigned: mine.length,
        resolved: mine.filter((r) => done(r.status)).length,
        issues: mine.filter((r) => r.status === 'issue_not_resolved').length,
        online: !!(att?.clock_in && !att?.clock_out),
      };
    })
    .sort((a, b) => b.resolved - a.resolved || b.assigned - a.assigned);
  return {
    paidRevenue: rows.filter((r) => r.payment_status === 'paid').reduce((s, r) => s + total(r), 0),
    unpaid: rows.filter((r) => n(r.bill_amount) > 0 && r.payment_status !== 'paid').reduce((s, r) => s + total(r), 0),
    // Cash a technician has collected but not handed in.
    cashPending: rows
      .filter((r) => (r.payment_method || '').toLowerCase().includes('cash') && r.cash_collected_at && !r.cash_submitted_at)
      .reduce((s, r) => s + total(r), 0),
    resolved: rows.filter((r) => done(r.status)).length,
    issues: rows.filter((r) => r.status === 'issue_not_resolved').length,
    active: rows.filter((r) => !['resolved', 'closed', 'issue_not_resolved'].includes(r.status || '')).length,
    gigJobs: gig.length,
    gigRevenue: gig.filter((r) => r.payment_status === 'paid').reduce((s, r) => s + n(r.bill_total), 0),
    gigPayout: gig.reduce((s, r) => s + n(r.gig_payout_amount), 0),
    eodCount: eod.length,
    online: employees.filter((e) => e.online).length,
    employees,
  };
}
