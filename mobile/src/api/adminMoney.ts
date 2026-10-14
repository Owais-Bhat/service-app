import { dataDelete, dataGet, dataPatch, dataPost } from './client';

// Every money screen reads the same table the web does: a billed job is an
// `inquiries` row with a bill_total. One typed shape, many views.
export interface BilledJob {
  id: string;
  ticket_no: string | null;
  full_name: string | null;
  phone: string | null;
  service_item: string | null;
  status: string | null;
  assigned_employee_id: string | null;
  claimed_by_gig_worker_id: string | null;
  is_gig_job: number | null;
  bill_amount: number | string | null;
  bill_total: number | string | null;
  bill_no: string | null;
  bill_pdf_url: string | null;
  bill_generated_at: string | null;
  payment_status: string | null;
  payment_method: string | null;
  payment_link: string | null;
  payment_received_at: string | null;
  cash_collected_at: string | null;
  cash_submitted_at: string | null;
  gig_payout_amount: number | string | null;
  gig_payout_status: string | null;
  discount_amount: number | string | null;
  discount_label: string | null;
  discount_reason: string | null;
  discount_preset_id: string | null;
  created_at: string;
}

const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export function fetchBilledJobs(): Promise<BilledJob[]> {
  return dataGet<BilledJob[]>('inquiries', { select: '*', order: 'bill_generated_at:desc', limit: '1500' }).then((rows) =>
    rows.filter((r) => Number(r.bill_total) > 0 || Number(r.bill_amount) > 0),
  );
}

export function fetchGigJobs(): Promise<BilledJob[]> {
  return dataGet<BilledJob[]>('inquiries', { select: '*', eq: 'is_gig_job:1', order: 'bill_generated_at:desc', limit: '800' }).then((rows) =>
    rows.filter((r) => Number(r.bill_total) > 0),
  );
}

export function fetchCashJobs(): Promise<BilledJob[]> {
  return dataGet<BilledJob[]>('inquiries', {
    select: '*',
    eq: ['payment_method:cash', 'payment_status:paid'],
    order: 'cash_collected_at:desc',
    limit: '1500',
  });
}

// Same rule the web "Mark Paid" button applies: a manual mark records a cash
// collection unless a method is already there, and an open job is resolved.
export function markJobPaid(job: BilledJob): Promise<unknown> {
  const closed = ['resolved', 'closed', 'issue_not_resolved'].includes(job.status || '');
  return dataPatch('inquiries', `id:${job.id}`, {
    payment_status: 'paid',
    payment_method: job.payment_method || 'cash',
    payment_received_at: job.payment_received_at || sqlNow(),
    ...(closed ? {} : { status: 'resolved' }),
  });
}

export async function recordCashSubmission(jobIds: string[], adminId: string | null): Promise<void> {
  const at = sqlNow();
  for (const id of jobIds) {
    await dataPatch('inquiries', `id:${id}`, { cash_submitted_at: at, cash_submitted_by: adminId });
  }
}

export function markGigPayoutPaid(id: string): Promise<unknown> {
  return dataPatch('inquiries', `id:${id}`, { gig_payout_status: 'paid', gig_payout_paid_at: sqlNow() });
}

export interface PersonRow {
  id: string;
  full_name: string | null;
  phone?: string | null;
  salary?: number | string | null;
  role?: string | null;
}

export function fetchPeople(role?: string): Promise<PersonRow[]> {
  return dataGet<PersonRow[]>('profiles', {
    select: 'id,full_name,phone,salary,role',
    ...(role ? { eq: `role:${role}` } : {}),
    order: 'full_name:asc',
  });
}

export interface SalaryAttendance {
  user_id: string;
  date: string | null;
}

export interface SalaryLeave {
  employee_id: string;
  status: string;
  start_date: string;
  end_date: string;
}

export function fetchMonthAttendance(): Promise<SalaryAttendance[]> {
  return dataGet<SalaryAttendance[]>('attendance', { select: 'user_id,date', order: 'date:desc', limit: '6000' });
}

export function fetchLeaves(): Promise<SalaryLeave[]> {
  return dataGet<SalaryLeave[]>('leave_requests', { select: 'employee_id,status,start_date,end_date', order: 'created_at:desc', limit: '2000' });
}

// ── Coupons ───────────────────────────────────────────────────
export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number | string;
  max_discount: number | string | null;
  min_amount: number | string | null;
  usage_limit: number | null;
  used_count: number | null;
  expires_at: string | null;
  description: string | null;
  active: number;
}

export type CouponInput = Omit<Coupon, 'id' | 'used_count'>;

export function fetchCoupons(): Promise<Coupon[]> {
  return dataGet<Coupon[]>('coupons', { select: '*', order: 'created_at:desc' });
}

export function createCoupon(body: CouponInput): Promise<unknown> {
  return dataPost('coupons', body);
}

export function updateCoupon(id: string, body: Partial<CouponInput>): Promise<unknown> {
  return dataPatch('coupons', `id:${id}`, body);
}

export function deleteCoupon(id: string): Promise<unknown> {
  return dataDelete('coupons', `id:${id}`);
}
