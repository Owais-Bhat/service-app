import { dataGet } from './client';
import { BilledJob } from './adminMoney';

export interface CollectionEmployee {
  id: string;
  full_name: string | null;
  phone: string | null;
  worker_type: string | null;
}

export interface CollectionRow extends BilledJob {
  gst_amount: number | string | null;
  platform_fee: number | string | null;
  transport_fee: number | string | null;
  extra_cost: number | string | null;
  extra_cost_reason: string | null;
}

export interface CollectionData {
  paid: CollectionRow[];
  gig: CollectionRow[];
  employees: CollectionEmployee[];
}

const num = (v: unknown) => Number(v) || 0;

export async function fetchCollections(): Promise<CollectionData> {
  const [paid, gig, employees] = await Promise.all([
    dataGet<CollectionRow[]>('inquiries', { select: '*', eq: 'payment_status:paid', order: 'payment_received_at:desc', limit: '2000' }),
    dataGet<CollectionRow[]>('inquiries', { select: '*', eq: 'is_gig_job:1', limit: '1000' }),
    dataGet<CollectionEmployee[]>('profiles', { select: 'id,full_name,phone,worker_type', eq: 'role:employee' }),
  ]);
  return {
    paid: paid.filter((r) => num(r.bill_total) > 0),
    gig: gig.filter((r) => num(r.bill_total) > 0),
    employees,
  };
}

export interface BillLine {
  name: string;
  cost: number;
}

// The service lines on a ticket's bill: the links in inquiry_services, priced
// from service_pricing — same as the web's bill-detail modal.
export async function fetchBillLines(inquiryId: string): Promise<BillLine[]> {
  const [links, pricing] = await Promise.all([
    dataGet<{ service_id: string }[]>('inquiry_services', { select: '*', eq: `inquiry_id:${inquiryId}` }),
    dataGet<{ id: string; name: string; cost: number | string }[]>('service_pricing', { select: 'id,name,cost' }),
  ]);
  const byId = new Map(pricing.map((p) => [String(p.id), { name: p.name, cost: num(p.cost) }]));
  return links.map((l) => byId.get(String(l.service_id))).filter((x): x is BillLine => !!x);
}

// Money model per ticket: bill_total already includes platform fee + GST, so
// each component is backed out of the stored figures and always sums to net.
export function amounts(row: CollectionRow) {
  const net = num(row.bill_total);
  const gst = num(row.gst_amount);
  const platform = num(row.platform_fee);
  const travel = num(row.transport_fee);
  const discount = num(row.discount_amount);
  const extra = num(row.extra_cost);
  const taxable = Math.max(0, net - gst);
  const servicesSubtotal = Math.max(0, taxable - extra - platform - travel + discount);
  const service = servicesSubtotal + extra;
  const gstRate = taxable > 0 ? Math.round((gst / taxable) * 100) : 0;
  return { net, gst, gstRate, platform, travel, discount, extra, taxable, service };
}

export function paidDay(row: CollectionRow): string {
  const raw = row.payment_received_at || row.cash_collected_at || row.bill_generated_at || row.created_at || '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw).trim());
  if (m) return m[1];
  const d = new Date(String(raw).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
