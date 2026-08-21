import { dataPost } from './client';

export interface ComplaintInput {
  ticket_no: string;
  phone: string;
  complaint_text: string;
}

export interface Complaint {
  id: string;
  ticket_no: string;
  phone: string;
  complaint_text: string;
  status: string;
  created_at: string;
}

// Public, unauthenticated — server verifies ticket_no+phone match an
// existing inquiry before inserting (server/index.cjs's dataAuth
// `complaints` POST-without-Authorization branch).
export function submitComplaint(input: ComplaintInput): Promise<Complaint> {
  return dataPost<Complaint>('complaints', input);
}
