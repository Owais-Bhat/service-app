import { supabase } from '../supabase.js';
import { toast, formatDate, formatTime, showNotification } from '../utils.js';
import { ICONS } from '../icons.js';

const LOGO_URL = new URL('../assets/logo.png', import.meta.url).href;

// Business info shown on every premium bill.
const BUSINESS = {
  name: 'Networking Experts',
  tagline: 'Service · Installation · Support',
  address: 'Srinagar, J&K, India',
  phone: '+91 90000 00000',
  email: 'support@networkingexperts.in',
  gstin: '—',
};

// Lazily inject html2pdf.js (used to generate a downloadable PDF from the
// bill template). The CDN bundle includes both html2canvas and jsPDF.
let _html2pdfPromise = null;
function loadHtml2Pdf() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  if (_html2pdfPromise) return _html2pdfPromise;
  _html2pdfPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload = () => resolve(window.html2pdf);
    s.onerror = () => { _html2pdfPromise = null; reject(new Error('Could not load PDF library')); };
    document.head.appendChild(s);
  });
  return _html2pdfPromise;
}

// Premium printable bill template, used by employee + admin.
// `data` shape:
//   { customer:{name,phone,location,company,device_type,device_serial,service_item,ticket_no},
//     technician, services:[{name,cost}], extra, extraReason,
//     servicesSubtotal, platform, km, transport, discount, taxable, gst, total,
//     paymentLink }
export function renderPremiumBillHTML(data) {
  const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const today = new Date();
  const issued = `${today.getDate().toString().padStart(2,'0')}/${(today.getMonth()+1).toString().padStart(2,'0')}/${today.getFullYear()}`;
  const billNo = `NX-${(data.customer?.ticket_no || Date.now()).toString().slice(-8)}`;
  const services = Array.isArray(data.services) ? data.services : [];
  const itemRows = services.map((s, i) => `
    <tr>
      <td class="pb-idx">${i + 1}</td>
      <td>${esc(s.name)}</td>
      <td class="pb-right">${inr(s.cost)}</td>
    </tr>`).join('') || `<tr><td colspan="3" style="text-align:center;color:#9CA3AF;padding:18px;">No itemised services</td></tr>`;
  const extraRow = Number(data.extra) > 0 ? `
    <tr>
      <td class="pb-idx">${services.length + 1}</td>
      <td>Additional charges${data.extraReason ? ` <span style="color:#6B7280;font-size:11px">(${esc(data.extraReason)})</span>` : ''}</td>
      <td class="pb-right">${inr(data.extra)}</td>
    </tr>` : '';

  return `
  <div class="premium-bill" id="premium-bill-print">
    <div class="pb-header">
      <div class="pb-brand">
        <img src="${LOGO_URL}" alt="${BUSINESS.name}" class="pb-logo" onerror="this.style.display='none'"/>
        <div>
          <div class="pb-biz-name">${BUSINESS.name}</div>
          <div class="pb-biz-sub">${BUSINESS.tagline}</div>
        </div>
      </div>
      <div class="pb-meta">
        <div class="pb-stamp">TAX INVOICE</div>
        <div class="pb-bill-no">Bill # <b>${esc(billNo)}</b></div>
        <div class="pb-bill-date">Date: <b>${issued}</b></div>
      </div>
    </div>

    <div class="pb-parties">
      <div>
        <div class="pb-section-title">Billed To</div>
        <div class="pb-party-name">${esc(data.customer?.name || '—')}</div>
        <div class="pb-party-line">${esc(data.customer?.phone || '')}</div>
        ${data.customer?.company ? `<div class="pb-party-line">${esc(data.customer.company)}</div>` : ''}
        <div class="pb-party-line pb-party-loc">${esc(data.customer?.location || '')}</div>
      </div>
      <div>
        <div class="pb-section-title">Service Details</div>
        <div class="pb-party-line"><b>Ticket:</b> ${esc(data.customer?.ticket_no || '—')}</div>
        <div class="pb-party-line"><b>Service:</b> ${esc(data.customer?.service_item || '—')}</div>
        ${data.customer?.device_type ? `<div class="pb-party-line"><b>Device:</b> ${esc(data.customer.device_type)}</div>` : ''}
        ${data.customer?.device_serial ? `<div class="pb-party-line"><b>Serial:</b> ${esc(data.customer.device_serial)}</div>` : ''}
        ${data.technician ? `<div class="pb-party-line"><b>Technician:</b> ${esc(data.technician)}</div>` : ''}
      </div>
    </div>

    <table class="pb-items">
      <thead>
        <tr><th class="pb-idx">#</th><th>Description</th><th class="pb-right">Amount</th></tr>
      </thead>
      <tbody>${itemRows}${extraRow}</tbody>
    </table>

    <div class="pb-totals">
      <div class="pb-totals-row"><span>Services subtotal</span><b>${inr(data.servicesSubtotal)}</b></div>
      ${Number(data.extra) > 0 ? `<div class="pb-totals-row"><span>Additional charges</span><b>${inr(data.extra)}</b></div>` : ''}
      <div class="pb-totals-row"><span>Platform fee</span><b>${inr(data.platform)}</b></div>
      <div class="pb-totals-row"><span>Transport (${Number(data.km || 0).toFixed(1)} km × ₹5)</span><b>${inr(data.transport)}</b></div>
      ${Number(data.discount) > 0 ? `<div class="pb-totals-row pb-discount"><span>Loyalty discount</span><b>−${inr(data.discount)}</b></div>` : ''}
      <div class="pb-totals-row"><span>Taxable amount</span><b>${inr(data.taxable)}</b></div>
      <div class="pb-totals-row"><span>GST @ 18%</span><b>${inr(data.gst)}</b></div>
      <div class="pb-totals-row pb-total"><span>Total Payable</span><b>${inr(data.total)}</b></div>
    </div>

    ${data.paymentLink ? `
      <div class="pb-pay">
        <div class="pb-pay-title">💳 Quick Pay</div>
        <div class="pb-pay-link">${esc(data.paymentLink)}</div>
        <img class="pb-pay-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.paymentLink)}" alt="Payment QR"/>
        <div class="pb-pay-hint">Scan or tap the link to pay securely via Razorpay.</div>
      </div>` : ''}

    <div class="pb-footer">
      <div class="pb-thanks">Thank you for choosing ${BUSINESS.name}!</div>
      <div class="pb-foot-meta">
        ${BUSINESS.address} · ${BUSINESS.phone} · ${BUSINESS.email}
      </div>
      <div class="pb-foot-meta">GSTIN: ${BUSINESS.gstin} · This is a computer-generated invoice.</div>
    </div>
  </div>`;
}

// Render the bill node to a PDF Blob via html2pdf. Returns { blob, file }.
async function renderBillToPdfBlob(node, filename) {
  const html2pdf = await loadHtml2Pdf();
  const blob = await html2pdf().set({
    margin: 8,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).from(node).outputPdf('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  return { blob, file };
}

// Trigger a download of the given blob.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Short message that goes alongside the PDF on WhatsApp.
function billShortCaption(data) {
  const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
  const lines = [
    `Hi ${data.customer?.name || ''}! 👋`,
    `Your service invoice from *${BUSINESS.name}* is attached.`,
    `Ticket: *${data.customer?.ticket_no || '—'}* · Total: *${inr(data.total)}*`,
  ];
  if (data.paymentLink) lines.push('', `💳 Pay here: ${data.paymentLink}`);
  return lines.join('\n');
}

// Opens the premium bill modal. Accepts an options object:
//   onSent       — fires after the share is initiated (used by employee
//                  to persist the breakdown).
//   allowShare   — when false, hides the "Send via WhatsApp" button (admin
//                  view should not re-share).
//   title        — overrides the modal title.
export function openPremiumBillModal(data, opts = {}) {
  const { onSent, allowShare = true, title = '📄 Service Invoice Preview' } = opts;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal premium-bill-modal" style="max-width:720px">
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="modal-close" id="pb-close">✕</button>
      </div>
      <div class="modal-body" style="padding:0;">
        <div id="pb-render-wrap" style="padding:18px; background:#f3f4f6;">
          ${renderPremiumBillHTML(data)}
        </div>
      </div>
      <div class="modal-footer" style="flex-wrap:wrap; gap:8px;">
        <button class="btn btn-secondary" id="pb-cancel">Close</button>
        <button class="btn btn-secondary" id="pb-download">📥 Download PDF</button>
        ${allowShare ? `
          <button class="btn btn-primary" id="pb-whatsapp" style="background:#25D366; box-shadow:0 8px 24px rgba(37,211,102,0.32);">
            ${ICONS.whatsapp || ''}<span>Send PDF via WhatsApp</span>
          </button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#pb-close').onclick = close;
  overlay.querySelector('#pb-cancel').onclick = close;

  const filename = `Invoice-${data.customer?.ticket_no || 'service'}.pdf`;
  const getNode = () => overlay.querySelector('#premium-bill-print');

  overlay.querySelector('#pb-download').onclick = async () => {
    const btn = overlay.querySelector('#pb-download');
    btn.disabled = true; btn.textContent = '… preparing PDF';
    try {
      const { blob } = await renderBillToPdfBlob(getNode(), filename);
      downloadBlob(blob, filename);
      toast('Bill PDF downloaded', 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not generate PDF', 'error');
    } finally {
      btn.disabled = false; btn.textContent = '📥 Download PDF';
    }
  };

  if (allowShare) {
    overlay.querySelector('#pb-whatsapp').onclick = async () => {
      const btn = overlay.querySelector('#pb-whatsapp');
      btn.disabled = true;
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `<span>… preparing PDF</span>`;
      let shared = false;
      try {
        const { blob, file } = await renderBillToPdfBlob(getNode(), filename);
        const caption = billShortCaption(data);

        // Primary path: native share sheet with the PDF attached. On mobile
        // this lets the user pick WhatsApp and the file goes as an actual
        // document attachment, not a text link.
        const canShareFile = navigator.canShare && navigator.canShare({ files: [file] });
        if (canShareFile) {
          try {
            await navigator.share({
              files: [file],
              title: `Invoice ${data.customer?.ticket_no || ''}`.trim(),
              text: caption,
            });
            shared = true;
            toast('PDF shared via WhatsApp', 'success');
          } catch (err) {
            // User cancelled the share sheet — treat as a no-op, don't fall back.
            if (err && err.name === 'AbortError') {
              btn.disabled = false; btn.innerHTML = originalHTML;
              return;
            }
            // Otherwise fall through to the desktop fallback.
            console.warn('navigator.share failed, falling back', err);
          }
        }

        if (!shared) {
          // Desktop / unsupported browsers: download the PDF, then open
          // WhatsApp Web with the caption. The technician drags the
          // just-downloaded file into the chat to attach it.
          downloadBlob(blob, filename);
          const phone = (data.customer?.phone || '').replace(/\D/g, '');
          const url = phone
            ? `https://wa.me/${phone}?text=${encodeURIComponent(caption)}`
            : `https://wa.me/?text=${encodeURIComponent(caption)}`;
          window.open(url, '_blank');
          toast(`PDF downloaded as "${filename}" — drag it into the WhatsApp chat that just opened.`, 'success');
          shared = true;
        }

        if (shared && typeof onSent === 'function') {
          try { await onSent(); } catch {}
        }
      } catch (err) {
        console.error(err);
        toast(err.message || 'Could not generate PDF', 'error');
      } finally {
        btn.disabled = false; btn.innerHTML = originalHTML;
      }
    };
  }
}

