import { dataGet, dataPatch } from './client';
import { createPaymentLink } from './payments';

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
  manualDiscount: number;
  couponDiscount: number;
  couponLabel?: string;
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
// saved always match. Discount = coupon (admin-configured, validated
// server-side) + manual employee discount, capped at the gross total —
// same combination rule web uses.
export function computeBill(input: BillInput): BillBreakdown {
  const servicesSubtotal = input.services.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
  const isNetworkingExperts = input.companyName.trim().toLowerCase().replace(/\s+/g, ' ') === 'networking experts';
  const platformFee = isNetworkingExperts ? 50 : 100;
  const transportFee = Math.round(Math.max(0, input.transportKm) * TRANSPORT_PER_KM);
  const base = servicesSubtotal + input.extraCost + platformFee + transportFee;
  const gst = Math.round(base * GST_RATE);
  const grossTotal = base + gst;
  const discount = Math.min(grossTotal, Math.max(0, input.couponDiscount) + Math.max(0, input.manualDiscount));
  return { servicesSubtotal, platformFee, transportFee, gst, discount, total: grossTotal - discount };
}

export type PaymentMethod = 'cash' | 'online';

export interface ResolveBill extends BillInput {
  extraReason?: string;
  discountReason?: string;
  couponCode?: string;
  paymentMethod: PaymentMethod;
}

function billPatch(bill: ResolveBill): Record<string, unknown> {
  const bd = computeBill(bill);
  const labels: string[] = [];
  if (bill.couponDiscount > 0) labels.push(bill.couponLabel || (bill.couponCode ? `Coupon ${bill.couponCode}` : 'Coupon'));
  if (bill.manualDiscount > 0) labels.push('Employee discount');
  return {
    company_name: bill.companyName.trim(),
    bill_amount: bd.servicesSubtotal + bill.extraCost,
    extra_cost: bill.extraCost,
    extra_cost_reason: bill.extraReason || null,
    transport_km: bill.transportKm,
    transport_fee: bd.transportFee,
    platform_fee: bd.platformFee,
    discount_amount: bd.discount,
    discount_label: labels.join(' + ') || null,
    discount_reason: bill.manualDiscount > 0 ? bill.discountReason || null : null,
    coupon_code: bill.couponCode || null,
    gst_amount: bd.gst,
    bill_total: bd.total,
    bill_generated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    payment_method: bill.paymentMethod,
  };
}

// Saves the full bill breakdown WITHOUT touching ticket/inquiry status —
// used before generating a payment link (the ticket stays in_progress until
// the customer actually pays) and folded into the final resolve write below.
async function saveBillFields(item: TaskItem, bill: ResolveBill): Promise<void> {
  if (!item.inquiryId) return;
  await dataPatch('inquiries', `id:${item.inquiryId}`, billPatch(bill));
}

// Generates a real Razorpay payment link (same endpoint web's "Generate"
// button hits) and persists it + the bill breakdown. Deliberately does NOT
// touch status — the ticket only resolves once the customer actually pays
// (see finalizeResolvedBill, called automatically by the poll in
// TaskStatusModal once payment confirms).
export async function generatePaymentLinkForBill(item: TaskItem, bill: ResolveBill): Promise<{ shortUrl: string; linkId: string }> {
  const bd = computeBill(bill);
  const { id, short_url } = await createPaymentLink({
    amount: bd.total,
    description: `Service: ${item.serviceItem || 'Service'}`,
    ticketNo: item.ticketNo || '',
    customerName: item.fullName,
    customerPhone: item.phone || '',
  });
  await saveBillFields(item, bill);
  if (item.inquiryId) {
    await dataPatch('inquiries', `id:${item.inquiryId}`, { payment_link: short_url, payment_link_id: id });
  }
  return { shortUrl: short_url, linkId: id };
}

// The actual "Resolved" write for a billed job. For cash, this IS the
// collection confirmation — no separate "mark collected" tap, matching how
// this app handles it (an employee standing there with cash in hand
// confirming a second time is just friction). For online, payment_status is
// left untouched here: /api/payments/check-status already set it 'paid'
// server-side by the time this is called (TaskStatusModal only allows this
// once its poll sees paid, exactly like web gates its Save button).
async function finalizeResolvedBill(item: TaskItem, bill: ResolveBill, detail: string): Promise<void> {
  const ops: Promise<unknown>[] = [];
  if (item.ticketId) ops.push(dataPatch('tickets', `id:${item.ticketId}`, { status: 'resolved' }));
  if (item.inquiryId) {
    const patch = billPatch(bill);
    patch.status = 'resolved';
    patch.employee_update_status = 'resolved';
    patch.employee_update_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (bill.services.length) {
      const summary = bill.services.map((s) => `${s.label} (₹${s.cost})`).join(', ');
      detail = `${detail}\n\nServices: ${summary}`;
    }
    patch.employee_update_detail = detail;
    if (bill.paymentMethod === 'cash') {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      patch.payment_status = 'paid';
      patch.cash_collected_at = now;
      patch.payment_received_at = now;
    }
    ops.push(dataPatch('inquiries', `id:${item.inquiryId}`, patch));
  }
  await Promise.all(ops);
}

export interface StatusUpdatePayload {
  status: StatusOption;
  detail: string;
  scheduledAt?: string;
  billNo?: string;
  bill?: ResolveBill;
}

export async function updateTaskStatus(item: TaskItem, payload: StatusUpdatePayload): Promise<void> {
  if (payload.status === 'resolved' && payload.bill) {
    await finalizeResolvedBill(item, payload.bill, payload.detail);
    return;
  }

  const resched = payload.status === 'reschedule';
  const savedStatus = resched ? 'in_progress' : payload.status;
  const ops: Promise<unknown>[] = [];

  if (item.ticketId) {
    ops.push(dataPatch('tickets', `id:${item.ticketId}`, { status: savedStatus }));
  }

  if (item.inquiryId) {
    const patch: Record<string, unknown> = {
      status: savedStatus,
      employee_update_status: payload.status,
      employee_update_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      employee_update_detail: payload.detail,
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
