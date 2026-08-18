import { dataGet, dataPatch } from './client';

export interface TicketContact {
  full_name: string | null;
  phone: string | null;
  location: string | null;
}

export interface TicketDetail {
  id: string;
  assigned_to: string;
  client_id: string;
  status: string;
  title: string;
  description: string | null;
  category: string;
  priority: string | null;
  created_at: string;
  inquiries?: TicketContact[];
}

// Separate from employee.ts (which owns the employee-scoped list query)
// because ticket detail/update isn't employee-exclusive — Phase 4's admin
// ticket screens will reuse this module.
export async function fetchTicketDetail(ticketId: string): Promise<TicketDetail | null> {
  const rows = await dataGet<TicketDetail[]>('tickets', {
    select: '*,inquiries(full_name,phone,location)',
    eq: [`id:${ticketId}`],
  });
  return rows[0] ?? null;
}

export async function updateTicketStatus(ticketId: string, status: string): Promise<void> {
  await dataPatch('tickets', `id:${ticketId}`, { status });
}
