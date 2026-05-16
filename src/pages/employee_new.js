import { supabase } from '../supabase.js';
import { toast, formatDate, formatTime, showNotification } from '../utils.js';
import { ICONS } from '../icons.js';

const LOGO_URL = new URL('../assets/logo.png', import.meta.url).href;

const BUSINESS = {
  name: 'Networking Experts',
  tagline: 'Service · Installation · Support',
  address: 'Srinagar, J&K, India',
  phone: '+91 8899133144',
  email: 'support@networkingexperts.in',
  gstin: '—',
};

function displayStatus(status) {
  return status === 'closed' ? 'resolved' : (status || 'open');
}

function statusText(status) {
  const shown = displayStatus(status);
  const labels = {
    pending: 'received',
    open: 'received',
    assigned: 'assigned',
    in_progress: 'in progress',
    resolved: 'resolved',
    issue_not_resolved: 'issue not resolved',
  };
  return labels[shown] || shown.replace('_', ' ');
}

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

/**
 * NEW: Bulletproof Bill Template
 * Uses simple table-based layout for everything to ensure 100% consistent 
 * rendering across all browsers and canvas capture engines.
 */
export function renderPremiumBillHTML(data) {
  const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const today = new Date();
  const issued = `${today.getDate().toString().padStart(2,'0')}/${(today.getMonth()+1).toString().padStart(2,'0')}/${today.getFullYear()}`;
  const billNo = `NX-${(data.customer?.ticket_no || Date.now()).toString().slice(-8)}`;
  
  const services = Array.isArray(data.services) ? data.services : [];
  const itemRows = services.map((s, i) => `
    <tr>
      <td style="padding:10px; border-bottom:1px solid #eee; text-align:center;">${i + 1}</td>
      <td style="padding:10px; border-bottom:1px solid #eee;">${esc(s.name)}</td>
      <td style="padding:10px; border-bottom:1px solid #eee; text-align:right;">${inr(s.cost)}</td>
    </tr>`).join('') || `<tr><td colspan="3" style="text-align:center;color:#9CA3AF;padding:18px;">No itemised services</td></tr>`;

  const extraRow = Number(data.extra) > 0 ? `
    <tr>
      <td style="padding:10px; border-bottom:1px solid #eee; text-align:center;">${services.length + 1}</td>
      <td style="padding:10px; border-bottom:1px solid #eee;">Additional charges ${data.extraReason ? `<small>(${esc(data.extraReason)})</small>` : ''}</td>
      <td style="padding:10px; border-bottom:1px solid #eee; text-align:right;">${inr(data.extra)}</td>
    </tr>` : '';

  return `
  <div style="width:794px; background:#ffffff; color:#1f2937; font-family:Arial, sans-serif; padding:40px; box-sizing:border-box;">
    <!-- Header Table -->
    <table style="width:100%; margin-bottom:40px;">
      <tr>
        <td style="vertical-align:top;">
          <img src="${LOGO_URL}" style="height:60px; margin-bottom:10px;" onerror="this.style.display='none'"/>
          <div style="font-size:24px; font-weight:bold; color:#10b981;">${BUSINESS.name}</div>
          <div style="font-size:14px; color:#6b7280;">${BUSINESS.tagline}</div>
        </td>
        <td style="text-align:right; vertical-align:top;">
          <div style="display:inline-block; background:#10b981; color:#ffffff; padding:6px 15px; border-radius:4px; font-weight:bold; font-size:14px; margin-bottom:10px;">TAX INVOICE</div>
          <div style="font-size:14px;">Bill #: <b>${esc(billNo)}</b></div>
          <div style="font-size:14px;">Date: <b>${issued}</b></div>
        </td>
      </tr>
    </table>

    <!-- Parties Table -->
    <table style="width:100%; margin-bottom:40px; border-bottom:1px solid #eee; padding-bottom:20px;">
      <tr>
        <td style="width:50%; vertical-align:top;">
          <div style="font-size:12px; text-transform:uppercase; color:#9ca3af; font-weight:bold; margin-bottom:8px;">Billed To</div>
          <div style="font-size:18px; font-weight:bold; margin-bottom:4px;">${esc(data.customer?.name || '—')}</div>
          <div style="font-size:14px; color:#4b5563;">${esc(data.customer?.phone || '')}</div>
          <div style="font-size:14px; color:#4b5563; margin-top:4px;">${esc(data.customer?.location || '')}</div>
        </td>
        <td style="width:50%; vertical-align:top;">
          <div style="font-size:12px; text-transform:uppercase; color:#9ca3af; font-weight:bold; margin-bottom:8px;">Service Details</div>
          <table style="font-size:14px; color:#4b5563;">
            <tr><td style="padding-right:10px;"><b>Ticket:</b></td><td>${esc(data.customer?.ticket_no || '—')}</td></tr>
            <tr><td style="padding-right:10px;"><b>Service:</b></td><td>${esc(data.customer?.service_item || '—')}</td></tr>
            ${data.customer?.device_type ? `<tr><td style="padding-right:10px;"><b>Device:</b></td><td>${esc(data.customer.device_type)}</td></tr>` : ''}
          </table>
        </td>
      </tr>
    </table>

    <!-- Items Table -->
    <table style="width:100%; border-collapse:collapse; margin-bottom:30px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:12px; border-bottom:2px solid #e5e7eb; width:50px; text-align:center;">#</th>
          <th style="padding:12px; border-bottom:2px solid #e5e7eb; text-align:left;">Description</th>
          <th style="padding:12px; border-bottom:2px solid #e5e7eb; text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${extraRow}
      </tbody>
    </table>

    <!-- Totals Area -->
    <table style="width:100%;">
      <tr>
        <td style="width:60%; vertical-align:top;">
          ${data.paymentLink ? `
            <div style="border:1px solid #e5e7eb; border-radius:8px; padding:15px; display:inline-block; background:#f9fafb;">
              <div style="font-size:14px; font-weight:bold; margin-bottom:10px; color:#10b981;">💳 Secure Payment</div>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(data.paymentLink)}" style="width:100px; height:100px;"/>
              <div style="font-size:11px; color:#6b7280; margin-top:8px;">Scan to pay via Razorpay</div>
            </div>
          ` : ''}
        </td>
        <td style="width:40%; vertical-align:top;">
           <div style="background:#10b981; color:#fff; font-weight:bold; text-align:center; padding:5px; border-radius:4px; margin-bottom:15px;">AMOUNT</div>
           <table style="width:100%; font-size:14px; color:#4b5563;">
             <tr><td style="padding:5px 0;">Subtotal</td><td style="text-align:right; font-weight:bold;">${inr(data.servicesSubtotal)}</td></tr>
             ${Number(data.extra) > 0 ? `<tr><td style="padding:5px 0;">Extra</td><td style="text-align:right; font-weight:bold;">${inr(data.extra)}</td></tr>` : ''}
             <tr><td style="padding:5px 0;">Platform fee</td><td style="text-align:right; font-weight:bold;">${inr(data.platform)}</td></tr>
             <tr><td style="padding:5px 0;">Transport</td><td style="text-align:right; font-weight:bold;">${inr(data.transport)}</td></tr>
             ${Number(data.discount) > 0 ? `<tr><td style="padding:5px 0; color:#10b981;">Discount</td><td style="text-align:right; font-weight:bold; color:#10b981;">−${inr(data.discount)}</td></tr>` : ''}
             <tr><td style="padding:10px 0; border-top:1px solid #eee; font-weight:bold; color:#111827;">Total Payable</td><td style="padding:10px 0; border-top:1px solid #eee; text-align:right; font-size:20px; font-weight:bold; color:#10b981;">${inr(data.total)}</td></tr>
           </table>
        </td>
      </tr>
    </table>

    <!-- Footer -->
    <div style="margin-top:60px; border-top:1px solid #eee; padding-top:20px; text-align:center;">
      <div style="font-size:14px; font-weight:bold; color:#4b5563; margin-bottom:5px;">Thank you for your business!</div>
      <div style="font-size:11px; color:#9ca3af;">
        ${BUSINESS.address} · ${BUSINESS.phone} · ${BUSINESS.email}<br/>
        This is a computer generated invoice and does not require a physical signature.
      </div>
    </div>
  </div>`;
}

