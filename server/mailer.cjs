// Email notifications for new service requests, installations, and complaints.
// SMTP settings come from .env (SMTP_HOST/PORT/USER/PASS, NOTIFY_EMAIL_TO).
// All sends are fire-and-forget: a mail failure must never block a request.
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
// Gmail app passwords are often pasted with spaces — strip them.
const SMTP_PASS = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
const NOTIFY_TO = process.env.NOTIFY_EMAIL_TO || SMTP_USER;

const MAIL_ENABLED = !!(SMTP_USER && SMTP_PASS);

let transporter = null;
if (MAIL_ENABLED) {
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,          // 587 uses STARTTLS (secure: false)
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
} else {
    console.warn('[mail] SMTP_USER/SMTP_PASS not set — email notifications disabled');
}

function esc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function detailRows(fields) {
    return fields
        .filter(([, value]) => value != null && String(value).trim() !== '')
        .map(([label, value]) => `
            <tr>
                <td style="padding:10px 14px;border-bottom:1px solid #eef1f4;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #eef1f4;color:#111827;font-size:14px;font-weight:500;">${esc(value)}</td>
            </tr>`)
        .join('');
}

function buildTemplate({ accent, badge, heading, intro, fields, phone }) {
    const callBtn = phone ? `
        <a href="tel:${esc(phone)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">📞 Call Customer</a>` : '';
    return `
<div style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="background:${accent};padding:22px 28px;">
      <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.3px;">Networking Experts</div>
      <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:2px;">Service Portal Notification</div>
    </div>
    <div style="padding:26px 28px;">
      <span style="display:inline-block;background:${accent}18;color:${accent};font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:5px 12px;border-radius:20px;">${esc(badge)}</span>
      <h2 style="margin:14px 0 6px;color:#111827;font-size:19px;">${esc(heading)}</h2>
      <p style="margin:0 0 18px;color:#6b7280;font-size:14px;line-height:1.5;">${esc(intro)}</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #eef1f4;border-radius:8px;border-collapse:separate;overflow:hidden;">
        ${detailRows(fields)}
      </table>
      <div style="text-align:center;margin-top:22px;">${callBtn}</div>
    </div>
    <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #eef1f4;">
      <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
        This is an automated alert from the Networking Experts service portal.<br>
        Received ${esc(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }))} IST
      </p>
    </div>
  </div>
</div>`;
}

async function sendMail(subject, html) {
    if (!MAIL_ENABLED) return;
    try {
        await transporter.sendMail({
            from: `"Networking Experts Portal" <${SMTP_USER}>`,
            to: NOTIFY_TO,
            subject,
            html,
        });
        console.log(`[mail] sent: ${subject}`);
    } catch (err) {
        console.error(`[mail] failed (${subject}):`, err.message);
    }
}

function notifyServiceRequestEmail(inquiry) {
    const html = buildTemplate({
        accent: '#2563eb',
        badge: 'New Service Request',
        heading: `${inquiry.full_name || 'A customer'} requested a service`,
        intro: 'A new service request has just been submitted on the portal. Details below:',
        phone: inquiry.phone,
        fields: [
            ['Ticket No', inquiry.ticket_no],
            ['Customer', inquiry.full_name],
            ['Phone', inquiry.phone],
            ['Service', inquiry.service_item],
            ['Description', inquiry.description],
            ['Location', inquiry.location],
            ['Preferred Time', inquiry.preferred_time],
            ['Bill No', inquiry.bill_no],
        ],
    });
    return sendMail(`🛠️ New Service Request — ${inquiry.ticket_no || inquiry.full_name || 'Portal'}`, html);
}

function notifyInstallationEmail(inst) {
    const html = buildTemplate({
        accent: '#059669',
        badge: 'New Installation Request',
        heading: `${inst.full_name || 'A customer'} booked an installation`,
        intro: 'A new installation booking has just been submitted on the portal. Details below:',
        phone: inst.phone,
        fields: [
            ['Ticket No', inst.ticket_no],
            ['Customer', inst.full_name],
            ['Phone', inst.phone],
            ['Installation Type', inst.installation_type],
            ['Preferred Date', inst.preferred_date],
            ['Preferred Time', inst.preferred_time],
            ['Location', inst.location],
            ['Address', inst.address],
        ],
    });
    return sendMail(`🔧 New Installation — ${inst.ticket_no || inst.full_name || 'Portal'}`, html);
}

function notifyComplaintEmail(complaint) {
    const html = buildTemplate({
        accent: '#dc2626',
        badge: 'New Complaint',
        heading: `Complaint filed on ticket ${complaint.ticket_no || ''}`.trim(),
        intro: 'A customer has filed a complaint against an existing ticket. Please review it as soon as possible.',
        phone: complaint.phone,
        fields: [
            ['Ticket No', complaint.ticket_no],
            ['Phone', complaint.phone],
            ['Complaint', complaint.complaint_text],
        ],
    });
    return sendMail(`⚠️ New Complaint — Ticket ${complaint.ticket_no || ''}`, html);
}

module.exports = { notifyServiceRequestEmail, notifyInstallationEmail, notifyComplaintEmail };
