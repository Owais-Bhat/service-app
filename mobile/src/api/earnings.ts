import { dataGet } from './client';

export interface CashInquiry {
  id: string;
  ticket_no: string;
  full_name: string;
  bill_amount: string | null;
  bill_total: string | null;
  payment_status: string;
  payment_method: string | null;
  cash_collected_at: string | null;
  cash_submitted_at: string | null;
  created_at: string;
}

// Mirrors the server's own COALESCE(NULLIF(bill_total,0), bill_amount, 0)
// pattern (design spec §2).
export function cashAmount(row: CashInquiry): number {
  return Number(row.bill_total) || Number(row.bill_amount) || 0;
}

// The real source of "cash collected" data — see design spec §2:
// cash_collections/payments/bills are vestigial, never-created tables;
// billing actually lives on `inquiries`, scoped to this employee via
// assigned_employee_id.
export async function fetchCashInquiries(employeeId: string): Promise<CashInquiry[]> {
  const rows = await dataGet<CashInquiry[]>('inquiries', {
    select: 'id,ticket_no,full_name,bill_amount,bill_total,payment_status,payment_method,cash_collected_at,cash_submitted_at,created_at',
    eq: [`assigned_employee_id:${employeeId}`, `payment_status:paid`],
    order: 'cash_collected_at:desc',
  });
  // payment_method isn't a clean enum suitable for an exact server-side
  // filter — mirror the server's own case-insensitive "contains cash"
  // check client-side instead.
  return rows.filter((r) => (r.payment_method || '').toLowerCase().includes('cash') && r.cash_collected_at);
}
