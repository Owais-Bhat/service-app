import { dataGet } from './client';

export interface TicketRow {
  id: string;
  assigned_to: string;
  status: string;
  title: string;
  category: string;
  created_at: string;
}

export async function fetchMyTickets(userId: string): Promise<TicketRow[]> {
  return dataGet<TicketRow[]>('tickets', {
    select: 'id,assigned_to,status,title,category,created_at',
    eq: [`assigned_to:${userId}`],
    order: 'created_at:desc',
  });
}
