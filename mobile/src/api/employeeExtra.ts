import { api, dataDelete, dataGet, dataPost, resolveUploadUrl } from './client';

// ── Calendar ──────────────────────────────────────────────────
export interface CalendarJob {
  id: string;
  full_name: string;
  ticket_no: string | null;
  installation_type: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string | null;
  address: string | null;
  assigned_employee_id: string | null;
}

// The data layer scopes installations to the caller for employees and returns
// everything for admins, so one call serves both portals.
export function fetchCalendarJobs(): Promise<CalendarJob[]> {
  return dataGet<CalendarJob[]>('installations', {
    select: 'id,full_name,ticket_no,installation_type,preferred_date,preferred_time,status,address,assigned_employee_id',
    order: 'preferred_date:asc',
    limit: '3000',
  });
}

// ── Walk-in request (employee registers a customer and accepts it) ──
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function ticketNo(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `NE-${yy}${mm}${dd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export const PREFERRED_TIMES = [
  'As soon as possible',
  'Morning (10 AM - 1 PM)',
  'Afternoon (1 PM - 4 PM)',
  'Evening (4 PM - 6 PM)',
  'Tomorrow Morning',
  'Flexible',
];

export interface WalkInInput {
  employeeId: string;
  name: string;
  phone10: string;
  company: string;
  serviceItem: string;
  location: string;
  description: string;
  preferredTime: string;
  lat: number | null;
  lng: number | null;
}

// Same three writes as the web "Register & Accept" button: a ticket assigned to
// the employee, the linked inquiry already accepted, and an audit comment. If
// the inquiry fails the ticket is removed so nothing half-created is left.
export async function registerWalkInRequest(input: WalkInInput): Promise<string> {
  const ticketId = uuid();
  const inquiryId = uuid();
  const no = ticketNo();
  const phone = `+91${input.phone10}`;

  await dataPost('tickets', {
    id: ticketId,
    title: `Service: ${input.serviceItem.slice(0, 30)}`,
    description: input.description || `Registered by employee: ${input.serviceItem}`,
    assigned_to: input.employeeId,
    client_id: null,
    status: 'assigned',
    category: 'service_request',
  });

  try {
    await dataPost('inquiries', {
      id: inquiryId,
      full_name: input.name,
      phone,
      location: input.location,
      customer_lat: input.lat,
      customer_lng: input.lng,
      service_item: input.serviceItem,
      description: input.description || null,
      ticket_no: no,
      preferred_time: input.preferredTime,
      assigned_employee_id: input.employeeId,
      ticket_id: ticketId,
      status: 'open',
      assignment_status: 'accepted',
      company_name: input.company,
    });
  } catch (e) {
    await dataDelete('tickets', `id:${ticketId}`).catch(() => {});
    throw e;
  }

  await dataPost('ticket_comments', {
    ticket_id: ticketId,
    user_id: input.employeeId,
    content: '[Status: Assigned] Request self-registered and accepted by employee.',
  }).catch(() => {});

  return no;
}

// ── Materials used on a job ───────────────────────────────────
export interface JobSearchRow {
  job_type: 'inquiry' | 'installation';
  job_id: string;
  ticket_no: string | null;
  full_name: string;
  phone: string | null;
  what: string | null;
  status: string | null;
  employee_name: string | null;
  assigned_employee_id: string | null;
}

export function searchJobs(q: string): Promise<JobSearchRow[]> {
  return api.get<JobSearchRow[]>(`/jobs/search?q=${encodeURIComponent(q)}`);
}

export interface StockPlace {
  id: string;
  name: string;
  kind: string | null;
  employee_id: string | null;
  is_default: number;
  owned?: boolean | number;
}

export function fetchStockPlaces(): Promise<StockPlace[]> {
  return api.get<StockPlace[]>('/stock/locations');
}

export interface HeldItem {
  id: string;
  held_qty: number | string;
}

export function fetchHeldItems(locationId: string): Promise<HeldItem[]> {
  return api.get<HeldItem[]>(`/stock/locations/${encodeURIComponent(locationId)}/items`);
}

export interface MaterialLine {
  item_id: string;
  description: string;
  quantity: number;
  unit: string | null;
  sell_rate?: number;
}

export interface MaterialsInput {
  job_type: string;
  job_id: string;
  location_id: string;
  employee_id?: string;
  kind: 'used' | 'returned';
  note?: string;
  customer_approved: boolean;
  lines: MaterialLine[];
}

export function submitMaterials(body: MaterialsInput): Promise<{ issue: { id: string; status: string } }> {
  return api.post('/jobs/materials', body);
}

// ── Employee popup ad ─────────────────────────────────────────
export interface PopupAdRow {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  device_target: string | null;
  placement: string | null;
  active: number;
  starts_at: string | null;
  expires_at: string | null;
  position: number | null;
}

// First live image popup for the employee portal, or null. Mirrors the web
// mountEmployeePopupAds(): placement popup_employee, not desktop-only, inside
// its start/expiry window.
export async function fetchEmployeePopupAd(): Promise<PopupAdRow | null> {
  const rows = await dataGet<PopupAdRow[]>('ads', { select: '*', eq: ['placement:popup_employee', 'active:1'], order: 'position:asc' });
  const now = Date.now();
  const live = rows.find((a) => {
    if (!a.url || a.kind === 'video') return false;
    if ((a.device_target || 'both') === 'desktop') return false;
    if (a.starts_at && new Date(a.starts_at).getTime() > now) return false;
    if (a.expires_at && new Date(a.expires_at).getTime() <= now) return false;
    return true;
  });
  return live ? { ...live, url: resolveUploadUrl(live.url) } : null;
}
