import { api } from './client';

export interface BillPdfCustomer {
  name: string;
  phone: string;
  location: string;
  company: string;
  device_type: string;
  device_serial: string;
  service_item: string;
  ticket_no: string;
}

export interface BillPdfService {
  name: string;
  cost: number;
}

// Exact shape server's buildInvoicePdfBuffer() (server/index.cjs) and web's
// buildCurrentBillData() (src/pages/employee.js) both use — kept as one flat
// object so the same server-rendered PDF renderer works unmodified for mobile.
export interface BillPdfData {
  customer: BillPdfCustomer;
  technician: string;
  services: BillPdfService[];
  servicesSubtotal: number;
  extra: number;
  extraReason: string;
  platform: number;
  km: number;
  transport: number;
  taxable: number;
  gst: number;
  discount: number;
  discountLabel: string;
  discountReason: string;
  total: number;
  paymentLink: string;
  paymentStatus: string;
}

export async function generateBillPdf(billData: BillPdfData, inquiryId: string | null, filename?: string): Promise<string> {
  const res = await api.post<{ url: string }>('/bills/generate', {
    billData,
    inquiry_id: inquiryId,
    filename: filename || `Invoice-${billData.customer.ticket_no || 'service'}.pdf`,
  });
  return res.url;
}

// Same message format as web's billShortCaption() — bold WhatsApp markdown,
// itemized services, then the PDF link so the customer gets the full tax
// invoice, not just this text summary.
export function billWhatsAppCaption(businessName: string, data: BillPdfData, pdfUrl: string): string {
  const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
  const lines: string[] = [
    `Hi ${data.customer.name || 'Customer'}!`,
    `Your service invoice from *${businessName}* is ready.`,
    `Ticket: *${data.customer.ticket_no || '-'}*`,
    `Device: *${data.customer.device_type || 'General Service'}*`,
    '',
    '*Bill Breakdown:*',
  ];
  if (data.services.length) {
    data.services.forEach((s, i) => lines.push(`${i + 1}. ${s.name}: *${inr(s.cost)}*`));
  } else {
    lines.push(`- Services Subtotal: *${inr(data.servicesSubtotal)}*`);
  }
  if (data.extra > 0) {
    lines.push(`- Additional Charges: *${inr(data.extra)}*${data.extraReason ? ` (${data.extraReason})` : ''}`);
  }
  lines.push(`- Platform Fee: *${inr(data.platform)}*`);
  if (data.km > 0) {
    lines.push(`- Transport (${data.km} km): *${inr(data.transport)}*`);
  }
  if (data.discount > 0) {
    lines.push(`- Discount: *-${inr(data.discount)}*${data.discountLabel ? ` (${data.discountLabel})` : ''}`);
  }
  lines.push(
    `- GST (18%): *${inr(data.gst)}*`,
    '------------------------------',
    `*Total Payable: ${inr(data.total)}*`,
    '------------------------------',
    `Payment Status: *${String(data.paymentStatus || 'unpaid').toUpperCase()}*`,
  );
  lines.push('', 'View / download your invoice (PDF):', pdfUrl);
  if (data.paymentStatus !== 'paid' && data.paymentLink) {
    lines.push('', 'Pay here:', data.paymentLink);
  }
  lines.push('', `- ${businessName}`);
  return lines.join('\n');
}
