import { dataGet, dataPatch } from './client';

interface RawInquiry {
  id: string;
  ticket_id: string | null;
  ticket_no: string | null;
  full_name: string;
  phone: string | null;
  location: string | null;
  service_item: string | null;
  preferred_time: string | null;
  status: string;
  assignment_status: string | null;
  employee_update_detail: string | null;
  reopened: number | null;
  scheduled_at: string | null;
  company_name: string | null;
  created_at: string;
}

interface RawTicket {
  id: string;
  status: string;
  title: string;
  description: string | null;
  created_at: string;
  inquiries?: RawInquiry[];
}

// Normalized shape both a ticket-linked job and a not-yet-ticketed accepted
// inquiry render identically as — mirrors web's jobCard/taskCard split but
// collapsed into one shape since mobile only needs one card renderer.
export interface TaskItem {
  key: string;
  ticketId: string | null;
  inquiryId: string | null;
  status: string;
  reopened: boolean;
  createdAt: string;
  fullName: string;
  phone: string | null;
  location: string | null;
  ticketNo: string | null;
  serviceItem: string | null;
  preferredTime: string | null;
  employeeUpdateDetail: string | null;
  companyName: string | null;
  scheduledAt: string | null;
}

function fromInquiry(inq: RawInquiry, ticketId: string | null): TaskItem {
  return {
    key: inq.id,
    ticketId,
    inquiryId: inq.id,
    status: inq.status,
    reopened: Number(inq.reopened) === 1,
    createdAt: inq.created_at,
    fullName: inq.full_name,
    phone: inq.phone,
    location: inq.location,
    ticketNo: inq.ticket_no,
    serviceItem: inq.service_item,
    preferredTime: inq.preferred_time,
    employeeUpdateDetail: inq.employee_update_detail,
    companyName: inq.company_name,
    scheduledAt: inq.scheduled_at,
  };
}

export async function fetchMyTasks(userId: string): Promise<{ pending: TaskItem[]; items: TaskItem[] }> {
  const [tickets, inquiries] = await Promise.all([
    dataGet<RawTicket[]>('tickets', {
      select: 'id,status,title,description,created_at,inquiries(*)',
      eq: [`assigned_to:${userId}`],
      order: 'created_at:desc',
    }),
    dataGet<RawInquiry[]>('inquiries', {
      eq: [`assigned_employee_id:${userId}`],
      order: 'created_at:desc',
    }),
  ]);

  const linkedInquiryIds = new Set<string>();
  const items: TaskItem[] = [];
  tickets.forEach((t) => {
    const inq = t.inquiries?.[0];
    if (inq) {
      linkedInquiryIds.add(inq.id);
      items.push(fromInquiry(inq, t.id));
    } else {
      items.push({
        key: t.id,
        ticketId: t.id,
        inquiryId: null,
        status: t.status,
        reopened: false,
        createdAt: t.created_at,
        fullName: t.title,
        phone: null,
        location: null,
        ticketNo: null,
        serviceItem: t.description,
        preferredTime: null,
        employeeUpdateDetail: null,
        companyName: null,
        scheduledAt: null,
      });
    }
  });

  const pending = inquiries
    .filter((i) => i.assignment_status === 'pending')
    .map((i) => fromInquiry(i, i.ticket_id));

  inquiries
    .filter((i) => i.assignment_status === 'accepted' && !linkedInquiryIds.has(i.id))
    .forEach((i) => items.push(fromInquiry(i, i.ticket_id)));

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { pending, items };
}

export async function acceptAssignment(item: TaskItem): Promise<void> {
  if (!item.inquiryId) return;
  const ops: Promise<unknown>[] = [
    dataPatch('inquiries', `id:${item.inquiryId}`, { assignment_status: 'accepted', status: 'in_progress' }),
  ];
  if (item.ticketId) ops.push(dataPatch('tickets', `id:${item.ticketId}`, { status: 'in_progress' }));
  await Promise.all(ops);
}

export async function declineAssignment(inquiryId: string, reason: string): Promise<void> {
  await dataPatch('inquiries', `id:${inquiryId}`, {
    assignment_status: 'declined',
    decline_reason: reason,
    status: 'open',
  });
}

export type StatusOption = 'in_progress' | 'reschedule' | 'issue_not_resolved' | 'case_closed' | 'foc';

export interface StatusUpdatePayload {
  status: StatusOption;
  detail: string;
  scheduledAt?: string;
  billNo?: string;
}

// Resolved (+ billing) is a separate feature not yet built on mobile — the
// options here are exactly what a reopened-free-rework (foc) or an ordinary
// in-progress ticket can reach without a bill.
export async function updateTaskStatus(item: TaskItem, payload: StatusUpdatePayload): Promise<void> {
  const resched = payload.status === 'reschedule';
  const savedStatus = resched ? 'in_progress' : payload.status;
  const ops: Promise<unknown>[] = [];

  if (item.ticketId) {
    ops.push(dataPatch('tickets', `id:${item.ticketId}`, { status: savedStatus }));
  }

  if (item.inquiryId) {
    const patch: Record<string, unknown> = {
      status: savedStatus,
      employee_update_detail: payload.detail,
      employee_update_status: payload.status,
      employee_update_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };
    if (resched && payload.scheduledAt) patch.scheduled_at = payload.scheduledAt;
    if (payload.status === 'foc' && payload.billNo) {
      patch.bill_no = payload.billNo;
      patch.bill_total = 0;
      patch.bill_amount = 0;
    }
    ops.push(dataPatch('inquiries', `id:${item.inquiryId}`, patch));
  }

  await Promise.all(ops);
}
