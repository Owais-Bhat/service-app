import { api } from './client';

export interface CreatePaymentLinkInput {
  amount: number;
  description: string;
  ticketNo: string;
  customerName: string;
  customerPhone: string;
}

export interface PaymentLinkResult {
  id: string;
  short_url: string;
}

// Same Razorpay-backed endpoint the web app's "Generate" button hits —
// requires RAZORPAY_KEY_ID/SECRET configured server-side, already set up
// for web, so this just reuses it rather than standing up anything new.
export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
  return api.post<PaymentLinkResult>('/payments/create-link', {
    amount: input.amount,
    description: input.description,
    ticket_no: input.ticketNo,
    customer: { name: input.customerName, phone: input.customerPhone },
  });
}

export interface PaymentStatusResult {
  payment_status: string;
  payment_received_at: string | null;
}

export async function checkPaymentStatus(inquiryId: string): Promise<PaymentStatusResult> {
  return api.post<PaymentStatusResult>('/payments/check-status', { inquiry_id: inquiryId });
}