function getMonthKey(date = new Date()) {
  return date.toLocaleDateString('en-CA').slice(0, 7);
}

function daysBetweenInclusive(start, end) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

function hoursWorked(clockIn, clockOut) {
  if (!clockIn || !clockOut) return null;
  const diff = new Date(clockOut) - new Date(clockIn);
  if (!Number.isFinite(diff) || diff < 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function money(value) {
  return `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

async function getEmployeeContext() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null };
  const [{ data: profile }, { data: attendance }, { data: leaves }, { data: reports }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('attendance').select('*').eq('user_id', user.id).order('date', { ascending: false }),
    supabase.from('leave_requests').select('*').eq('employee_id', user.id).order('created_at', { ascending: false }),
    supabase.from('eod_reports').select('*').eq('employee_id', user.id).order('date', { ascending: false }),
  ]);
  return { user, profile: profile || user, attendance: attendance || [], leaves: leaves || [], reports: reports || [] };
}

export async function renderEmployeeDashboard(container) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const today = new Date().toLocaleDateString('en-CA');
  let attendance, tasks, eodReport, pendingInquiries = [], acceptedInquiries = [];

  try {
    const res = await Promise.all([
      supabase.from('attendance').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('tickets').select('*, inquiries(*)').eq('assigned_to', user.id).order('created_at', { ascending: false }),
      supabase.from('eod_reports').select('*').eq('employee_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('inquiries').select('*').eq('assigned_employee_id', user.id).in('assignment_status', ['pending', 'accepted']),
      supabase.from('profiles').select('*'),
    ]);
    attendance = res[0].data; tasks = res[1].data; eodReport = res[2].data;
    const allInquiries = res[3].data || [];
    const profilesData = res[4].data || [];

    // Build phone → company map for labelling service jobs
    const phoneToCompany = new Map();
    profilesData.forEach(pr => { if (pr.phone) phoneToCompany.set(pr.phone, pr.company); });

    pendingInquiries = allInquiries.filter(x => x.assignment_status === 'pending');
    acceptedInquiries = allInquiries
      .filter(x => x.assignment_status === 'accepted')
      .map(x => ({ ...x, _company: phoneToCompany.get(x.phone) || null }));
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger);display:inline-flex;align-items:center;gap:8px;">${ICONS.alert}<span>Error</span></h3><p>${err.message}</p></div></div>`;
    return;
  }

  const t = tasks || [];
  const activeTasks = t.filter(x => x.status !== 'closed' && x.status !== 'resolved');
  const isClockedIn = !!attendance?.clock_in;
  const isClockedOut = !!attendance?.clock_out;
  const canClockOut = isClockedIn && !isClockedOut && !!eodReport;

  container.innerHTML = `
    <div class="page-header">
      <h1 style="display:flex; align-items:center; gap:12px;">
        <span style="width:32px; height:32px; display:flex; color:var(--primary);">${ICONS.staff}</span>
        <span>Employee Portal</span>
      </h1>
      <p>Today is ${new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
    </div>

    ${pendingInquiries.length > 0 ? `
      <div class="card" style="border: 2px solid var(--primary); background: rgba(16, 185, 129, 0.05);">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.alert}<span>New Assignments Pending</span></span></div>
        <div class="card-body">
          ${pendingInquiries.map(pi => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-soft); border-radius:12px; margin-bottom:10px; box-shadow:var(--neu-sm);">
              <div>
                <div style="font-weight:700">${pi.full_name} - ${pi.service_item}</div>
                <div style="font-size:0.8rem; color:var(--text-soft)">Preferred: ${pi.preferred_time || 'Flexible'}</div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-primary btn-sm accept-btn" data-id="${pi.id}">${ICONS.check} Accept</button>
                <button class="btn btn-danger btn-sm decline-btn" data-id="${pi.id}">${ICONS.close} Decline</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value stat-value-inline" style="color:${isClockedIn ? 'var(--success)' : 'var(--text-dim)'};">
          <span style="width:24px; height:24px; display:flex;">${isClockedIn ? ICONS.check : ICONS.pause}</span>
          <span>${isClockedIn ? 'Clocked In' : 'Not Started'}</span>
        </div>
        <div class="stat-label">${isClockedIn ? 'Since ' + formatTime(attendance.clock_in) : 'Tap Clock In to start'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-inline" style="color:var(--warning)">
          <span style="width:24px; height:24px; display:flex;">${ICONS.wrench}</span>
          <span>${activeTasks.length}</span>
        </div>
        <div class="stat-label">Active Tasks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-inline" style="color:var(--success)">
          <span style="width:24px; height:24px; display:flex;">${ICONS.check}</span>
          <span>${t.filter(x => x.status === 'resolved').length}</span>
        </div>
        <div class="stat-label">Completed</div>
      </div>
    </div>

    <div class="employee-work-grid">
      <!-- Attendance Card -->
      <div class="card">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.clock}<span>Attendance</span></span></div>
        <div class="card-body attendance-card-body">
          <div id="live-clock" class="live-clock">--:--:--</div>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-clock-in" ${isClockedIn ? 'disabled' : ''}>
              ${ICONS.play}<span>Clock In</span>
            </button>
            <button class="btn btn-secondary" id="btn-clock-out" ${canClockOut ? '' : 'disabled'} title="${!eodReport && isClockedIn && !isClockedOut ? 'Submit EOD report before clocking out' : ''}">
              ${ICONS.pause}<span>Clock Out</span>
            </button>
          </div>
          ${isClockedIn && !isClockedOut && !eodReport ? `<p class="attendance-lock-note">${ICONS.clipboard}<span>Submit today's EOD report to enable Clock Out.</span></p>` : ''}
          ${attendance?.location ? `<p class="attendance-location">${ICONS.pin}<span>${attendance.location}</span></p>` : ''}
          ${isClockedOut ? `<div style="margin-top:20px;padding:14px;border-radius:14px;box-shadow:var(--neu-in);background:var(--bg);font-size:.88rem;color:var(--success);font-weight:600;display:inline-flex;align-items:center;gap:8px;">
            ${ICONS.check}<span>Session: ${formatTime(attendance.clock_in)} → ${formatTime(attendance.clock_out)}</span>
          </div>` : ''}
        </div>
      </div>

      <!-- EOD Report Card -->
      <div class="card">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.clipboard}<span>End of Day Summary</span></span></div>
        <div class="card-body">
          ${eodReport ? `
            <div class="eod-done">
              <div class="eod-done-ring">${ICONS.check}</div>
              <h3 class="eod-done-title">All caught up!</h3>
              <p class="eod-done-sub">Your EOD report has been submitted.</p>
              <div class="eod-done-time">Submitted at ${formatTime(eodReport.created_at)}</div>
            </div>
          ` : `
            <div class="form-group">
              <label class="sr-icon-label">${ICONS.edit}<span>Today's progress</span></label>
              <textarea id="eod-content" rows="6"
                placeholder="What did you achieve today? Break it down briefly…"></textarea>
            </div>
            <button class="btn btn-primary btn-wide" id="btn-submit-eod" style="display:flex; align-items:center; justify-content:center; gap:10px;">
              <span>Submit Daily Report</span>
              <span style="width:18px; height:18px; display:flex;">${ICONS.arrowRight}</span>
            </button>
            <p class="eod-fineprint">Reports are visible to your manager immediately.</p>
          `}
        </div>
      </div>

      <!-- Leave Request Card -->
      <div class="card">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.clock}<span>Request Leave</span></span></div>
        <div class="card-body">
          <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:16px;">Need time off? Submit your request here for approval.</p>
          <button class="btn btn-secondary btn-wide" id="btn-open-leave-modal">
            ${ICONS.plus}<span>Submit Leave Request</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- Active Service Jobs -->
    <div class="card">
      <div class="card-header">
        <span class="card-title sr-icon-title" style="color:var(--primary)">${ICONS.users}<span>Active Service Jobs (Accepted)</span></span>
      </div>
      ${acceptedInquiries.length > 0 ? (() => {
        const companies = [...new Set(acceptedInquiries.map(x => x._company).filter(Boolean))];
        return companies.length > 0 ? `
          <div class="sr-filter-bar" style="padding:0 20px 12px" id="emp-company-tabs">
            <button class="sr-filter active" data-company="all">
              <span>All</span><span class="sr-filter-count">${acceptedInquiries.length}</span>
            </button>
            ${companies.map(c => `
              <button class="sr-filter" data-company="${c}">
                <span>${c}</span>
                <span class="sr-filter-count">${acceptedInquiries.filter(x => x._company === c).length}</span>
              </button>
            `).join('')}
          </div>` : '';
      })() : ''}
      <div class="card-body" id="emp-jobs-list">
        ${acceptedInquiries.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--text-dim)">No active jobs accepted yet.</div>' :
          acceptedInquiries.map(inq => `
            <div class="emp-job-card" data-company="${inq._company || ''}" style="padding:20px; border-radius:20px; background:var(--bg); box-shadow:var(--neu-in); margin-bottom:20px; border:1px solid var(--border);">
               <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                 <div>
                   <div style="font-weight:800; font-size:1.2rem; color:var(--primary)">${inq.full_name}</div>
                   ${inq._company ? `<div style="font-size:0.78rem;font-weight:700;color:var(--text-dim);margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">${inq._company}</div>` : ''}
                   <div style="font-size:0.9rem; color:var(--text-soft); margin-top:4px;"><b>Ticket:</b> ${inq.ticket_no || '—'}</div>
                   <div style="font-size:0.9rem; color:var(--text-soft); margin-top:4px;">${inq.service_item}</div>
                 </div>
                 <span class="badge badge-assigned" style="font-size:0.75rem">${inq.status.replace('_',' ')}</span>
               </div>

               <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-top:16px; padding-top:16px; border-top:1px solid rgba(16,185,129,0.1);">
                 <div>
                   <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Contact Info</div>
                   <div style="display:flex; align-items:center; gap:12px; margin-top:8px;">
                     <span style="font-weight:700; font-size:1rem">${inq.phone}</span>
                     <div style="display:flex; gap:8px;">
                       <a href="tel:${inq.phone}" style="display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:var(--primary); color:white; box-shadow:0 4px 10px rgba(16,185,129,0.2);">
                         <span style="width:18px;height:18px;display:flex;">${ICONS.phone}</span>
                       </a>
                       <a href="https://wa.me/${inq.phone.replace(/\D/g,'')}" target="_blank" style="display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:#25D366; color:white; box-shadow:0 4px 10px rgba(37,211,102,0.2);">
                         <span style="width:18px;height:18px;display:flex;">${ICONS.whatsapp}</span>
                       </a>
                     </div>
                   </div>
                 </div>
                 <div>
                   <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Service Location</div>
                   <div style="font-size:0.95rem; font-weight:600; margin-top:8px; display:flex; align-items:flex-start; gap:8px;">
                     <span style="width:20px;height:20px;display:flex;flex-shrink:0;color:var(--primary)">${ICONS.pin}</span>
                     <span style="line-height:1.4">${inq.location || '—'}</span>
                   </div>
                 </div>
                 <div>
                   <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Preferred Time</div>
                   <div style="font-size:0.95rem; font-weight:700; margin-top:8px; color:var(--primary)">${inq.preferred_time || 'Flexible'}</div>
                 </div>
               </div>

               <div style="margin-top:24px; display:flex; gap:12px;">
                 <button class="btn btn-secondary btn-sm task-btn" data-id="${inq.ticket_id}" data-inq-id="${inq.id}" data-status="${inq.status}" style="flex:1; height:44px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
                   <span style="width:18px;height:18px;display:flex;">${ICONS.edit}</span> Update Status
                 </button>
                 <button class="btn btn-primary btn-sm" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inq.location)}')" style="flex:1; height:44px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
                   <span style="width:18px;height:18px;display:flex;">${ICONS.pin}</span> Open Maps
                 </button>
               </div>
            </div>
          `).join('')}
      </div>
    </div>

    <!-- Tasks Section -->
    <div class="card">
      <div class="card-header">
        <span class="card-title sr-icon-title">${ICONS.ticket}<span>My Tasks & Details</span></span>
        <span class="badge badge-open">${activeTasks.length} active</span>
      </div>
      <div class="card-body">
        ${t.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--text-dim)">No tasks assigned yet.</div>' : 
          t.map(task => {
            const inq = task.inquiries?.[0]; // Get the linked inquiry if it exists
            return `
              <div style="padding:16px; border-radius:16px; background:var(--bg-soft); box-shadow:var(--neu-sm); margin-bottom:16px; border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <div style="flex:1">
                    <div style="font-weight:800; font-size:1.05rem; color:var(--text)">${task.title}</div>
                    <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;">${task.description || 'No description provided.'}</div>
                  </div>
                  <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                    <span class="badge badge-${task.status}">${task.status.replace('_',' ')}</span>
                    <span class="badge badge-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
                  </div>
                </div>
                
                ${inq ? `
                  <div style="margin-top:16px; padding:12px; background:var(--bg); border-radius:12px; border:1px dashed var(--primary);">
                    <div style="font-size:0.75rem; color:var(--primary); font-weight:800; text-transform:uppercase; margin-bottom:8px;">Linked Service Request</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                      <div>
                        <div style="font-size:0.7rem; color:var(--text-dim)">Client</div>
                        <div style="font-size:0.85rem; font-weight:700">${inq.full_name}</div>
                      </div>
                      <div>
                        <div style="font-size:0.7rem; color:var(--text-dim)">Contact</div>
                        <div style="font-size:0.85rem; font-weight:700; display:flex; align-items:center; gap:6px;">
                          ${inq.phone}
                          <a href="tel:${inq.phone}" style="color:var(--primary); display:flex;"><span style="width:14px;height:14px;display:flex;">${ICONS.phone}</span></a>
                        </div>
                      </div>
                      <div style="grid-column: span 2">
                        <div style="font-size:0.7rem; color:var(--text-dim)">Location</div>
                        <div style="font-size:0.85rem; font-weight:600; display:flex; align-items:flex-start; gap:6px;">
                          <span style="width:14px;height:14px;display:flex;flex-shrink:0;color:var(--primary);margin-top:2px;">${ICONS.pin}</span>
                          ${inq.location || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                ` : ''}
                
                <div style="margin-top:16px; display:flex; gap:8px;">
                  <button class="btn btn-secondary btn-sm task-btn" data-id="${task.id}" data-inq-id="${inq ? inq.id : ''}" data-status="${task.status}" style="flex:1; height:38px; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <span style="width:14px;height:14px;display:flex;">${ICONS.edit}</span> Update Status
                  </button>
                  ${inq ? `
                    <button class="btn btn-primary btn-sm" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inq.location)}')" style="flex:1; height:38px; display:flex; align-items:center; justify-content:center; gap:6px;">
                      <span style="width:14px;height:14px;display:flex;">${ICONS.pin}</span> Route
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
      </div>
    </div>
  `;

  // Live clock
  const clockEl = container.querySelector('#live-clock');
  const tick = () => { if (clockEl) clockEl.textContent = new Date().toLocaleTimeString(); };
  tick(); setInterval(tick, 1000);

  // Company filter tabs for service jobs
  const tabBar = container.querySelector('#emp-company-tabs');
  if (tabBar) {
    tabBar.querySelectorAll('.sr-filter').forEach(btn => {
      btn.onclick = () => {
        tabBar.querySelectorAll('.sr-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const company = btn.dataset.company;
        container.querySelectorAll('.emp-job-card').forEach(card => {
          card.style.display = (company === 'all' || card.dataset.company === company) ? '' : 'none';
        });
      };
    });
  }

  const bind = (sel, cb) => {
    const el = container.querySelector(sel);
    if (el) el.onclick = cb;
  };

  // Clock In
  bind('#btn-clock-in', async () => {
    const btn = container.querySelector('#btn-clock-in');
    btn.disabled = true; btn.textContent = 'Getting location…';
    let locationStr = 'Unknown';
    let coords = { lat: null, lng: null };
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
      const { latitude: lat, longitude: lng } = pos.coords;
      coords = { lat, lng };
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await res.json();
        locationStr = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      } catch (err) {
        locationStr = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    } catch (_) {}

    const { error } = await supabase.from('attendance').insert({
      user_id: user.id, clock_in: new Date().toISOString(), date: today, location: locationStr,
      latitude: coords.lat, longitude: coords.lng, status: 'present'
    });
    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = '✅ Clock In'; }
    else { toast('Clocked in!', 'success'); renderEmployeeDashboard(container); }
  });

  // Clock Out
  bind('#btn-clock-out', async () => {
    const { error } = await supabase.from('attendance').update({ clock_out: new Date().toISOString() })
      .eq('user_id', user.id).eq('date', today);
    if (error) toast(error.message, 'error');
    else { toast('Clocked out!', 'success'); renderEmployeeDashboard(container); }
  });

  // EOD
  const eodBtn = container.querySelector('#btn-submit-eod');
  if (eodBtn) {
    bind('#btn-submit-eod', async () => {
      const content = container.querySelector('#eod-content').value.trim();
      if (!content) { toast('Please write your report', 'warning'); return; }
      const eodBtnActual = container.querySelector('#btn-submit-eod');
      eodBtnActual.disabled = true; eodBtnActual.textContent = 'Submitting…';
      const { error } = await supabase.from('eod_reports').insert({ employee_id: user.id, content, date: today });
      if (error) { toast(error.message, 'error'); eodBtnActual.disabled = false; eodBtnActual.textContent = 'Submit Report →'; }
      else { toast('EOD Report submitted!', 'success'); renderEmployeeDashboard(container); }
    });
  }

  // Leave Request
  bind('#btn-open-leave-modal', () => openLeaveModal(user.id, () => renderEmployeeDashboard(container)));

  // Task update buttons
  container.querySelectorAll('.task-btn').forEach(btn => {
    btn.onclick = () => openTaskModal(btn.dataset.id, btn.dataset.inqId, btn.dataset.status, () => renderEmployeeDashboard(container));
  });

  // Accept/Decline logic
  container.querySelectorAll('.accept-btn').forEach(btn => {
    btn.onclick = async () => {
      const { error } = await supabase.from('inquiries').update({ assignment_status: 'accepted' }).eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Task accepted!', 'success'); renderEmployeeDashboard(container); }
    };
  });

  container.querySelectorAll('.decline-btn').forEach(btn => {
    btn.onclick = () => {
      const reason = prompt('Please provide a reason for declining:');
      if (reason === null) return;
      if (!reason.trim()) { toast('Reason is required to decline', 'warning'); return; }
      
      (async () => {
        const { error } = await supabase.from('inquiries').update({ 
          assignment_status: 'declined', 
          decline_reason: reason.trim(),
          status: 'open' // Put back to open for re-assignment
        }).eq('id', btn.dataset.id);
        
        if (error) toast(error.message, 'error');
        else { toast('Task declined', 'info'); renderEmployeeDashboard(container); }
      })();
    };
  });

  // Real-time listener for new assignments + payments — fires sound + browser notification.
  const channel = supabase.channel(`employee-jobs-${user.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'inquiries',
      filter: `assigned_employee_id=eq.${user.id}`
    }, payload => {
      const row = payload.new;
      if (payload.eventType === 'INSERT' || (payload.eventType === 'UPDATE' && row?.assignment_status === 'pending')) {
        showNotification({
          title: '🔔 New Job Assigned',
          body: `${row?.full_name || 'A client'} — ${row?.service_item || 'new service'}`,
          type: 'alert',
          tag: `assign-${row?.id || ''}`,
        });
      } else if (payload.eventType === 'UPDATE' && row?.payment_status === 'paid') {
        showNotification({
          title: '💰 Payment Received',
          body: `${row?.full_name || 'Client'} paid for ticket ${row?.ticket_no || ''}`,
          type: 'payment',
          tag: `pay-${row?.id || ''}`,
        });
      }
      renderEmployeeDashboard(container);
    })
    .subscribe();

  // Cleanup
  const checkRemoval = setInterval(() => {
    if (!document.body.contains(container)) {
      supabase.removeChannel(channel);
      clearInterval(checkRemoval);
    }
  }, 5000);
}

