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
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const today = new Date();
  const issued = `${today.getDate().toString().padStart(2,'0')}/${(today.getMonth()+1).toString().padStart(2,'0')}/${today.getFullYear()}`;
  const billNo = `NX-${(data.customer?.ticket_no || Date.now()).toString().slice(-8)}`;
  
  const services = Array.isArray(data.services) ? data.services : [];
  const itemRows = services.map((s, i) => `
    <tr>
      <td style="padding:10px; border-bottom:1px solid #eee; color:#9CA3AF; width:30px;">${i + 1}</td>
      <td style="padding:10px; border-bottom:1px solid #eee; color:#1F2937;">${esc(s.name)}</td>
      <td style="padding:10px; border-bottom:1px solid #eee; color:#0F172A; text-align:right; font-weight:700;">${inr(s.cost)}</td>
    </tr>`).join('') || `<tr><td colspan="3" style="text-align:center;color:#9CA3AF;padding:20px;">No itemised services</td></tr>`;

  const extraRow = Number(data.extra) > 0 ? `
    <tr>
      <td style="padding:10px; border-bottom:1px solid #eee; color:#9CA3AF;">${services.length + 1}</td>
      <td style="padding:10px; border-bottom:1px solid #eee; color:#1F2937;">Additional charges${data.extraReason ? ` <small style="color:#6B7280">(${esc(data.extraReason)})</small>` : ''}</td>
      <td style="padding:10px; border-bottom:1px solid #eee; color:#0F172A; text-align:right; font-weight:700;">${inr(data.extra)}</td>
    </tr>` : '';

  return `
  <div class="premium-bill" id="premium-bill-print" style="font-family:Arial, sans-serif !important; background:#ffffff !important; color:#0F172A !important; padding:40px !important; width:794px !important; box-sizing:border-box !important;">
    <div class="pb-header" style="display:flex !important; flex-direction:row !important; justify-content:space-between !important; align-items:center !important; border-bottom:1px dashed #eee !important; padding-bottom:20px !important; margin-bottom:20px !important;">
      <div class="pb-brand" style="display:flex !important; align-items:center !important; gap:12px !important;">
        <img src="${LOGO_URL}" alt="${BUSINESS.name}" style="width:50px; height:50px; object-fit:contain;" onerror="this.style.display='none'"/>
        <div>
          <div style="font-size:20px; font-weight:800; color:#064E3B;">${BUSINESS.name}</div>
          <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:1px;">${BUSINESS.tagline}</div>
        </div>
      </div>
      <div class="pb-meta" style="text-align:right !important;">
        <div style="display:inline-block; background:#10B981; color:#fff; padding:4px 12px; border-radius:20px; font-size:10px; font-weight:800; margin-bottom:8px;">TAX INVOICE</div>
        <div style="font-size:12px; color:#4B5563;">Bill # <b style="color:#0F172A;">${esc(billNo)}</b></div>
        <div style="font-size:12px; color:#4B5563;">Date: <b style="color:#0F172A;">${issued}</b></div>
      </div>
    </div>

    <div class="pb-parties" style="display:grid !important; grid-template-columns:1fr 1fr !important; gap:30px !important; margin-bottom:20px !important; border-bottom:1px dashed #eee !important; padding-bottom:20px !important;">
      <div>
        <div style="font-size:10px; font-weight:800; color:#10B981; text-transform:uppercase; margin-bottom:6px;">Billed To</div>
        <div style="font-size:16px; font-weight:800; color:#0F172A;">${esc(data.customer?.name || '—')}</div>
        <div style="font-size:13px; color:#4B5563;">${esc(data.customer?.phone || '')}</div>
        ${data.customer?.company ? `<div style="font-size:13px; color:#4B5563;">${esc(data.customer.company)}</div>` : ''}
        <div style="font-size:13px; color:#6B7280; font-style:italic;">${esc(data.customer?.location || '')}</div>
      </div>
      <div>
        <div style="font-size:10px; font-weight:800; color:#10B981; text-transform:uppercase; margin-bottom:6px;">Service Details</div>
        <div style="font-size:13px; color:#4B5563;"><b>Ticket:</b> ${esc(data.customer?.ticket_no || '—')}</div>
        <div style="font-size:13px; color:#4B5563;"><b>Service:</b> ${esc(data.customer?.service_item || '—')}</div>
        ${data.customer?.device_type ? `<div style="font-size:13px; color:#4B5563;"><b>Device:</b> ${esc(data.customer.device_type)}</div>` : ''}
        ${data.technician ? `<div style="font-size:13px; color:#4B5563;"><b>Technician:</b> ${esc(data.technician)}</div>` : ''}
      </div>
    </div>

    <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
      <thead>
        <tr style="background:#f9fafb; border-bottom:2px solid #10B981;">
          <th style="padding:12px; text-align:left; font-size:11px; color:#064E3B; text-transform:uppercase; width:30px;">#</th>
          <th style="padding:12px; text-align:left; font-size:11px; color:#064E3B; text-transform:uppercase;">Description</th>
          <th style="padding:12px; text-align:right; font-size:11px; color:#064E3B; text-transform:uppercase;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}${extraRow}</tbody>
    </table>

    <div style="margin-left:auto; width:300px; background:#f9fafb; padding:15px; border-radius:12px;">
      <div style="display:inline-block; background:#10B981; color:#fff; padding:3px 10px; border-radius:15px; font-size:9px; font-weight:800; margin-bottom:12px;">AMOUNT BREAKDOWN</div>
      <table style="width:100%; border-collapse:collapse; font-size:13px; color:#374151;">
        <tr><td style="padding:4px 0;">Services subtotal</td><td style="text-align:right; font-weight:700; color:#0F172A;">${inr(data.servicesSubtotal)}</td></tr>
        ${Number(data.extra) > 0 ? `<tr><td style="padding:4px 0;">Extra charges</td><td style="text-align:right; font-weight:700; color:#0F172A;">${inr(data.extra)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;">Platform fee</td><td style="text-align:right; font-weight:700; color:#0F172A;">${inr(data.platform)}</td></tr>
        <tr><td style="padding:4px 0;">Transport</td><td style="text-align:right; font-weight:700; color:#0F172A;">${inr(data.transport)}</td></tr>
        ${Number(data.discount) > 0 ? `<tr><td style="padding:4px 0; color:#059669;">Discount</td><td style="text-align:right; font-weight:700; color:#059669;">−${inr(data.discount)}</td></tr>` : ''}
        <tr style="border-top:1px solid #eee;"><td style="padding:6px 0; font-weight:700;">Taxable</td><td style="text-align:right; font-weight:700; color:#0F172A;">${inr(data.taxable)}</td></tr>
        <tr><td style="padding:4px 0;">GST (18%)</td><td style="text-align:right; font-weight:700; color:#0F172A;">${inr(data.gst)}</td></tr>
        <tr style="border-top:2px solid #10B981; font-size:16px;"><td style="padding:10px 0; font-weight:800; color:#064E3B;">Total</td><td style="text-align:right; font-weight:900; color:#10B981;">${inr(data.total)}</td></tr>
      </table>
    </div>

    ${data.paymentLink ? `
      <div style="margin-top:20px; padding:20px; border:1px dashed #10B981; border-radius:12px; text-align:center; background:rgba(16,185,129,0.02);">
        <div style="font-weight:800; font-size:11px; color:#064E3B; text-transform:uppercase; margin-bottom:10px;">💳 Secure Payment</div>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.paymentLink)}" style="width:120px; height:120px; margin:0 auto 10px; display:block; border-radius:8px;"/>
        <div style="font-size:11px; color:#2563EB; word-break:break-all;">${esc(data.paymentLink)}</div>
      </div>` : ''}

    <div style="margin-top:30px; padding-top:20px; border-top:1px dashed #eee; text-align:center;">
      <div style="font-weight:800; color:#10B981; font-size:14px;">Thank you for your business!</div>
      <div style="font-size:11px; color:#6B7280; margin-top:5px;">
        ${BUSINESS.address} · ${BUSINESS.phone} · ${BUSINESS.email}
      </div>
      <div style="font-size:10px; color:#9CA3AF; margin-top:5px;">GSTIN: ${BUSINESS.gstin} · Computer Generated Invoice</div>
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
    node.style.display = 'block';
    node.style.overflow = 'visible';
    node.style.position = 'relative';

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
        windowWidth: 1024,
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