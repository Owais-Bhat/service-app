import { dataGet } from './client';

export interface TicketInquiryInfo {
  ticket_no: string | null;
  service_item: string | null;
  full_name: string | null;
}

export interface TicketRow {
  id: string;
  assigned_to: string;
  status: string;
  title: string;
  category: string;
  created_at: string;
  inquiries?: TicketInquiryInfo[];
}

export async function fetchMyTickets(userId: string): Promise<TicketRow[]> {
  return dataGet<TicketRow[]>('tickets', {
    select: 'id,assigned_to,status,title,category,created_at,inquiries(ticket_no,service_item,full_name)',
    eq: [`assigned_to:${userId}`],
    order: 'created_at:desc',
  });
}
