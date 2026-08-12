import { dataGet } from './client';

export interface AttendanceRow {
  id: string;
  user_id: string;
  clock_in: string | null;
  clock_out: string | null;
  date: string;
  location: string | null;
  status: string;
}

export interface TicketRow {
  id: string;
  assigned_to: string;
  status: string;
  created_at: string;
}

const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, matches server/index.cjs

export async function fetchTodayAttendance(userId: string): Promise<AttendanceRow | null> {
  const rows = await dataGet<AttendanceRow[]>('attendance', {
    select: '*',
    eq: [`user_id:${userId}`, `date:${todayStr()}`],
  });
  return rows[0] ?? null;
}

export async function fetchMyTickets(userId: string): Promise<TicketRow[]> {
  return dataGet<TicketRow[]>('tickets', {
    select: '*',
    eq: [`assigned_to:${userId}`],
    order: 'created_at:desc',
  });
}
