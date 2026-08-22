import { dataGet, dataPost } from './client';

export interface NewInquiry {
  full_name: string;
  phone: string; // must include country code, e.g. +91XXXXXXXXXX
  location: string;
  service_item: string;
  description?: string | null;
  bill_no?: string | null;
  preferred_time?: string;
  customer_lat?: number | null;
  customer_lng?: number | null;
}

export interface Inquiry {
  id: string;
  ticket_no: string;
  full_name: string;
  phone: string;
  location: string;
  service_item: string;
  status: string;
  assignment_status: string;
  created_at: string;
}

function generateTicketNo(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  return `NE-${yy}${mm}${dd}-${rnd}`;
}

// Public, unauthenticated — matches server/index.cjs dataAuth's `inquiries`
// POST-without-Authorization-header branch (role: 'public').
export function submitInquiry(input: NewInquiry) {
  const ticket_no = generateTicketNo();
  return dataPost<Inquiry>('inquiries', {
    ...input,
    description: input.description ?? null,
    bill_no: input.bill_no ?? null,
    customer_lat: input.customer_lat ?? null,
    customer_lng: input.customer_lng ?? null,
    status: 'open',
    assignment_status: 'none',
    ticket_no,
  });
}

// Public GET only works when filtered by BOTH ticket_no and phone together
// (see dataAuth's inquiries GET branch) — this is the anti-enumeration gate,
// so a stranger can't page through other customers' tickets.
export function trackInquiry(ticketNo: string, phone: string) {
  return dataGet<Inquiry[]>('inquiries', {
    eq: [`ticket_no:${ticketNo}`, `phone:${phone}`],
  });
}