/**
 * NEW: Isolated PDF Generation
 * This function bypasses the app's CSS entirely by creating a temporary, 
 * clean container and using explicit canvas dimensions.
 */
async function renderBillToPdfBlob(billHTML, filename) {
  const html2pdf = await loadHtml2Pdf();
  
  // 1. Create a hidden, isolated container with fixed width
  const sandbox = document.createElement('div');
  sandbox.style.position = 'absolute';
  sandbox.style.left = '-9999px';
  sandbox.style.top = '0';
  sandbox.style.width = '794px';
  sandbox.style.background = '#ffffff';
  sandbox.innerHTML = billHTML;
  document.body.appendChild(sandbox);

  try {
    // 2. Wait for images to be ready
    const imgs = [...sandbox.querySelectorAll('img')];
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 2000); });
    }));

    // 3. Render using highly specific dimensions
    const options = {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: {
        scale: 2,           // Sharp quality
        useCORS: true,      // Allow cross-origin images (QR codes)
        width: 794,         // Lock canvas width
        windowWidth: 794,   // Force browser to "think" the window is 794px wide
        backgroundColor: '#ffffff',
        logging: false
      },
      jsPDF: { 
        unit: 'px', 
        format: [794, 1123], // Exact A4 pixel dimensions at 96 DPI
        orientation: 'portrait'
      }
    };

    const blob = await html2pdf().set(options).from(sandbox).outputPdf('blob');
    return { blob };
  } finally {
    // 4. Cleanup
    document.body.removeChild(sandbox);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const r = String(fr.result || '');
      resolve(r.includes(',') ? r.slice(r.indexOf(',') + 1) : r);
    };
    fr.onerror = () => reject(fr.error || new Error('Could not read PDF blob'));
    fr.readAsDataURL(blob);
  });
}