export async function renderEmployeeAttendanceRecords(container) {
  const { user, attendance } = await getEmployeeContext();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const monthKey = getMonthKey();
  const monthRows = attendance.filter(x => String(x.date || '').startsWith(monthKey));
  const presentDays = new Set(monthRows.map(x => x.date)).size;
  const completed = monthRows.filter(x => x.clock_in && x.clock_out);
  const totalMins = completed.reduce((sum, x) => sum + Math.max(0, new Date(x.clock_out) - new Date(x.clock_in)) / 60000, 0);
  const totalHours = `${Math.floor(totalMins / 60)}h ${Math.round(totalMins % 60)}m`;

  container.innerHTML = `
    <div class="page-header">
      <h1>Attendance Records</h1>
      <p>Your check-ins, locations, and monthly attendance count</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${presentDays}</div><div class="stat-label">Days Present This Month</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${monthRows.filter(x => x.clock_in && !x.clock_out).length}</div><div class="stat-label">Active Sessions</div></div>
      <div class="stat-card"><div class="stat-value" style="font-size:1.7rem;color:var(--warning)">${totalHours}</div><div class="stat-label">Logged Hours This Month</div></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Location</th></tr></thead>
          <tbody>
            ${attendance.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-dim)">No attendance records yet</td></tr>' :
              attendance.map(x => `<tr>
                <td>${formatDate(x.date)}</td>
                <td><span class="badge badge-open">${formatTime(x.clock_in)}</span></td>
                <td>${x.clock_out ? `<span class="badge badge-resolved">${formatTime(x.clock_out)}</span>` : '<span style="color:var(--text-dim)">Active</span>'}</td>
                <td>${hoursWorked(x.clock_in, x.clock_out) || '—'}</td>
                <td><small>${x.location || '—'}</small></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function renderEmployeeLeaveRequests(container) {
  const { user, leaves } = await getEmployeeContext();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const pending = leaves.filter(x => x.status === 'pending').length;
  const approved = leaves.filter(x => x.status === 'approved').reduce((sum, x) => sum + daysBetweenInclusive(x.start_date, x.end_date), 0);

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Leave Requests</h1>
        <p>Submit leave and track approval from admin</p>
      </div>
      <button class="btn btn-primary" id="leave-new">${ICONS.plus}<span>New Request</span></button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">Pending Requests</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${approved}</div><div class="stat-label">Approved Leave Days</div></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>
            ${leaves.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-dim)">No leave requests yet</td></tr>' :
              leaves.map(x => `<tr>
                <td><small>${formatDate(x.start_date)} to ${formatDate(x.end_date)}</small></td>
                <td>${daysBetweenInclusive(x.start_date, x.end_date)}</td>
                <td style="max-width:360px;white-space:normal">${x.reason}</td>
                <td><span class="badge badge-${x.status}">${x.status}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#leave-new').onclick = () => openLeaveModal(user.id, () => renderEmployeeLeaveRequests(container));
}

export async function renderEmployeeEODReports(container) {
  const { user, reports } = await getEmployeeContext();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }
  const today = new Date().toLocaleDateString('en-CA');
  const todayReport = reports.find(x => x.date === today);

  container.innerHTML = `
    <div class="page-header">
      <h1>EOD Reports</h1>
      <p>View every daily summary you have submitted</p>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title sr-icon-title">${ICONS.clipboard}<span>Today's Summary</span></span></div>
      <div class="card-body">
        ${todayReport ? `
          <div class="eod-done">
            <div class="eod-done-ring">${ICONS.check}</div>
            <h3 class="eod-done-title">Submitted today</h3>
            <p class="eod-done-sub">${todayReport.content}</p>
          </div>
        ` : `
          <div class="form-group">
            <label class="sr-icon-label">${ICONS.edit}<span>Today's progress</span></label>
            <textarea id="employee-eod-content" rows="5" placeholder="What did you complete today?"></textarea>
          </div>
          <button class="btn btn-primary btn-wide" id="employee-eod-submit">Submit Daily Report</button>
        `}
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Submitted</th><th>Summary</th></tr></thead>
          <tbody>
            ${reports.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-dim)">No reports yet</td></tr>' :
              reports.map(x => `<tr>
                <td>${formatDate(x.date)}</td>
                <td>${formatTime(x.created_at)}</td>
                <td style="max-width:560px;white-space:normal;line-height:1.5">${x.content}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const btn = container.querySelector('#employee-eod-submit');
  if (btn) {
    btn.onclick = async () => {
      const content = container.querySelector('#employee-eod-content').value.trim();
      if (!content) { toast('Please write your report', 'warning'); return; }
      btn.disabled = true; btn.textContent = 'Submitting...';
      const { error } = await supabase.from('eod_reports').insert({ employee_id: user.id, content, date: today });
      if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = 'Submit Daily Report'; }
      else { toast('EOD Report submitted!', 'success'); renderEmployeeEODReports(container); }
    };
  }
}

export async function renderEmployeeSalary(container) {
  const { user, profile, attendance, leaves } = await getEmployeeContext();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const monthKey = getMonthKey();
  const monthRows = attendance.filter(x => String(x.date || '').startsWith(monthKey));
  const presentDays = new Set(monthRows.map(x => x.date)).size;
  const approvedLeaveDays = leaves
    .filter(x => x.status === 'approved' && String(x.start_date || '').startsWith(monthKey))
    .reduce((sum, x) => sum + daysBetweenInclusive(x.start_date, x.end_date), 0);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthlySalary = Number(profile?.salary) || 0;
  const perDay = monthlySalary / daysInMonth;
  const payableDays = presentDays + approvedLeaveDays;
  const estimated = perDay * payableDays;

  container.innerHTML = `
    <div class="page-header">
      <h1>Salary</h1>
      <p>Month-to-date salary estimate based on attendance and approved leave</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value" style="font-size:1.8rem">${money(monthlySalary)}</div><div class="stat-label">Monthly Salary</div></div>
      <div class="stat-card"><div class="stat-value">${presentDays}</div><div class="stat-label">Days Present</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${approvedLeaveDays}</div><div class="stat-label">Approved Leave Days</div></div>
      <div class="stat-card"><div class="stat-value" style="font-size:1.8rem;color:var(--warning)">${money(estimated)}</div><div class="stat-label">Estimated Earned</div></div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="salary-breakdown">
          <div><span>Payable days</span><b>${payableDays} / ${daysInMonth}</b></div>
          <div><span>Per day value</span><b>${money(perDay)}</b></div>
          <div><span>Formula</span><b>Present + approved leave</b></div>
        </div>
      </div>
    </div>
  `;
}

function openTaskModal(taskId, inqId, currentStatus, onDone) {
  (async () => {
    const { data: pricing } = await supabase.from('service_pricing').select('*').order('category');
    // Snapshot current payment state so we can gate the resolved/closed submit button.
    let paymentState = { status: 'unpaid', received_at: null };
    let inquiryRow = null;
    if (inqId) {
      const { data: inqSnap } = await supabase.from('inquiries').select('*').eq('id', inqId).single();
      if (inqSnap) {
        inquiryRow = inqSnap;
        paymentState = { status: inqSnap.payment_status || 'unpaid', received_at: inqSnap.payment_received_at || null };
      }
    }
    // Employee profile + most recent attendance (for technician name and clock-in coords).
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const empProfile = authUser ? (await supabase.from('profiles').select('*').eq('id', authUser.id).single()).data : null;
    const todayKey = new Date().toLocaleDateString('en-CA');
    let employeeCoords = { lat: null, lng: null, location: null };
    if (authUser) {
      const { data: att } = await supabase.from('attendance')
        .select('latitude,longitude,location,clock_in')
        .eq('user_id', authUser.id)
        .eq('date', todayKey)
        .order('clock_in', { ascending: false });
      if (Array.isArray(att) && att[0]) {
        employeeCoords = { lat: att[0].latitude, lng: att[0].longitude, location: att[0].location };
      }
    }
    // Build a tree: Main → Sub → leaves (each leaf = priced row). When a row
    // has no sub_category we group it under a synthetic '' key, surfaced as
    // "—" in the picker so the cascade still works for 2-level catalogs.
    const tree = {};
    (pricing || []).forEach(p => {
      const main = p.category || 'Uncategorized';
      const sub = (p.sub_category && p.sub_category.trim()) || '';
      const leaf = p.sub_sub_category || p.name || '';
      if (!leaf) return;
      tree[main] ??= {};
      tree[main][sub] ??= [];
      tree[main][sub].push({ id: p.id, leaf, cost: Number(p.cost) || 0 });
    });
    const mainOptions = Object.keys(tree).sort();
    
    const isResolving = currentStatus === 'resolved' || currentStatus === 'closed';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <span class="modal-title">Manage Service</span>
          <button class="modal-close" id="cm">✕</button>
        </div>
        <div class="modal-body" style="padding-top:14px;">
          <div class="mst-tabs" role="tablist">
            <button type="button" class="mst-tab active" data-tab="status">📌 Status</button>
            <button type="button" class="mst-tab" data-tab="device">🔧 Device Info</button>
            <button type="button" class="mst-tab" data-tab="bill">📄 Bill</button>
          </div>

          <!-- TAB 1: STATUS -->
          <div class="mst-pane active" data-pane="status">
            <div class="form-group">
              <label>New Status</label>
              <select id="new-status">
                <option value="open" ${currentStatus==='open'?'selected':''}>Open</option>
                <option value="in_progress" ${currentStatus==='in_progress'?'selected':''}>In Progress</option>
                <option value="resolved" ${currentStatus==='resolved'?'selected':''}>Resolved</option>
                <option value="closed" ${currentStatus==='closed'?'selected':''}>Closed</option>
                <option value="issue_not_resolved" ${currentStatus==='issue_not_resolved'?'selected':''}>Issue Not Resolved</option>
              </select>
            </div>

            <div class="form-group">
              <label>Work Details / Progress Update <span style="color:var(--danger)">*</span></label>
              <textarea id="progress-detail" rows="5" placeholder="Describe what you did... (Mandatory)"></textarea>
            </div>

            <div id="feedback-link-box" style="display:none; padding:12px; border-radius:12px; background:rgba(16,185,129,0.07); border:1px solid var(--primary);">
              <div style="font-size:0.78rem; font-weight:700; color:var(--primary); margin-bottom:6px;">📋 Feedback Link for Client</div>
              <div style="display:flex; gap:8px;">
                <input id="feedback-url" type="text" readonly style="flex:1; font-size:0.78rem; background:var(--bg);"/>
                <button class="btn btn-secondary btn-sm" id="copy-feedback-url">Copy</button>
              </div>
              <button class="btn btn-primary btn-sm" id="share-feedback-wa" style="width:100%; margin-top:8px; justify-content:center; gap:8px;">
                ${ICONS.whatsapp}<span>Share Feedback Link via WhatsApp</span>
              </button>
            </div>
          </div>

          <!-- TAB 2: DEVICE INFO -->
          <div class="mst-pane" data-pane="device">
            <div class="form-group">
              <label>Company Name (Optional)</label>
              <input type="text" id="resolve-company" placeholder="Which company is this for?" value="${(inquiryRow?.company_name ?? '').replace(/"/g,'&quot;')}"/>
            </div>
            <div class="form-group">
              <label>Device Type</label>
              <input type="text" id="device-type" placeholder="e.g. Video Door Phone" value="${(inquiryRow?.device_type ?? '').replace(/"/g,'&quot;')}"/>
            </div>
            <div class="form-group">
              <label>Device Serial No</label>
              <input type="text" id="device-serial" placeholder="e.g. SN-12345" value="${(inquiryRow?.device_serial_no ?? '').replace(/"/g,'&quot;')}"/>
            </div>
            <small style="display:block; color:var(--text-dim); font-size:0.78rem; margin-top:-4px;">These are saved on the inquiry whenever you press Save Changes — and they appear on the bill template.</small>
          </div>

          <!-- TAB 3: BILL -->
          <div class="mst-pane" data-pane="bill">
            <div id="bill-locked-hint" style="display:${isResolving ? 'none' : 'block'}; padding:14px; border-radius:12px; background:var(--bg-soft); border:1px dashed var(--border); margin-bottom:14px; font-size:0.85rem; color:var(--text-soft);">
              ℹ️ Set status to <b>Resolved</b> or <b>Closed</b> on the Status tab to enable billing.
            </div>
            <div id="pricing-section" style="display:${isResolving ? 'block' : 'none'};">
              <label style="font-weight:700; margin-bottom:8px; display:block;">Diagnose Issue & Add Services</label>
              ${mainOptions.length === 0 ? `
                <p style="font-size:0.8rem; color:var(--text-dim); padding:10px; background:var(--bg-soft); border-radius:10px;">No standard services defined by Admin.</p>
              ` : `
                <div class="svc-picker-wrap">
                  <select id="svc-main" class="svc-picker">
                    <option value="">Select Main Category…</option>
                    ${mainOptions.map(m => `<option value="${m.replace(/"/g, '&quot;')}">${m}</option>`).join('')}
                  </select>
                  <select id="svc-sub" class="svc-picker" disabled>
                    <option value="">Select Sub Category…</option>
                  </select>
                  <select id="svc-sub-sub" class="svc-picker" disabled>
                    <option value="">Select Specific Issue…</option>
                  </select>
                  <div class="svc-picker-actions">
                    <div class="svc-preview-text" id="svc-preview">Pick an issue to see the price.</div>
                    <button type="button" class="btn btn-primary btn-sm" id="svc-add" disabled style="white-space:nowrap;">+ Add</button>
                  </div>
                </div>
                <div id="svc-selected" style="display:none; margin-bottom:12px;"></div>
              `}

              <div class="form-group">
                <label>Additional Charges (Optional)</label>
                <input type="number" id="extra-cost" placeholder="₹0" style="margin-bottom:8px;"/>
                <input type="text" id="extra-reason" placeholder="Reason for extra charge..."/>
              </div>

              <div class="form-group">
                <label>Transport Distance (km)</label>
                <div style="display:flex; gap:8px;">
                  <input type="number" id="transport-km" min="0" step="0.1" placeholder="0" style="flex:1"/>
                  <button type="button" class="btn btn-secondary btn-sm" id="auto-km" style="white-space:nowrap" title="Calculate from your clock-in location to the customer location">📍 Auto</button>
                </div>
                <small id="transport-km-hint" style="display:block; margin-top:6px; color:var(--text-dim); font-size:0.75rem;">₹5 per km · click 📍 Auto to compute from your clock-in GPS.</small>
              </div>

              <div class="bill-breakdown" id="bill-breakdown">
                <div class="bill-row"><span>Services subtotal</span><b id="br-services">₹0</b></div>
                <div class="bill-row"><span>Additional charges</span><b id="br-extra">₹0</b></div>
                <div class="bill-row"><span>Platform fee</span><b id="br-platform">₹50</b></div>
                <div class="bill-row"><span>Transport (<span id="br-km">0</span> km × ₹5)</span><b id="br-transport">₹0</b></div>
                <div class="bill-row bill-row-discount" id="br-discount-row" style="display:none;"><span>Loyalty discount (over ₹250)</span><b id="br-discount">−₹30</b></div>
                <div class="bill-row"><span>GST (18%)</span><b id="br-gst">₹0</b></div>
                <div class="bill-row bill-row-total"><span>Final total</span><b id="br-total">₹0</b></div>
                <input type="hidden" id="total-bill-display" value="0"/>
              </div>

              <button type="button" class="btn btn-primary btn-wide" id="open-bill-modal" style="margin-bottom:14px;">📄 Generate &amp; Send Premium Bill</button>

              <!-- Payment Link + QR -->
              <div style="padding:14px; background:var(--bg-soft); border-radius:14px; border:1px solid var(--border);">
                <div style="font-weight:700; font-size:0.85rem; margin-bottom:10px; color:var(--text)">💳 Payment Link & QR</div>
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                  <input id="emp-pay-link" type="url" placeholder="Payment link will appear here…" style="flex:1; font-size:0.82rem;" readonly/>
                  <button class="btn btn-secondary btn-sm" id="emp-gen-link" style="white-space:nowrap">✨ Generate</button>
                </div>
                <div id="emp-qr-wrap" style="display:none; text-align:center; margin-bottom:10px;">
                  <img id="emp-qr-img" src="" alt="QR Code" style="width:160px; height:160px; border-radius:12px; border:2px solid var(--primary);"/>
                  <div style="font-size:0.75rem; color:var(--text-dim); margin-top:6px;">Client can scan to pay</div>
                </div>
                <button class="btn btn-primary btn-sm" id="emp-share-wa" style="width:100%; display:none; gap:8px; justify-content:center;">
                  ${ICONS.whatsapp}<span>Share via WhatsApp</span>
                </button>

                <div id="emp-pay-status" style="margin-top:12px; padding:12px; border-radius:12px; background:var(--bg); border:2px solid var(--border); display:flex; align-items:center; gap:10px;">
                  <div id="emp-pay-status-icon" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; color:var(--text-dim);">${ICONS.clock}</div>
                  <div style="flex:1">
                    <div id="emp-pay-status-title" style="font-weight:800; font-size:0.9rem; color:var(--text)">Payment: Unpaid</div>
                    <div id="emp-pay-status-sub" style="font-size:0.75rem; color:var(--text-dim);">Generate a link, then wait for the client to pay.</div>
                  </div>
                  <button class="btn btn-secondary btn-sm" id="emp-pay-check" title="Re-check payment" style="white-space:nowrap">↻</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cm2">Cancel</button>
          <button class="btn btn-primary" id="save-update">Save Changes</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Tab switcher
    overlay.querySelectorAll('.mst-tab').forEach(tabBtn => {
      tabBtn.onclick = () => {
        const target = tabBtn.dataset.tab;
        overlay.querySelectorAll('.mst-tab').forEach(b => b.classList.toggle('active', b === tabBtn));
        overlay.querySelectorAll('.mst-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === target));
      };
    });

    const statusSel = overlay.querySelector('#new-status');
    const pricingSec = overlay.querySelector('#pricing-section');
    const totalDisplay = overlay.querySelector('#total-bill-display');
    const extraInput = overlay.querySelector('#extra-cost');
    const kmInput = overlay.querySelector('#transport-km');
    const saveBtn = overlay.querySelector('#save-update');

    // Bill constants
    const PLATFORM_FEE = 50;
    const TRANSPORT_PER_KM = 5;
    const DISCOUNT_THRESHOLD = 250;
    const DISCOUNT_AMOUNT = 30;
    const GST_RATE = 0.18;
    const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

    // Selected services chosen via the cascading picker. Each entry:
    // { id, main, sub, leaf, cost }.
    const selectedServices = [];

    // Live breakdown — also stored on a closure object so the bill modal can read it.
    const bill = {
      servicesSubtotal: 0, extra: 0, platform: PLATFORM_FEE,
      km: 0, transport: 0, discount: 0, taxable: 0, gst: 0, total: 0,
    };

    const calcTotal = () => {
      bill.servicesSubtotal = selectedServices.reduce((acc, s) => acc + (Number(s.cost) || 0), 0);
      bill.extra = Number(extraInput.value) || 0;
      bill.km = Math.max(0, Number(kmInput.value) || 0);
      bill.transport = Math.round(bill.km * TRANSPORT_PER_KM);
      bill.platform = PLATFORM_FEE;
      const preDiscount = bill.servicesSubtotal + bill.extra + bill.platform + bill.transport;
      bill.discount = preDiscount > DISCOUNT_THRESHOLD ? DISCOUNT_AMOUNT : 0;
      bill.taxable = preDiscount - bill.discount;
      bill.gst = Math.round(bill.taxable * GST_RATE);
      bill.total = bill.taxable + bill.gst;

      overlay.querySelector('#br-services').textContent = inr(bill.servicesSubtotal);
      overlay.querySelector('#br-extra').textContent = inr(bill.extra);
      overlay.querySelector('#br-platform').textContent = inr(bill.platform);
      overlay.querySelector('#br-km').textContent = bill.km.toString();
      overlay.querySelector('#br-transport').textContent = inr(bill.transport);
      const discRow = overlay.querySelector('#br-discount-row');
      discRow.style.display = bill.discount > 0 ? 'flex' : 'none';
      overlay.querySelector('#br-discount').textContent = `−${inr(bill.discount)}`;
      overlay.querySelector('#br-gst').textContent = inr(bill.gst);
      overlay.querySelector('#br-total').textContent = inr(bill.total);
      totalDisplay.value = String(bill.total);
    };

    // Haversine distance in km between two lat/lng pairs.
    const haversineKm = (lat1, lng1, lat2, lng2) => {
      const toRad = (d) => d * Math.PI / 180;
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };

    // Auto-fill km from clock-in coords → customer coords.
    const autoKmBtn = overlay.querySelector('#auto-km');
    const kmHint = overlay.querySelector('#transport-km-hint');
    const tryAutoKm = () => {
      const eLat = employeeCoords.lat, eLng = employeeCoords.lng;
      const cLat = inquiryRow?.customer_lat, cLng = inquiryRow?.customer_lng;
      if (eLat == null || eLng == null) {
        kmHint.textContent = '₹5 per km · enter manually (no clock-in GPS on record for today).';
        autoKmBtn.disabled = true; autoKmBtn.style.opacity = '0.5';
        return;
      }
      if (cLat == null || cLng == null) {
        kmHint.textContent = '₹5 per km · enter manually (customer location has no GPS coords).';
        autoKmBtn.disabled = true; autoKmBtn.style.opacity = '0.5';
        return;
      }
      kmHint.textContent = `₹5 per km · 📍 Auto uses your clock-in GPS → customer GPS.`;
    };
    tryAutoKm();
    autoKmBtn.onclick = () => {
      const eLat = employeeCoords.lat, eLng = employeeCoords.lng;
      const cLat = inquiryRow?.customer_lat, cLng = inquiryRow?.customer_lng;
      if (eLat == null || cLat == null) return;
      const km = haversineKm(Number(eLat), Number(eLng), Number(cLat), Number(cLng));
      kmInput.value = km.toFixed(1);
      calcTotal(); renderPayStatus();
      toast(`Distance: ${km.toFixed(1)} km`, 'success');
    };
    kmInput.oninput = () => { calcTotal(); renderPayStatus(); };

    // ── Cascading picker wiring ───────────────────────────────────────────
    const mainSel = overlay.querySelector('#svc-main');
    const subSel = overlay.querySelector('#svc-sub');
    const subSubSel = overlay.querySelector('#svc-sub-sub');
    const svcPreview = overlay.querySelector('#svc-preview');
    const svcAddBtn = overlay.querySelector('#svc-add');
    const svcSelectedBox = overlay.querySelector('#svc-selected');

    const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

    const renderSelectedList = () => {
      if (!svcSelectedBox) return;
      if (selectedServices.length === 0) { svcSelectedBox.style.display = 'none'; svcSelectedBox.innerHTML = ''; return; }
      svcSelectedBox.style.display = 'block';
      svcSelectedBox.innerHTML = `
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-dim); margin-bottom:6px;">Services performed (${selectedServices.length})</div>
        ${selectedServices.map((s, i) => `
          <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--bg); border:1px solid var(--border); border-radius:10px; margin-bottom:6px;">
            <div style="flex:1; font-size:0.85rem;">
              <b>${escHtml(s.main)}</b>${s.sub ? ` › ${escHtml(s.sub)}` : ''} › ${escHtml(s.leaf)}
            </div>
            <span style="font-weight:700; color:var(--primary);">₹${Number(s.cost).toLocaleString('en-IN')}</span>
            <button type="button" class="btn btn-danger btn-sm svc-remove" data-idx="${i}" title="Remove">✕</button>
          </div>
        `).join('')}
      `;
      svcSelectedBox.querySelectorAll('.svc-remove').forEach(btn => {
        btn.onclick = () => {
          selectedServices.splice(Number(btn.dataset.idx), 1);
          renderSelectedList(); calcTotal(); renderPayStatus();
        };
      });
    };

    const fillSubs = () => {
      if (!subSel) return;
      const main = mainSel.value;
      subSel.innerHTML = '<option value="">Select Sub Category…</option>';
      subSubSel.innerHTML = '<option value="">Select Specific Issue…</option>';
      subSubSel.disabled = true;
      svcPreview.textContent = 'Pick an issue to see the price.';
      svcAddBtn.disabled = true;
      if (!main || !tree[main]) { subSel.disabled = true; return; }
      const subs = Object.keys(tree[main]).sort();
      subs.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s || '— (no sub-group)';
        subSel.appendChild(opt);
      });
      subSel.disabled = false;
      // If only one sub group, auto-select it.
      if (subs.length === 1) { subSel.value = subs[0]; fillSubSubs(); }
    };

    const fillSubSubs = () => {
      if (!subSubSel) return;
      const main = mainSel.value;
      const sub = subSel.value;
      subSubSel.innerHTML = '<option value="">Select Specific Issue…</option>';
      svcPreview.textContent = 'Pick an issue to see the price.';
      svcAddBtn.disabled = true;
      if (!main || !tree[main] || tree[main][sub] === undefined) { subSubSel.disabled = true; return; }
      tree[main][sub].forEach((leaf, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${leaf.leaf} (₹${leaf.cost.toLocaleString('en-IN')})`;
        opt.dataset.id = leaf.id;
        opt.dataset.cost = leaf.cost;
        subSubSel.appendChild(opt);
      });
      subSubSel.disabled = false;
    };

    const onLeafChange = () => {
      const main = mainSel.value;
      const sub = subSel.value;
      const idx = subSubSel.value;
      if (idx === '' || !tree[main]?.[sub]?.[Number(idx)]) {
        svcPreview.textContent = 'Pick an issue to see the price.';
        svcAddBtn.disabled = true; return;
      }
      const leaf = tree[main][sub][Number(idx)];
      svcPreview.innerHTML = `Price: <b style="color:var(--primary)">₹${leaf.cost.toLocaleString('en-IN')}</b>`;
      svcAddBtn.disabled = false;
    };

    if (mainSel) {
      mainSel.onchange = fillSubs;
      subSel.onchange = fillSubSubs;
      subSubSel.onchange = onLeafChange;
      svcAddBtn.onclick = () => {
        const main = mainSel.value, sub = subSel.value, idx = subSubSel.value;
        const leaf = tree[main]?.[sub]?.[Number(idx)];
        if (!leaf) return;
        if (selectedServices.some(s => s.id === leaf.id)) {
          toast('Already added', 'warning');
          return;
        }
        selectedServices.push({ id: leaf.id, main, sub, leaf: leaf.leaf, cost: leaf.cost });
        renderSelectedList(); calcTotal(); renderPayStatus();
        // Reset leaf so the employee can add another quickly.
        subSubSel.value = ''; svcPreview.textContent = 'Pick an issue to see the price.'; svcAddBtn.disabled = true;
      };
    }

    // --- Live payment status panel + Save-button gating ---
    const payStatusBox = overlay.querySelector('#emp-pay-status');
    const payStatusIcon = overlay.querySelector('#emp-pay-status-icon');
    const payStatusTitle = overlay.querySelector('#emp-pay-status-title');
    const payStatusSub = overlay.querySelector('#emp-pay-status-sub');
    let _hasLinkBeenGenerated = false;
    let _paymentJustReceived = false;

    const renderPayStatus = () => {
      const resolving = statusSel.value === 'resolved' || statusSel.value === 'closed';
      const total = Number(totalDisplay.value) || 0;
      const requiresPayment = resolving && total > 0;
      const paid = paymentState.status === 'paid';

      if (paid) {
        payStatusBox.style.borderColor = 'var(--success)';
        payStatusBox.style.background = 'rgba(16,185,129,0.08)';
        payStatusIcon.innerHTML = ICONS.check;
        payStatusIcon.style.color = 'var(--success)';
        payStatusTitle.textContent = '✓ Payment Received';
        payStatusTitle.style.color = 'var(--success)';
        payStatusSub.textContent = paymentState.received_at
          ? `Received at ${formatTime(paymentState.received_at)} — you can now submit.`
          : 'You can now submit the resolution.';
      } else if (_hasLinkBeenGenerated) {
        payStatusBox.style.borderColor = 'var(--warning)';
        payStatusBox.style.background = 'rgba(245,158,11,0.06)';
        payStatusIcon.innerHTML = ICONS.clock;
        payStatusIcon.style.color = 'var(--warning)';
        payStatusTitle.textContent = '⏳ Waiting for Payment';
        payStatusTitle.style.color = 'var(--warning)';
        payStatusSub.textContent = 'Auto-checking every 3s — Save unlocks the moment Razorpay confirms.';
      } else {
        payStatusBox.style.borderColor = 'var(--border)';
        payStatusBox.style.background = 'var(--bg)';
        payStatusIcon.innerHTML = ICONS.clock;
        payStatusIcon.style.color = 'var(--text-dim)';
        payStatusTitle.textContent = `Payment: ${paymentState.status === 'paid' ? 'Paid' : 'Unpaid'}`;
        payStatusTitle.style.color = 'var(--text)';
        payStatusSub.textContent = requiresPayment
          ? 'Generate a link, then wait for the client to pay before submitting.'
          : 'Generate a link, then wait for the client to pay.';
      }

      if (requiresPayment && !paid) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Awaiting Payment…';
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.title = 'Payment must be detected automatically, or marked paid by admin, before you can submit a resolution.';
      } else {
        saveBtn.disabled = false;
        saveBtn.textContent = _paymentJustReceived ? '💰 Save & Resolve' : 'Save Changes';
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
        saveBtn.title = '';
      }
    };

    statusSel.onchange = () => {
      const resolving = statusSel.value === 'resolved' || statusSel.value === 'closed';
      pricingSec.style.display = resolving ? 'block' : 'none';
      const lockHint = overlay.querySelector('#bill-locked-hint');
      if (lockHint) lockHint.style.display = resolving ? 'none' : 'block';
      renderPayStatus();
    };
    extraInput.oninput = () => { calcTotal(); renderPayStatus(); };

    // Active auto-poller: asks the backend to verify Razorpay directly, then falls
    // back to the saved DB state if the gateway cannot be reached.
    const refreshPaymentFromDb = async (showToastOnChange) => {
      if (!inqId) return;
      let data = null;
      try {
        const token = localStorage.getItem('auth_token') || (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch('/api/payments/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ inquiry_id: inqId })
        });
        if (res.ok) data = await res.json();
      } catch {}
      if (!data) {
        const snap = await supabase.from('inquiries').select('payment_status,payment_received_at').eq('id', inqId).single();
        data = snap.data;
      }
      if (!data) return;
      const wasPaid = paymentState.status === 'paid';
      paymentState = { status: data.payment_status || 'unpaid', received_at: data.payment_received_at || null };
      if (!wasPaid && paymentState.status === 'paid') {
        _paymentJustReceived = true;
        showNotification({ title: '💰 Payment Received', body: 'You can now submit the resolution.', type: 'payment', tag: `pay-${inqId}` });
      } else if (showToastOnChange) {
        toast(paymentState.status === 'paid' ? 'Payment confirmed' : 'Still waiting for client to pay…', paymentState.status === 'paid' ? 'success' : 'info');
      }
      renderPayStatus();
    };

    // Manual re-check button (visible feedback for the employee).
    overlay.querySelector('#emp-pay-check').onclick = () => refreshPaymentFromDb(true);

    // Auto-poll every 3 seconds. Stops as soon as we see 'paid'.
    let pollTimer = null;
    const stopPolling = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
    const startPolling = () => {
      if (pollTimer || !inqId) return;
      pollTimer = setInterval(async () => {
        if (paymentState.status === 'paid') return stopPolling();
        await refreshPaymentFromDb(false);
      }, 3000);
    };
    if (paymentState.status !== 'paid') startPolling();

    // Live subscription: react instantly when Razorpay webhook fires.
    const channel = supabase.channel(`task-modal-${inqId || taskId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'inquiries',
        filter: inqId ? `id=eq.${inqId}` : '',
      }, (payload) => {
        const row = payload.new;
        if (!row) return;
        if (inqId && row.id !== inqId) return;
        const wasPaid = paymentState.status === 'paid';
        if (row.payment_status) paymentState.status = row.payment_status;
        if (row.payment_received_at) paymentState.received_at = row.payment_received_at;
        if (!wasPaid && paymentState.status === 'paid') {
          _paymentJustReceived = true;
          showNotification({
            title: '💰 Payment Received!',
            body: 'Client just paid. You can submit the resolution now.',
            type: 'payment',
            tag: `pay-${inqId}`,
          });
        }
        renderPayStatus();
      })
      .subscribe();

    // Initial paint.
    calcTotal();
    renderPayStatus();

    // Payment link generation + QR
    let _payLink = '';
    const genBtn = overlay.querySelector('#emp-gen-link');
    const payLinkInput = overlay.querySelector('#emp-pay-link');
    const qrWrap = overlay.querySelector('#emp-qr-wrap');
    const qrImg = overlay.querySelector('#emp-qr-img');
    const shareWaBtn = overlay.querySelector('#emp-share-wa');

    const showQR = (url) => {
      _payLink = url;
      payLinkInput.value = url;
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
      qrWrap.style.display = 'block';
      shareWaBtn.style.display = 'flex';
    };

    if (genBtn) {
      genBtn.onclick = async () => {
        const total = Number(totalDisplay.value) || 0;
        if (!total) { toast('Select services or enter a bill amount first', 'warning'); return; }

        const { data: inqData } = await supabase.from('inquiries').select('full_name,phone,service_item,ticket_no').eq('id', inqId).single();
        if (!inqData) { toast('Could not load inquiry details', 'error'); return; }

        genBtn.disabled = true; genBtn.textContent = '…';
        try {
          const token = localStorage.getItem('auth_token') || (await supabase.auth.getSession()).data.session?.access_token;
          const res = await fetch('/api/payments/create-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              amount: total,
              description: `Service: ${inqData.service_item}`,
              ticket_no: inqData.ticket_no,
              customer: { name: inqData.full_name, phone: inqData.phone }
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed');
          showQR(data.short_url);
          // Persist full bill breakdown so admin can render the same template.
          await supabase.from('inquiries').update({
            payment_link: data.short_url,
            payment_link_id: data.id || null,
            bill_amount: bill.servicesSubtotal + bill.extra,
            transport_km: bill.km,
            transport_fee: bill.transport,
            platform_fee: bill.platform,
            discount_amount: bill.discount,
            gst_amount: bill.gst,
            bill_total: bill.total,
            bill_generated_at: new Date().toISOString().slice(0,19).replace('T',' '),
            device_type: overlay.querySelector('#device-type')?.value.trim() || null,
            device_serial_no: overlay.querySelector('#device-serial')?.value.trim() || null,
            company_name: overlay.querySelector('#resolve-company')?.value.trim() || null,
          }).eq('id', inqId);
          _hasLinkBeenGenerated = true;
          renderPayStatus();
          toast('Payment link generated! Waiting for client to pay…', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          genBtn.disabled = false; genBtn.textContent = '✨ Generate';
        }
      };
    }

    // ── Premium Bill modal (PDF + WhatsApp share) ─────────────────────────
    const openBillBtn = overlay.querySelector('#open-bill-modal');
    if (openBillBtn) {
      openBillBtn.onclick = async () => {
        if (bill.total <= 0) { toast('Add services or charges first to generate a bill', 'warning'); return; }
        // Snapshot inquiry first so we send fresh data to the bill template.
        const { data: latestInq } = inqId
          ? await supabase.from('inquiries').select('*').eq('id', inqId).single()
          : { data: inquiryRow };
        const customer = latestInq || inquiryRow || {};
        const billData = {
          ...bill,
          customer: {
            name: customer.full_name || '',
            phone: customer.phone || '',
            location: customer.location || '',
            company: overlay.querySelector('#resolve-company')?.value.trim() || customer.company_name || '',
            device_type: overlay.querySelector('#device-type')?.value.trim() || customer.device_type || '',
            device_serial: overlay.querySelector('#device-serial')?.value.trim() || customer.device_serial_no || '',
            service_item: customer.service_item || '',
            ticket_no: customer.ticket_no || '',
          },
          technician: empProfile?.full_name || 'Technician',
          services: selectedServices.map(s => ({ name: `${s.main}${s.sub ? ' › '+s.sub : ''} › ${s.leaf}`, cost: s.cost })),
          extraReason: overlay.querySelector('#extra-reason')?.value.trim() || '',
          paymentLink: _payLink || customer.payment_link || '',
        };
        openPremiumBillModal(billData, {
          onSent: async () => {
            // After "Send via WhatsApp" — persist breakdown so admin sees it too.
            if (!inqId) return;
            await supabase.from('inquiries').update({
              bill_amount: bill.servicesSubtotal + bill.extra,
              transport_km: bill.km,
              transport_fee: bill.transport,
              platform_fee: bill.platform,
              discount_amount: bill.discount,
              gst_amount: bill.gst,
              bill_total: bill.total,
              bill_generated_at: new Date().toISOString().slice(0,19).replace('T',' '),
              device_type: billData.customer.device_type || null,
              device_serial_no: billData.customer.device_serial || null,
              company_name: billData.customer.company || null,
            }).eq('id', inqId);
          },
        });
      };
    }

    if (shareWaBtn) {
      shareWaBtn.onclick = () => {
        if (_payLink) window.open(`https://wa.me/?text=${encodeURIComponent('Please use this link to pay for your service: ' + _payLink)}`, '_blank');
      };
    }

    const closeOverlay = () => { stopPolling(); try { supabase.removeChannel(channel); } catch {} overlay.remove(); };
    overlay.querySelector('#cm').onclick = overlay.querySelector('#cm2').onclick = closeOverlay;
    overlay.querySelector('#save-update').onclick = async () => {
      const newStatus = statusSel.value;
      const detail = overlay.querySelector('#progress-detail').value.trim();
      
      if (!detail) { toast('Please provide details of your work', 'warning'); return; }

      const btn = overlay.querySelector('#save-update');
      btn.disabled = true; btn.textContent = 'Saving...';

      const selectedServiceIds = [];
      const resolving = newStatus === 'resolved' || newStatus === 'closed';
      if (resolving) {
        selectedServices.forEach(s => { selectedServiceIds.push(s.id); });
      }

      const { data: { user } } = await supabase.auth.getUser();
      const ops = [supabase.from('tickets').update({ status: newStatus }).eq('id', taskId)];

      const inqUpdates = { status: newStatus };
      const companyName = overlay.querySelector('#resolve-company')?.value.trim();
      const deviceType = overlay.querySelector('#device-type')?.value.trim();
      const deviceSerial = overlay.querySelector('#device-serial')?.value.trim();
      if (companyName) inqUpdates.company_name = companyName;
      if (deviceType) inqUpdates.device_type = deviceType;
      if (deviceSerial) inqUpdates.device_serial_no = deviceSerial;
      if (resolving && bill.total > 0) {
        inqUpdates.bill_amount = bill.servicesSubtotal + bill.extra;
        inqUpdates.extra_cost = bill.extra;
        inqUpdates.extra_cost_reason = overlay.querySelector('#extra-reason').value.trim() || null;
        inqUpdates.transport_km = bill.km;
        inqUpdates.transport_fee = bill.transport;
        inqUpdates.platform_fee = bill.platform;
        inqUpdates.discount_amount = bill.discount;
        inqUpdates.gst_amount = bill.gst;
        inqUpdates.bill_total = bill.total;
      }

      if (inqId) {
        ops.push(supabase.from('inquiries').update(inqUpdates).eq('id', inqId));
      } else {
        ops.push(supabase.from('inquiries').update(inqUpdates).eq('ticket_id', taskId));
      }

      // Add services linking
      if (inqId && selectedServiceIds.length > 0) {
        ops.push(supabase.from('inquiry_services').insert(
          selectedServiceIds.map(sid => ({ inquiry_id: inqId, service_id: sid }))
        ));
      }

      // Add progress detail as a comment
      ops.push(supabase.from('ticket_comments').insert({
        ticket_id: taskId,
        user_id: user.id,
        content: `[Status: ${newStatus.replace('_', ' ')}] ${detail}${resolving && bill.total > 0 ? ` (Bill: ₹${bill.total})` : ''}`
      }));

      await Promise.all(ops);
      toast('Task updated!', 'success');

      if (newStatus === 'resolved' || newStatus === 'closed') {
        // Show feedback link for the client to use
        const { data: inqRow } = inqId
          ? await supabase.from('inquiries').select('ticket_no,phone').eq('id', inqId).single()
          : await supabase.from('inquiries').select('ticket_no,phone').eq('ticket_id', taskId).single();

        if (inqRow?.ticket_no) {
          const feedbackUrl = `${window.location.origin}/?tab=track&ticket=${inqRow.ticket_no}&phone=${inqRow.phone || ''}`;
          const fbBox = overlay.querySelector('#feedback-link-box');
          const fbInput = overlay.querySelector('#feedback-url');
          const copyBtn = overlay.querySelector('#copy-feedback-url');
          const waBtn = overlay.querySelector('#share-feedback-wa');
          if (fbBox && fbInput) {
            fbInput.value = feedbackUrl;
            fbBox.style.display = 'block';
            copyBtn.onclick = () => { navigator.clipboard.writeText(feedbackUrl); toast('Copied!', 'success'); };
            waBtn.onclick = () => window.open(`https://wa.me/${(inqRow.phone || '').replace(/\D/g,'')}?text=${encodeURIComponent('Thank you for choosing our service! Please share your feedback here: ' + feedbackUrl)}`, '_blank');
            btn.disabled = false; btn.textContent = 'Done';
            return;
          }
        }
      }

      closeOverlay();
      onDone();
    };
  })();
}

