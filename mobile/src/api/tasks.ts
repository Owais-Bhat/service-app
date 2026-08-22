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
  device_status: string | null;
  device_type: string | null;
  device_serial_no: string | null;
  customer_lat: number | string | null;
  customer_lng: number | string | null;
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
  deviceStatus: string | null;
  deviceType: string | null;
  deviceSerialNo: string | null;
  customerLat: number | null;
  customerLng: number | null;
}

function fromTicketOnly(t: RawTicket): TaskItem {
  return {
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
    deviceStatus: null,
    deviceType: null,
    deviceSerialNo: null,
    customerLat: null,
    customerLng: null,
  };
}

function ticketToTaskItem(t: RawTicket): TaskItem {
  const inq = t.inquiries?.[0];
  return inq ? fromInquiry(inq, t.id) : fromTicketOnly(t);
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
    deviceStatus: inq.device_status,
    deviceType: inq.device_type,
    deviceSerialNo: inq.device_serial_no,
    customerLat: inq.customer_lat != null ? Number(inq.customer_lat) : null,
    customerLng: inq.customer_lng != null ? Number(inq.customer_lng) : null,
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
    if (t.inquiries?.[0]) linkedInquiryIds.add(t.inquiries[0].id);
    items.push(ticketToTaskItem(t));
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

// Single-item fetch for TaskDetailScreen (Today's Route "Open" deep link) —
// same normalized shape as the list, so it reuses TaskStatusModal unchanged.
export async function fetchTaskByTicketId(ticketId: string): Promise<TaskItem | null> {
  const tickets = await dataGet<RawTicket[]>('tickets', {
    select: 'id,status,title,description,created_at,inquiries(*)',
    eq: [`id:${ticketId}`],
  });
  return tickets[0] ? ticketToTaskItem(tickets[0]) : null;
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

// Device type/serial live directly on the inquiry (shown on the bill later),
// separate from the device_taken_logs/follow_up/return history in
// api/deviceTracking.ts — saved together when marking a device taken.
export async function saveDeviceInfo(inquiryId: string, deviceType: string, deviceSerialNo: string): Promise<void> {
  await dataPatch('inquiries', `id:${inquiryId}`, {
    device_type: deviceType.trim() || null,
    device_serial_no: deviceSerialNo.trim() || null,
  });
}

export type StatusOption = 'in_progress' | 'reschedule' | 'issue_not_resolved' | 'case_closed' | 'foc' | 'resolved';

export interface BillService {
  id: string;
  label: string;
  cost: number;
}

export interface BillInput {
  companyName: string;
  services: BillService[];
  extraCost: number;
  transportKm: number;
  discountAmount: number;
}

const EARTH_RADIUS_KM = 6371;
const ROAD_FACTOR = 1.3; // roads aren't straight lines — approximates real driving distance

// Same haversine + road-factor approximation web uses for its "Auto km" button.
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a)) * ROAD_FACTOR;
}

export interface BillBreakdown {
  servicesSubtotal: number;
  platformFee: number;
  transportFee: number;
  gst: number;
  discount: number;
  total: number;
}

const TRANSPORT_PER_KM = 5;
const GST_RATE = 0.18;

// Same math as web's calcTotal() (src/pages/employee.js) — kept in one place
// so the live breakdown shown in TaskStatusModal and the values actually
// saved by updateTaskStatus can never drift apart.
export function computeBill(input: BillInput): BillBreakdown {
  const servicesSubtotal = input.services.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
  const isNetworkingExperts = input.companyName.trim().toLowerCase().replace(/\s+/g, ' ') === 'networking experts';
  const platformFee = isNetworkingExperts ? 50 : 100;
  const transportFee = Math.round(Math.max(0, input.transportKm) * TRANSPORT_PER_KM);
  const base = servicesSubtotal + input.extraCost + platformFee + transportFee;
  const gst = Math.round(base * GST_RATE);
  const grossTotal = base + gst;
  const discount = Math.min(grossTotal, Math.max(0, input.discountAmount));
  return { servicesSubtotal, platformFee, transportFee, gst, discount, total: grossTotal - discount };
}

export type PaymentMethod = 'cash' | 'online';

export interface StatusUpdatePayload {
  status: StatusOption;
  detail: string;
  scheduledAt?: string;
  billNo?: string;
  bill?: BillInput & {
    extraReason?: string;
    discountReason?: string;
    paymentMethod: PaymentMethod;
    cashCollected: boolean;
  };
}

// Resolved's bill covers services + extra + transport + platform fee + 18%
// GST, minus a manual discount — matches web's math (computeBill above).
// It intentionally skips coupon codes and inquiry_services linking (the
// generic mobile data API can't delete/relink that join table yet) — the
// chosen services are still recorded, just as a readable summary appended
// to the employee update note rather than structured rows.
export async function updateTaskStatus(item: TaskItem, payload: StatusUpdatePayload): Promise<void> {
  const resched = payload.status === 'reschedule';
  const savedStatus = resched ? 'in_progress' : payload.status;
  const ops: Promise<unknown>[] = [];

  if (item.ticketId) {
    ops.push(dataPatch('tickets', `id:${item.ticketId}`, { status: savedStatus }));
  }

  if (item.inquiryId) {
    let detail = payload.detail;
    const patch: Record<string, unknown> = {
      status: savedStatus,
      employee_update_status: payload.status,
      employee_update_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };
    if (resched && payload.scheduledAt) patch.scheduled_at = payload.scheduledAt;
    if (payload.status === 'foc' && payload.billNo) {
      patch.bill_no = payload.billNo;
      patch.bill_total = 0;
      patch.bill_amount = 0;
    }
    if (payload.status === 'resolved' && payload.bill) {
      const b = payload.bill;
      const bd = computeBill(b);
      patch.company_name = b.companyName.trim();
      patch.bill_amount = bd.servicesSubtotal + b.extraCost;
      patch.extra_cost = b.extraCost;
      patch.extra_cost_reason = b.extraReason || null;
      patch.transport_km = b.transportKm;
      patch.transport_fee = bd.transportFee;
      patch.platform_fee = bd.platformFee;
      patch.discount_amount = bd.discount;
      patch.discount_label = bd.discount > 0 ? 'Employee discount' : null;
      patch.discount_reason = bd.discount > 0 ? b.discountReason || null : null;
      patch.gst_amount = bd.gst;
      patch.bill_total = bd.total;
      patch.bill_generated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      patch.payment_method = b.paymentMethod;
      if (b.paymentMethod === 'cash' && b.cashCollected) {
        patch.payment_status = 'paid';
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        patch.cash_collected_at = now;
        patch.payment_received_at = now;
      } else {
        patch.payment_status = 'unpaid';
      }
      if (b.services.length) {
        const summary = b.services.map((s) => `${s.label} (₹${s.cost})`).join(', ');
        detail = `${detail}\n\nServices: ${summary}`;
      }
    }
    patch.employee_update_detail = detail;
    ops.push(dataPatch('inquiries', `id:${item.inquiryId}`, patch));
  }

  await Promise.all(ops);
}