async function uploadBillPdf(blob, filename, inquiry_id) {
  const dataBase64 = await blobToBase64(blob);
  const token = localStorage.getItem('auth_token');
  const res = await fetch('/api/bills/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ dataBase64, filename, inquiry_id: inquiry_id || null }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Upload failed');
  }
  const { url } = await res.json();
  return url;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function billShortCaption(data, pdfUrl) {
  const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
  const lines = [
    `Hi ${data.customer?.name || ''}! 👋`,
    `Your service invoice from *${BUSINESS.name}* is ready.`,
    `Ticket: *${data.customer?.ticket_no || '—'}* · Total: *${inr(data.total)}*`,
  ];
  if (pdfUrl) lines.push('', `📄 View / download bill PDF:`, pdfUrl);
  if (data.paymentLink) lines.push('', `💳 Pay here: ${data.paymentLink}`);
  lines.push('', `— ${BUSINESS.name}`);
  return lines.join('\n');
}

export function openPremiumBillModal(data, opts = {}) {
  const { onSent, allowShare = true, title = '📄 Service Invoice Preview', inquiryId = null } = opts;
  const billHTML = renderPremiumBillHTML(data);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card modal-large">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" id="pb-close">✕</button>
      </div>
      <div class="modal-body" style="background:#F8FAFC; padding:20px; overflow-y:auto; max-height:calc(100vh - 200px);">
        <div id="bill-preview-wrap" style="background:white; box-shadow:0 10px 25px rgba(0,0,0,0.05); margin:0 auto; transform:scale(0.8); transform-origin:top center; width:794px;">
          ${billHTML}
        </div>
      </div>
      <div class="modal-footer" style="gap:12px; justify-content:center;">
        <button class="btn btn-secondary" id="pb-cancel">Close</button>
        <button class="btn btn-secondary" id="pb-download">📥 Download PDF</button>
        ${allowShare ? `<button class="btn btn-primary" id="pb-whatsapp" style="background:#25D366; border:none; box-shadow:0 4px 12px rgba(37,211,102,0.3);"><span>📱 Send via WhatsApp</span></button>` : ''}
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#pb-close').onclick = close;
  overlay.querySelector('#pb-cancel').onclick = close;

  const filename = `Invoice-${data.customer?.ticket_no || 'service'}.pdf`;

  overlay.querySelector('#pb-download').onclick = async () => {
    const btn = overlay.querySelector('#pb-download');
    btn.disabled = true; btn.textContent = '… preparing PDF';
    try {
      const { blob } = await renderBillToPdfBlob(billHTML, filename);
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
      const phone = (data.customer?.phone || '').replace(/\D/g, '');
      if (!phone) {
        toast('Client phone number missing', 'error');
        btn.disabled = false;
        return;
      }

      try {
        btn.innerHTML = `<span>… preparing PDF</span>`;
        const { blob } = await renderBillToPdfBlob(billHTML, filename);
        btn.innerHTML = `<span>… uploading bill</span>`;
        const pdfUrl = await uploadBillPdf(blob, filename, inquiryId);

        const caption = billShortCaption(data, pdfUrl);
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(caption)}`, '_blank');

        toast('WhatsApp opened!', 'success');
        if (typeof onSent === 'function') await onSent(pdfUrl);
      } catch (err) {
        console.error(err);
        toast('Failed to send WhatsApp', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>📱 Send via WhatsApp</span>';
      }
    };
  }
}
