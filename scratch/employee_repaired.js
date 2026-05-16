import { supabase } from '../supabase.js';
import { toast, formatDate, formatTime, showNotification } from '../utils.js';
import { ICONS } from '../icons.js';

const LOGO_URL = new URL('../assets/logo.png', import.meta.url).href;

// Business info shown on every premium bill.
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
export function renderPremiumBillHTML(data) {
  const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = new Date();
  const issued = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
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
  <div class="premium-bill" id="premium-bill-print" style="font-family:Arial, sans-serif !important;">
    <div class="pb-header" style="display:flex !important; flex-direction:row !important; justify-content:space-between !important; align-items:center !important;">
      <div class="pb-brand" style="display:flex !important; align-items:center !important; gap:12px !important;">
        <img src="${LOGO_URL}" alt="${BUSINESS.name}" class="pb-logo" onerror="this.style.display='none'"/>
        <div>
          <div class="pb-biz-name">${BUSINESS.name}</div>
          <div class="pb-biz-sub">${BUSINESS.tagline}</div>
        </div>
      </div>
      <div class="pb-meta" style="text-align:right !important;">
        <div class="pb-stamp">TAX INVOICE</div>
        <div class="pb-bill-no">Bill # <b>${esc(billNo)}</b></div>
        <div class="pb-bill-date">Date: <b>${issued}</b></div>
      </div>
    </div>

    <div class="pb-parties" style="display:grid !important; grid-template-columns:1fr 1fr !important; gap:24px !important; border-bottom:1px dashed #eee !important; padding-bottom:15px !important; margin-bottom:15px !important;">
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
      <div class="pb-stamp" style="margin-bottom:12px; background:#10B981; color:#fff;">AMOUNT</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px; color:#374151;">
        <tr><td style="padding:4px 0;">Services subtotal</td><td style="text-align:right; font-weight:800;">${inr(data.servicesSubtotal)}</td></tr>
        ${Number(data.extra) > 0 ? `<tr><td style="padding:4px 0;">Additional charges</td><td style="text-align:right; font-weight:800;">${inr(data.extra)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;">Platform fee</td><td style="text-align:right; font-weight:800;">${inr(data.platform)}</td></tr>
        <tr><td style="padding:4px 0;">Transport (${Number(data.km || 0).toFixed(1)} km × ₹5)</td><td style="text-align:right; font-weight:800;">${inr(data.transport)}</td></tr>
        ${Number(data.discount) > 0 ? `<tr><td style="padding:4px 0; color:#10B981;">Loyalty discount</td><td style="text-align:right; font-weight:800; color:#10B981;">−${inr(data.discount)}</td></tr>` : ''}
        <tr><td style="padding:4px 0; border-top:1px solid #eee;">Taxable amount</td><td style="text-align:right; font-weight:800; border-top:1px solid #eee;">${inr(data.taxable)}</td></tr>
        <tr><td style="padding:4px 0;">GST @ 18%</td><td style="text-align:right; font-weight:800;">${inr(data.gst)}</td></tr>
        <tr style="font-size:16px; color:#064E3B;"><td style="padding:8px 0; font-weight:800;">Total Payable</td><td style="text-align:right; font-weight:800; color:#10B981;">${inr(data.total)}</td></tr>
      </table>
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


// Render the bill HTML to a PDF Blob.
async function renderBillToPdfBlob(billHTML, filename) {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:794px',
    'min-height:1123px',
    'background:#ffffff',
    'pointer-events:none',
    'z-index:2147483647',
  ].join(';');

  const sandbox = document.createElement('div');
  sandbox.style.cssText = 'width:794px;min-height:1123px;background:#ffffff;padding:0;box-sizing:border-box;';
  sandbox.innerHTML = billHTML;
  wrapper.appendChild(sandbox);
  document.body.appendChild(wrapper);

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise(r => setTimeout(r, 50));

  const imgs = [...sandbox.querySelectorAll('img')];
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 2500);
    });
  }));

  try {
    const html2pdf = await loadHtml2Pdf();
    const node = sandbox.firstElementChild;
    node.classList.add('pdf-rendering');
    node.style.width = '794px';
    node.style.maxWidth = '794px';
    node.style.minHeight = '1123px';

    const blob = await html2pdf().set({
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794,
        width: 794,
        height: sandbox.offsetHeight,
        scrollX: 0,
        scrollY: 0,
      },
      jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait', hotfixes: ['px_scaling'] },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(sandbox).outputPdf('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });
    return { blob, file };
  } finally {
    wrapper.remove();
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
        <h3>${title}</h3>
        <button class="btn-icon" id="pb-close">${ICONS.close}</button>
      </div>
      <div class="modal-body" style="background:#F8FAFC; padding:30px;">
        <div id="bill-preview-container" style="background:white; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1); border-radius:8px; overflow:hidden;">
          ${billHTML}
        </div>
      </div>
      <div class="modal-footer" style="gap:12px;">
        <button class="btn btn-secondary" id="pb-cancel">Close</button>
        <button class="btn btn-secondary" id="pb-download">📥 Download PDF</button>
        ${allowShare ? `<button class="btn btn-primary" id="pb-whatsapp"><span>📱 Send via WhatsApp</span></button>` : ''}
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
      const originalHTML = btn.innerHTML;
      const phone = (data.customer?.phone || '').replace(/\D/g, '');
      if (!phone) {
        toast('Client phone number is missing on this inquiry', 'error');
        btn.disabled = false; btn.innerHTML = originalHTML;
        return;
      }

      try {
        btn.innerHTML = `<span>… preparing PDF</span>`;
        const { blob } = await renderBillToPdfBlob(billHTML, filename);

        btn.innerHTML = `<span>… uploading bill</span>`;
        const pdfUrl = await uploadBillPdf(blob, filename, inquiryId);

        const caption = billShortCaption(data, pdfUrl);
        const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(caption)}`;
        window.open(waUrl, '_blank');

        toast('WhatsApp opened with PDF link — send the message to the client.', 'success');
        if (typeof onSent === 'function') {
          try { await onSent(pdfUrl); } catch { }
        }
      } catch (err) {
        console.error(err);
        toast(err.message || 'Could not send bill', 'error');
      } finally {
        btn.disabled = false; btn.innerHTML = originalHTML;
      }
    };
  }
}