function openLeaveModal(employeeId, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:450px">
      <div class="modal-header">
        <span class="modal-title">Submit Leave Request</span>
        <button class="modal-close" id="cl">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
          <div class="form-group"><label>Start Date</label><input type="date" id="l-start" required/></div>
          <div class="form-group"><label>End Date</label><input type="date" id="l-end" required/></div>
        </div>
        <div class="form-group">
          <label>Reason for Leave</label>
          <textarea id="l-reason" rows="4" placeholder="Explain your reason..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cl2">Cancel</button>
        <button class="btn btn-primary" id="btn-submit-leave">Submit Request</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cl').onclick = overlay.querySelector('#cl2').onclick = () => overlay.remove();
  
  overlay.querySelector('#btn-submit-leave').onclick = async () => {
    const start = overlay.querySelector('#l-start').value;
    const end = overlay.querySelector('#l-end').value;
    const reason = overlay.querySelector('#l-reason').value.trim();

    if (!start || !end || !reason) { toast('Please fill in all fields', 'warning'); return; }

    const btn = overlay.querySelector('#btn-submit-leave');
    btn.disabled = true; btn.textContent = 'Submitting...';

    const { error } = await supabase.from('leave_requests').insert({
      employee_id: employeeId,
      start_date: start,
      end_date: end,
      reason,
      status: 'pending'
    });

    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = 'Submit Request'; }
    else { toast('Leave request submitted!', 'success'); overlay.remove(); onDone(); }
  };
}
