import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime, formatTime, showNotification } from '../utils.js';
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

// Lazily inject PDF renderer libraries. Try the html2pdf bundle first, then
// load html2canvas + jsPDF separately if a CDN blocks one of the files.
let _html2pdfPromise = null;
function loadScriptFromSources(sources) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      const src = sources[i++];
      if (!src) return reject(new Error('Could not load PDF library'));
      const existing = document.querySelector(`script[data-pdf-src="${src}"]`);
      if (existing?.dataset.loaded === 'true') return resolve();
      const s = existing || document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.pdfSrc = src;
      s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
      s.onerror = () => {
        s.remove();
        tryNext();
      };
      if (!existing) document.head.appendChild(s);
    };
    tryNext();
  });
}

function loadHtml2Pdf() {
  if (window.html2canvas && (window.jspdf?.jsPDF || window.jsPDF)) {
    return Promise.resolve({ html2canvas: window.html2canvas, jsPDF: window.jspdf?.jsPDF || window.jsPDF });
  }
  if (_html2pdfPromise) return _html2pdfPromise;
  _html2pdfPromise = (async () => {
    await loadScriptFromSources([
      'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
      'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
      'https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
    ]).catch(() => {});

    if (!window.html2canvas) {
      await loadScriptFromSources([
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
        'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js',
      ]);
    }

    if (!(window.jspdf?.jsPDF || window.jsPDF)) {
      await loadScriptFromSources([
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
        'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
      ]);
    }

    const html2canvas = window.html2canvas;
    const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
    if (!html2canvas || !JsPDF) {
      throw new Error('PDF renderer did not load correctly');
    }
    return { html2canvas, jsPDF: JsPDF };
  })().catch(err => {
    _html2pdfPromise = null;
    throw err;
  });
  return _html2pdfPromise;
}

// Premium printable bill template, used by employee + admin.
export function renderPremiumBillHTML(data) {
  // Ultra-robust currency formatter — avoids toLocaleString to prevent potential JS errors in older browsers.
  const inr = (n) => {
    const val = Math.round(Number(n) || 0);
    return '₹' + val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const today = new Date();
  const issued = `${today.getDate().toString().padStart(2,'0')}/${(today.getMonth()+1).toString().padStart(2,'0')}/${today.getFullYear()}`;
  const billNo = `NX-${(data.customer?.ticket_no || Date.now()).toString().slice(-8)}`;
  
  const services = Array.isArray(data.services) ? data.services : [];
  const itemRows = services.map((s, i) => `
    <tr style="display:table-row !important;">
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#9CA3AF; width:30px;">${i + 1}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#1F2937;">${esc(s.name)}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#0F172A; text-align:right; font-weight:700;">${inr(s.cost)}</td>
    </tr>`).join('') || `<tr style="display:table-row !important;"><td colspan="3" style="display:table-cell !important; text-align:center;color:#9CA3AF;padding:20px;">No itemised services</td></tr>`;

  const extraRow = Number(data.extra) > 0 ? `
    <tr style="display:table-row !important;">
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#9CA3AF;">${services.length + 1}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#1F2937;">Additional charges${data.extraReason ? ` <small style="color:#6B7280">(${esc(data.extraReason)})</small>` : ''}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#0F172A; text-align:right; font-weight:700;">${inr(data.extra)}</td>
    </tr>` : '';

  return `
  <div class="premium-bill" id="premium-bill-print" style="font-family:Arial, sans-serif !important; background:#ffffff !important; color:#0F172A !important; padding:40px !important; width:794px !important; box-sizing:border-box !important; display:block !important; visibility:visible !important; opacity:1 !important;">
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

    <table style="width:100% !important; border-collapse:collapse !important; margin-bottom:20px !important; display:table !important;">
      <thead>
        <tr style="background:#f9fafb; border-bottom:2px solid #10B981; display:table-row !important;">
          <th style="display:table-cell !important; padding:12px; text-align:left; font-size:11px; color:#064E3B; text-transform:uppercase; width:30px;">#</th>
          <th style="display:table-cell !important; padding:12px; text-align:left; font-size:11px; color:#064E3B; text-transform:uppercase;">Description</th>
          <th style="display:table-cell !important; padding:12px; text-align:right; font-size:11px; color:#064E3B; text-transform:uppercase;">Amount</th>
        </tr>
      </thead>
      <tbody style="display:table-row-group !important;">${itemRows}${extraRow}</tbody>
    </table>

    <div style="margin-left:auto; width:300px; background:#f9fafb; padding:15px; border-radius:12px; display:block !important;">
      <div style="display:inline-block; background:#10B981; color:#fff; padding:3px 10px; border-radius:15px; font-size:9px; font-weight:800; margin-bottom:12px;">AMOUNT BREAKDOWN</div>
      <table style="width:100% !important; border-collapse:collapse !important; font-size:13px !important; color:#374151 !important; display:table !important;">
        <tr style="display:table-row !important;"><td style="display:table-cell !important; padding:4px 0;">Services subtotal</td><td style="display:table-cell !important; text-align:right; font-weight:700; color:#0F172A;">${inr(data.servicesSubtotal)}</td></tr>
        ${Number(data.extra) > 0 ? `<tr style="display:table-row !important;"><td style="display:table-cell !important; padding:4px 0;">Extra charges</td><td style="display:table-cell !important; text-align:right; font-weight:700; color:#0F172A;">${inr(data.extra)}</td></tr>` : ''}
        <tr style="display:table-row !important;"><td style="display:table-cell !important; padding:4px 0;">Platform fee</td><td style="display:table-cell !important; text-align:right; font-weight:700; color:#0F172A;">${inr(data.platform)}</td></tr>
        <tr style="display:table-row !important;"><td style="display:table-cell !important; padding:4px 0;">Transport</td><td style="display:table-cell !important; text-align:right; font-weight:700; color:#0F172A;">${inr(data.transport)}</td></tr>
        ${Number(data.discount) > 0 ? `<tr style="display:table-row !important;"><td style="display:table-cell !important; padding:4px 0; color:#059669;">Discount</td><td style="display:table-cell !important; text-align:right; font-weight:700; color:#059669;">−${inr(data.discount)}</td></tr>` : ''}
        <tr style="display:table-row !important; border-top:1px solid #eee !important;"><td style="display:table-cell !important; padding:6px 0; font-weight:700;">Taxable</td><td style="display:table-cell !important; text-align:right; font-weight:700; color:#0F172A;">${inr(data.taxable)}</td></tr>
        <tr style="display:table-row !important;"><td style="display:table-cell !important; padding:4px 0;">GST (18%)</td><td style="display:table-cell !important; text-align:right; font-weight:700; color:#0F172A;">${inr(data.gst)}</td></tr>
        <tr style="display:table-row !important; border-top:2px solid #10B981 !important; font-size:16px !important;"><td style="display:table-cell !important; padding:10px 0; font-weight:800; color:#064E3B;">Total</td><td style="display:table-cell !important; text-align:right; font-weight:900; color:#10B981;">${inr(data.total)}</td></tr>
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
  wrapper.classList.add('pdf-rendering');
  wrapper.style.width = '794px';
  wrapper.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    'width:794px',
    'min-height:1123px',
    'background:#ffffff',
    'pointer-events:none',
    'z-index:-1',
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
    const { html2canvas, jsPDF: JsPDF } = await loadHtml2Pdf();

    const node = sandbox.firstElementChild;
    node.style.display = 'block';
    node.style.overflow = 'visible';
    node.style.position = 'relative';
    node.style.width = '794px';
    node.style.maxWidth = '794px';
    node.style.minHeight = '1123px';

    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794,
      width: 794,
      height: node.scrollHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new JsPDF({
      unit: 'px',
      format: [794, 1123],
      orientation: 'portrait',
      hotfixes: ['px_scaling'],
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 1.0);

    let remainingHeight = imgHeight;
    let y = 0;
    pdf.addImage(imgData, 'JPEG', 0, y, imgWidth, imgHeight, undefined, 'FAST');
    remainingHeight -= pageHeight;

    while (remainingHeight > 0) {
      y -= pageHeight;
      pdf.addPage([794, 1123], 'portrait');
      pdf.addImage(imgData, 'JPEG', 0, y, imgWidth, imgHeight, undefined, 'FAST');
      remainingHeight -= pageHeight;
    }

    const blob = pdf.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });
    return { blob, file };
  } finally {
    wrapper.remove();
  }
}

function openBillPrintWindow(billHTML, filename) {
  const printWindow = window.open('', '_blank', 'width=900,height=1200');
  if (!printWindow) {
    throw new Error('Allow popups to print or save this bill as PDF');
  }
  printWindow.opener = null;

  const safeTitle = String(filename || 'invoice.pdf').replace(/[<>&"]/g, '');
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-shell { width: 794px; min-height: 1123px; background: #ffffff; }
    @media print {
      body { display: block; }
      .print-shell { width: 100%; min-height: auto; }
    }
  </style>
</head>
<body>
  <div class="print-shell">${billHTML}</div>
  <script>
    const finish = () => setTimeout(() => window.print(), 150);
    const images = Array.from(document.images || []);
    if (!images.length) finish();
    else Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
      setTimeout(resolve, 2500);
    }))).then(finish);
  </script>
</body>
</html>`);
  printWindow.document.close();
}

function fitBillPreview(overlay) {
  const stage = overlay.querySelector('#bill-preview-stage');
  const container = overlay.querySelector('#bill-preview-container');
  const body = overlay.querySelector('.modal-body');
  if (!stage || !container || !body) return;

  container.style.transform = 'scale(1)';
  stage.style.height = 'auto';

  const availableWidth = Math.max(260, body.clientWidth - 16);
  const scale = Math.min(1, availableWidth / 794);
  container.style.transform = `scale(${scale})`;
  stage.style.height = `${container.offsetHeight * scale}px`;
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
  overlay.className = 'modal-overlay premium-bill-modal';
  overlay.innerHTML = `
    <div class="modal-card modal-large">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="btn-icon" id="pb-close">${ICONS.close}</button>
      </div>
      <div class="modal-body" style="background:#F8FAFC; padding:20px; overflow-x:auto;">
        <div id="bill-preview-stage" style="width:100%; display:flex; justify-content:center;">
          <div id="bill-preview-container" style="background:white; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1); border-radius:8px; width:794px; margin:0 auto; transform-origin: top center;">
            ${billHTML}
          </div>
        </div>
      </div>
      <div class="modal-footer" style="gap:12px;">
        <button class="btn btn-secondary" id="pb-cancel">Close</button>
        <button class="btn btn-secondary" id="pb-print">Print / Save PDF</button>
        <button class="btn btn-secondary" id="pb-download">📥 Download PDF</button>
        ${allowShare ? `<button class="btn btn-primary" id="pb-whatsapp"><span>📱 Send via WhatsApp</span></button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#pb-close').onclick = close;
  overlay.querySelector('#pb-cancel').onclick = close;
  requestAnimationFrame(() => fitBillPreview(overlay));
  const onResize = () => fitBillPreview(overlay);
  window.addEventListener('resize', onResize);
  const closeBillModal = () => {
    window.removeEventListener('resize', onResize);
    close();
  };
  overlay.querySelector('#pb-close').onclick = closeBillModal;
  overlay.querySelector('#pb-cancel').onclick = closeBillModal;

  const filename = `Invoice-${data.customer?.ticket_no || 'service'}.pdf`;

  overlay.querySelector('#pb-print').onclick = () => {
    try {
      openBillPrintWindow(billHTML, filename);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not open print window', 'error');
    }
  };

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

function byNewestCreated(a, b) {
  const aDate = a?.created_at || a?.inquiries?.[0]?.created_at || 0;
  const bDate = b?.created_at || b?.inquiries?.[0]?.created_at || 0;
  return new Date(bDate) - new Date(aDate);
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
      supabase.from('inquiries').select('*').eq('assigned_employee_id', user.id).in('assignment_status', ['pending', 'accepted']).order('created_at', { ascending: false }),
    ]);
    attendance = res[0].data; tasks = res[1].data; eodReport = res[2].data;
    const allInquiries = res[3].data || [];
    const taskInquiryIds = new Set((tasks || []).map(task => task.inquiries?.[0]?.id).filter(Boolean));

    // Build phone → company map for labelling service jobs

    pendingInquiries = allInquiries.filter(x => x.assignment_status === 'pending').sort(byNewestCreated);
    acceptedInquiries = allInquiries
      .filter(x => x.assignment_status === 'accepted' && !taskInquiryIds.has(x.id) && !['resolved', 'closed'].includes(x.status))
      .sort(byNewestCreated)
      .map(x => ({ ...x, _company: x.company_name || null }));
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger);display:inline-flex;align-items:center;gap:8px;">${ICONS.alert}<span>Error</span></h3><p>${err.message}</p></div></div>`;
    return;
  }

  const t = tasks || [];
  const activeTasks = t.filter(x => {
    const status = displayStatus(x.status);
    if (status === 'resolved') return false;
    const inq = x.inquiries?.[0];
    if (!inq) return status === 'assigned' || status === 'in_progress' || status === 'open';
    return inq.assignment_status === 'accepted' && displayStatus(inq.status) !== 'resolved';
  });
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
          <span>${activeTasks.length + acceptedInquiries.length}</span>
        </div>
        <div class="stat-label">Active Tasks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-inline" style="color:var(--success)">
          <span style="width:24px; height:24px; display:flex;">${ICONS.check}</span>
          <span>${t.filter(x => displayStatus(x.status) === 'resolved').length}</span>
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
      <div class="card" style="display:none">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.clock}<span>Request Leave</span></span></div>
        <div class="card-body">
          <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:16px;">Need time off? Submit your request here for approval.</p>
          <button class="btn btn-secondary btn-wide" id="btn-open-leave-modal">
            ${ICONS.plus}<span>Submit Leave Request</span>
          </button>
        </div>
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
      const ops = [
        supabase.from('inquiries').update({
          assignment_status: 'accepted',
          status: 'in_progress',
        }).eq('id', btn.dataset.id)
      ];
      if (btn.dataset.ticketId) {
        ops.push(supabase.from('tickets').update({ status: 'in_progress' }).eq('id', btn.dataset.ticketId));
      }
      const results = await Promise.all(ops);
      const error = results.find(r => r.error)?.error;
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

// ── EMPLOYEE: MY CASH ────────────────────────────────────
// Lists every cash payment this technician has collected. Pending balance
// = cash that hasn't yet been submitted to admin. Once admin records the
// submission in their Cash Collections tab, the row moves to "Submitted"
// and the pending total drops.
export async function renderEmployeeCash(container) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const { data: rows } = await supabase.from('inquiries')
    .select('*')
    .eq('assigned_employee_id', user.id)
    .eq('payment_method', 'cash')
    .eq('payment_status', 'paid')
    .order('cash_collected_at', { ascending: false });

  const list = (Array.isArray(rows) ? rows : []).filter(x => x.cash_collected_at);
  const pending = list.filter(x => !x.cash_submitted_at);
  const submitted = list.filter(x => x.cash_submitted_at);

  const totalPending = pending.reduce((acc, x) => acc + (Number(x.bill_total) || 0), 0);
  const totalSubmitted = submitted.reduce((acc, x) => acc + (Number(x.bill_total) || 0), 0);
  const totalEver = totalPending + totalSubmitted;

  const dateOf = (d) => {
    if (!d) return '—';
    try {
      const dt = new Date(String(d).replace(' ', 'T'));
      return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch { return d; }
  };

  const rowHtml = (items) => items.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No cash collections yet</td></tr>'
    : items.map(x => `
      <tr>
        <td><small style="color:var(--text-dim)">${dateOf(x.cash_collected_at)}</small></td>
        <td><code style="font-size:0.75rem;">${x.ticket_no || (x.id || '').slice(0,8)}</code></td>
        <td><b>${x.full_name || '—'}</b><br/><small style="color:var(--text-dim)">${x.phone || ''}</small></td>
        <td><small>${x.service_item || '—'}</small></td>
        <td><b>₹${Math.round(Number(x.bill_total) || 0).toLocaleString('en-IN')}</b></td>
        <td>${x.cash_submitted_at
          ? `<span class="badge badge-resolved">Submitted</span><br/><small style="color:var(--text-dim)">${dateOf(x.cash_submitted_at)}</small>`
          : '<span class="badge badge-medium">Pending</span>'}</td>
      </tr>`).join('');

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>My Cash</h1>
        <p>Cash you've collected from clients. Hand it to admin to clear the pending balance.</p>
      </div>
      <button class="btn btn-secondary" id="cash-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>

    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning); font-size:1.9rem;">₹${Math.round(totalPending).toLocaleString('en-IN')}</div>
        <div class="stat-label">Pending Submission</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success); font-size:1.9rem;">₹${Math.round(totalSubmitted).toLocaleString('en-IN')}</div>
        <div class="stat-label">Already Submitted</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${list.length}</div>
        <div class="stat-label">Total Cash Jobs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="font-size:1.7rem;">₹${Math.round(totalEver).toLocaleString('en-IN')}</div>
        <div class="stat-label">Total Collected (All Time)</div>
      </div>
    </div>

    ${totalPending > 0 ? `
      <div style="padding:14px 16px; border-radius:14px; background:rgba(245,158,11,0.08); border:1px dashed var(--warning); margin-bottom:18px; font-size:0.88rem; color:var(--text);">
        💵 You have <b>₹${Math.round(totalPending).toLocaleString('en-IN')}</b> in cash to hand over to admin. Once admin records the submission in their Cash Collections tab, these entries will move to <b>Submitted</b>.
      </div>` : ''}

    <div class="filter-bar" style="margin-bottom:16px;">
      <div class="sr-filter-bar" id="cash-tabs">
        <button class="sr-filter active" data-tab="pending">Pending <span class="sr-filter-count">${pending.length}</span></button>
        <button class="sr-filter" data-tab="submitted">Submitted <span class="sr-filter-count">${submitted.length}</span></button>
        <button class="sr-filter" data-tab="all">All <span class="sr-filter-count">${list.length}</span></button>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Service</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>${rowHtml(pending)}</tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#cash-refresh').onclick = () => renderEmployeeCash(container);

  const tabs = { pending, submitted, all: list };
  container.querySelectorAll('#cash-tabs .sr-filter').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('#cash-tabs .sr-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const items = tabs[btn.dataset.tab] || list;
      container.querySelector('tbody').innerHTML = rowHtml(items);
    };
  });
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

// ── EMPLOYEE: MY TASKS (dedicated page) ──────────────────
export async function renderEmployeeTasks(container) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:60px;"><div class="spinner"></div></div>`;

  let tasks, pendingInquiries, acceptedInquiries;
  try {
    const [ticketsRes, inquiriesRes] = await Promise.all([
      supabase.from('tickets').select('*, inquiries(*)').eq('assigned_to', user.id).order('created_at', { ascending: false }),
      supabase.from('inquiries').select('*').eq('assigned_employee_id', user.id).in('assignment_status', ['pending', 'accepted']).order('created_at', { ascending: false }),
    ]);
    tasks = ticketsRes.data || [];
    const allInquiries = inquiriesRes.data || [];
    const taskInquiryIds = new Set(tasks.map(task => task.inquiries?.[0]?.id).filter(Boolean));
    pendingInquiries = allInquiries.filter(x => x.assignment_status === 'pending').sort(byNewestCreated);
    acceptedInquiries = allInquiries
      .filter(x => x.assignment_status === 'accepted' && !taskInquiryIds.has(x.id))
      .sort(byNewestCreated)
      .map(x => ({ ...x, _company: x.company_name || null }));
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger);display:inline-flex;align-items:center;gap:8px;">${ICONS.alert}<span>Error</span></h3><p>${err.message}</p></div></div>`;
    return;
  }

  const activeTasks = tasks.filter(x => {
    const status = displayStatus(x.status);
    if (status === 'resolved') return false;
    const inq = x.inquiries?.[0];
    if (!inq) return status === 'assigned' || status === 'in_progress' || status === 'open';
    return inq.assignment_status === 'accepted' && displayStatus(inq.status) !== 'resolved';
  });
  const completedTasks = tasks.filter(x => displayStatus(x.status) === 'resolved');
  const issueTasks = tasks.filter(x => displayStatus(x.status) === 'issue_not_resolved');
  const activeAcceptedInquiries = acceptedInquiries.filter(x => !['resolved', 'closed'].includes(x.status));
  const resolvedAcceptedInquiries = acceptedInquiries.filter(x => ['resolved', 'closed'].includes(x.status));

  const filterCounts = {
    all: tasks.length + acceptedInquiries.length,
    active: activeTasks.length + activeAcceptedInquiries.length,
    completed: completedTasks.length + resolvedAcceptedInquiries.length,
    issues: issueTasks.length,
  };

  const jobCard = (inq) => `
    <div class="emp-job-card" data-status="${displayStatus(inq.status)}" data-company="${inq._company || ''}" style="padding:20px; border-radius:20px; background:var(--bg); box-shadow:var(--neu-sm); margin-bottom:20px; border:1px solid var(--border);">
       <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
         <div>
           <div style="font-weight:800; font-size:1.15rem; color:var(--primary)">${inq.full_name}</div>
           ${inq._company ? `<div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">${inq._company}</div>` : ''}
           <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;"><b>Ticket:</b> ${inq.ticket_no || '—'}</div>
           <div style="font-size:0.82rem; color:var(--text-dim); margin-top:4px;"><b>Created:</b> ${formatDateTime(inq.created_at)}</div>
           <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;">${inq.service_item}</div>
         </div>
         <span class="badge badge-${displayStatus(inq.status)}" style="font-size:0.75rem">${statusText(inq.status)}</span>
       </div>

       <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:16px; margin-top:16px; padding-top:16px; border-top:1px solid rgba(16,185,129,0.1);">
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Contact Info</div>
           <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
             <span style="font-weight:700; font-size:0.95rem">${inq.phone}</span>
             <div style="display:flex; gap:6px;">
               <a href="tel:${inq.phone}" style="display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; background:var(--primary); color:white;">
                 <span style="width:16px;height:16px;display:flex;">${ICONS.phone}</span>
               </a>
               <a href="https://wa.me/${inq.phone.replace(/\D/g,'')}" target="_blank" style="display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; background:#25D366; color:white;">
                 <span style="width:16px;height:16px;display:flex;">${ICONS.whatsapp}</span>
               </a>
             </div>
           </div>
         </div>
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Service Location</div>
           <div style="font-size:0.88rem; font-weight:600; margin-top:8px; display:flex; align-items:flex-start; gap:6px;">
             <span style="width:18px;height:18px;display:flex;flex-shrink:0;color:var(--primary)">${ICONS.pin}</span>
             <span style="line-height:1.4">${inq.location || '—'}</span>
           </div>
         </div>
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Preferred Time</div>
           <div style="font-size:0.88rem; font-weight:700; margin-top:8px; color:var(--primary)">${inq.preferred_time || 'Flexible'}</div>
         </div>
       </div>

       <div style="margin-top:20px; display:flex; gap:10px;">
         <button class="btn btn-secondary btn-sm task-btn" data-id="${inq.ticket_id}" data-inq-id="${inq.id}" data-status="${inq.status}" style="flex:1; height:40px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
           <span style="width:16px;height:16px;display:flex;">${ICONS.edit}</span> Update Status
         </button>
         <button class="btn btn-primary btn-sm" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inq.location)}')" style="flex:1; height:40px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
           <span style="width:16px;height:16px;display:flex;">${ICONS.pin}</span> Open Maps
         </button>
       </div>
    </div>
  `;

  const taskCard = (task) => {
    const inq = task.inquiries?.[0];
    const shownStatus = displayStatus(task.status);
    return `
      <div class="emp-task-card" data-status="${shownStatus}" style="padding:20px; border-radius:20px; background:var(--bg); box-shadow:var(--neu-sm); margin-bottom:20px; border:1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="flex:1">
            <div style="font-weight:800; font-size:1.1rem; color:var(--text)">${task.title}</div>
            <div style="font-size:0.82rem; color:var(--text-dim); margin-top:4px;"><b>Created:</b> ${formatDateTime(inq?.created_at || task.created_at)}</div>
            <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;">${task.description || 'No description provided.'}</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <span class="badge badge-${shownStatus}">${statusText(task.status)}</span>
            <span class="badge badge-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
          </div>
        </div>
        
        ${inq ? `
          <div style="margin-top:16px; padding:14px; background:var(--bg-soft); border-radius:14px; border:1px dashed var(--primary);">
            <div style="font-size:0.75rem; color:var(--primary); font-weight:800; text-transform:uppercase; margin-bottom:10px;">Linked Service Request</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Client</div>
                <div style="font-size:0.9rem; font-weight:700">${inq.full_name}</div>
              </div>
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Ticket</div>
                <div style="font-size:0.9rem; font-weight:700; color:var(--primary)">${inq.ticket_no || '—'}</div>
              </div>
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Contact</div>
                <div style="font-size:0.9rem; font-weight:700; display:flex; align-items:center; gap:6px;">
                  ${inq.phone}
                  <a href="tel:${inq.phone}" style="color:var(--primary); display:flex;"><span style="width:14px;height:14px;display:flex;">${ICONS.phone}</span></a>
                  <a href="https://wa.me/${(inq.phone || '').replace(/\\D/g, '')}" target="_blank" style="color:#25D366; display:flex;"><span style="width:14px;height:14px;display:flex;">${ICONS.whatsapp}</span></a>
                </div>
              </div>
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Service</div>
                <div style="font-size:0.9rem; font-weight:600">${inq.service_item || '—'}</div>
              </div>
              <div style="grid-column: span 2">
                <div style="font-size:0.7rem; color:var(--text-dim)">Location</div>
                <div style="font-size:0.88rem; font-weight:600; display:flex; align-items:flex-start; gap:6px;">
                  <span style="width:14px;height:14px;display:flex;flex-shrink:0;color:var(--primary);margin-top:2px;">${ICONS.pin}</span>
                  ${inq.location || '—'}
                </div>
              </div>
            </div>
          </div>
        ` : ''}
        
        <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm task-btn" data-id="${task.id}" data-inq-id="${inq ? inq.id : ''}" data-status="${task.status}" style="flex:1; min-width:120px; height:42px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">
            <span style="width:16px;height:16px;display:flex;">${ICONS.edit}</span> Update Status
          </button>
          ${inq ? `
            <button class="btn btn-primary btn-sm" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inq.location)}')" style="flex:1; min-width:120px; height:42px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">
              <span style="width:16px;height:16px;display:flex;">${ICONS.pin}</span> Open Maps
            </button>
          ` : ''}
        </div>
      </div>
    `;
  };

  const activeServiceCards = [
    ...activeAcceptedInquiries,
    ...activeTasks,
  ].sort(byNewestCreated);
  const resolvedServiceCards = [
    ...resolvedAcceptedInquiries,
    ...completedTasks,
  ].sort(byNewestCreated);

  container.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1 style="display:flex; align-items:center; gap:12px;">
          <span style="width:32px; height:32px; display:flex; color:var(--primary);">${ICONS.ticket}</span>
          <span>My Tasks</span>
        </h1>
        <p>All your assigned tasks, service jobs, and pending assignments</p>
      </div>
      <button class="btn btn-secondary" id="tasks-refresh">${ICONS.refresh}<span>Refresh</span></button>
    </div>

    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--primary)">${tasks.length + acceptedInquiries.length}</div>
        <div class="stat-label">Total Jobs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning)">${activeTasks.length + activeAcceptedInquiries.length}</div>
        <div class="stat-label">Active</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success)">${completedTasks.length + resolvedAcceptedInquiries.length}</div>
        <div class="stat-label">Completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--danger)">${issueTasks.length}</div>
        <div class="stat-label">Issues</div>
      </div>
    </div>

    ${pendingInquiries.length > 0 ? `
      <div class="card" style="border: 2px solid var(--primary); background: rgba(16, 185, 129, 0.05); margin-bottom:24px;">
        <div class="card-header"><span class="card-title sr-icon-title">${ICONS.alert}<span>New Assignments Pending</span></span></div>
        <div class="card-body">
          ${pendingInquiries.map(pi => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:14px; background:var(--bg-soft); border-radius:14px; margin-bottom:10px; box-shadow:var(--neu-sm);">
              <div>
                <div style="font-weight:700">${pi.full_name} — ${pi.service_item}</div>
                <div style="font-size:0.82rem; color:var(--text-dim)">Created: ${formatDateTime(pi.created_at)}</div>
                <div style="font-size:0.82rem; color:var(--text-soft)">Preferred: ${pi.preferred_time || 'Flexible'}</div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-primary btn-sm accept-btn" data-id="${pi.id}" data-ticket-id="${pi.ticket_id || ''}">${ICONS.check} Accept</button>
                <button class="btn btn-danger btn-sm decline-btn" data-id="${pi.id}">${ICONS.close} Decline</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="filter-bar" style="margin-bottom:24px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
      <div class="sr-filter-bar" id="task-filter-tabs">
        <button class="sr-filter active" data-filter="all"><span>All</span><span class="sr-filter-count">${filterCounts.all}</span></button>
        <button class="sr-filter" data-filter="active"><span>Active</span><span class="sr-filter-count">${filterCounts.active}</span></button>
        <button class="sr-filter" data-filter="completed"><span>Completed</span><span class="sr-filter-count">${filterCounts.completed}</span></button>
        <button class="sr-filter" data-filter="issues"><span>Issues</span><span class="sr-filter-count">${filterCounts.issues}</span></button>
      </div>
      <div class="search-input-wrap" style="flex:1; min-width:200px;">
        <span>${ICONS.search || '🔍'}</span>
        <input class="search-input" id="task-search" placeholder="Search tasks by title, client, or ticket…"/>
      </div>
    </div>

    <div id="task-list">
      ${(tasks.length === 0 && acceptedInquiries.length === 0)
        ? '<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:var(--text-dim)"><div style="font-size:2rem;margin-bottom:12px;">📋</div><p style="font-weight:600;">No tasks assigned yet</p><p style="font-size:0.85rem;">Tasks will appear here once admin assigns service requests to you.</p></div></div>'
        : `
          <div class="card">
            <div class="card-header"><span class="card-title">Active Services</span></div>
            <div class="card-body emp-scroll-list">
              ${activeServiceCards.length === 0
                ? '<div style="text-align:center;padding:28px;color:var(--text-dim)">No active services</div>'
                : activeServiceCards.map(item => item.inquiries ? taskCard(item) : jobCard(item)).join('')}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">Resolved Services</span></div>
            <div class="card-body emp-scroll-list">
              ${resolvedServiceCards.length === 0
                ? '<div style="text-align:center;padding:28px;color:var(--text-dim)">No resolved services yet</div>'
                : resolvedServiceCards.map(item => item.inquiries ? taskCard(item) : jobCard(item)).join('')}
            </div>
          </div>
        `}
    </div>
  `;

  // Refresh
  container.querySelector('#tasks-refresh').onclick = () => renderEmployeeTasks(container);

  // Filter tabs
  let activeFilter = 'all';
  let searchQuery = '';

  const applyFilters = () => {
    const cards = container.querySelectorAll('.emp-task-card, .emp-job-card');
    const q = searchQuery.toLowerCase();
    cards.forEach(card => {
      const status = card.dataset.status;
      const text = card.textContent.toLowerCase();
      const matchFilter = activeFilter === 'all'
        || (activeFilter === 'active' && status !== 'resolved' && status !== 'issue_not_resolved')
        || (activeFilter === 'completed' && status === 'resolved')
        || (activeFilter === 'issues' && status === 'issue_not_resolved');
      const matchSearch = !q || text.includes(q);
      card.style.display = (matchFilter && matchSearch) ? '' : 'none';
    });
  };

  container.querySelectorAll('#task-filter-tabs .sr-filter').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('#task-filter-tabs .sr-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilters();
    };
  });

  const searchInput = container.querySelector('#task-search');
  if (searchInput) {
    searchInput.oninput = (e) => { searchQuery = e.target.value; applyFilters(); };
  }

  // Task update buttons
  container.querySelectorAll('.task-btn').forEach(btn => {
    btn.onclick = () => openTaskModal(btn.dataset.id, btn.dataset.inqId, btn.dataset.status, () => renderEmployeeTasks(container));
  });

  // Accept/Decline
  container.querySelectorAll('.accept-btn').forEach(btn => {
    btn.onclick = async () => {
      const ops = [
        supabase.from('inquiries').update({ assignment_status: 'accepted', status: 'in_progress' }).eq('id', btn.dataset.id)
      ];
      if (btn.dataset.ticketId) {
        ops.push(supabase.from('tickets').update({ status: 'in_progress' }).eq('id', btn.dataset.ticketId));
      }
      const results = await Promise.all(ops);
      const error = results.find(r => r.error)?.error;
      if (error) toast(error.message, 'error');
      else { toast('Task accepted!', 'success'); renderEmployeeTasks(container); }
    };
  });

  container.querySelectorAll('.decline-btn').forEach(btn => {
    btn.onclick = () => {
      const reason = prompt('Please provide a reason for declining:');
      if (reason === null) return;
      if (!reason.trim()) { toast('Reason is required to decline', 'warning'); return; }
      (async () => {
        const { error } = await supabase.from('inquiries').update({
          assignment_status: 'declined', decline_reason: reason.trim(), status: 'open'
        }).eq('id', btn.dataset.id);
        if (error) toast(error.message, 'error');
        else { toast('Task declined', 'info'); renderEmployeeTasks(container); }
      })();
    };
  });
}

function openTaskModal(taskId, inqId, currentStatus, onDone) {
  (async () => {
    const { data: pricing } = await supabase.from('service_pricing').select('*').order('category');
    const { data: deviceTypes } = await supabase.from('device_types').select('name').order('name');
    const deviceTypeList = Array.isArray(deviceTypes) ? deviceTypes : [];
    // Snapshot current payment state so we can gate the resolved submit button.
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
    
    const normalizedCurrentStatus = displayStatus(currentStatus);
    const isResolvedReadOnly = normalizedCurrentStatus === 'resolved';
    const isResolving = normalizedCurrentStatus === 'resolved';
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
              <select id="new-status" ${isResolvedReadOnly ? 'disabled' : ''}>
                <option value="open" ${normalizedCurrentStatus==='open'?'selected':''}>Received</option>
                <option value="in_progress" ${normalizedCurrentStatus==='in_progress'?'selected':''}>In Progress</option>
                <option value="resolved" ${normalizedCurrentStatus==='resolved'?'selected':''}>Resolved</option>
                <option value="issue_not_resolved" ${normalizedCurrentStatus==='issue_not_resolved'?'selected':''}>Issue Not Resolved</option>
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
              <input type="text" id="device-type" list="emp-device-types" placeholder="${deviceTypeList.length ? 'Start typing or pick…' : 'e.g. Video Door Phone'}" value="${(inquiryRow?.device_type ?? '').replace(/"/g,'&quot;')}"/>
              <datalist id="emp-device-types">
                ${deviceTypeList.map(d => `<option value="${(d.name || '').replace(/"/g,'&quot;')}"></option>`).join('')}
              </datalist>
              ${deviceTypeList.length === 0 ? '<small style="display:block; margin-top:6px; color:var(--text-dim); font-size:0.75rem;">Tip: ask admin to add device types so this becomes a quick-pick list.</small>' : ''}
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
              ℹ️ Set status to <b>Resolved</b> on the Status tab to enable billing.
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

              <!-- Payment Method choice -->
              <div class="form-group" style="margin-bottom:14px;">
                <label>How will the client pay?</label>
                <div class="pay-method-toggle" id="pay-method-toggle">
                  <button type="button" class="pay-method-btn active" data-method="online">💳 Online (Razorpay)</button>
                  <button type="button" class="pay-method-btn" data-method="cash">💵 Cash on Service</button>
                </div>
              </div>

              <!-- Cash collection section (hidden until method=cash) -->
              <div id="cash-section" style="display:none; padding:14px; background:rgba(245,158,11,0.06); border-radius:14px; border:1px solid var(--warning); margin-bottom:14px;">
                <div style="font-weight:700; font-size:0.9rem; color:var(--text); margin-bottom:8px;">💵 Cash Collection</div>
                <div style="font-size:0.82rem; color:var(--text-soft); margin-bottom:12px;">
                  Mark this once you have <b>physically received</b> the cash from the client. The amount will appear in your <b>My Cash</b> tab as <i>pending submission</i> until you hand it to admin.
                </div>
                <button type="button" class="btn btn-primary btn-wide" id="mark-cash-btn" style="background:var(--warning); box-shadow:0 8px 24px rgba(245,158,11,0.32);">
                  ✓ Mark Cash Collected — <span id="cash-amount-display">₹0</span>
                </button>
                <div id="cash-collected-banner" style="display:none; margin-top:10px; padding:10px 12px; border-radius:10px; background:rgba(16,185,129,0.08); border:1px solid var(--success); font-size:0.85rem; color:var(--success); font-weight:700;">
                  ✓ Cash collected — appears in your My Cash tab.
                </div>
              </div>

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

    // Tab switcher — also drives the footer button label (Next → on intermediate tabs, Save on the last).
    const TAB_ORDER = ['status', 'device', 'bill'];
    const getActiveTab = () => overlay.querySelector('.mst-tab.active')?.dataset.tab || TAB_ORDER[0];
    const isLastTab = () => getActiveTab() === TAB_ORDER[TAB_ORDER.length - 1];
    const goToTab = (target) => {
      overlay.querySelectorAll('.mst-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === target));
      overlay.querySelectorAll('.mst-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === target));
      renderPayStatus();
    };
    overlay.querySelectorAll('.mst-tab').forEach(tabBtn => {
      tabBtn.onclick = () => goToTab(tabBtn.dataset.tab);
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
      const cashDisplay = overlay.querySelector('#cash-amount-display');
      if (cashDisplay) cashDisplay.textContent = inr(bill.total);
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
      const resolving = statusSel.value === 'resolved';
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

      if (!isLastTab()) {
        // On Status / Device Info tabs the primary button just advances the wizard.
        saveBtn.disabled = false;
        saveBtn.textContent = 'Next →';
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
        saveBtn.title = '';
      } else if (isResolvedReadOnly) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Resolved';
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.title = 'Resolved tasks are read-only.';
      } else if (requiresPayment && !paid) {
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
      const resolving = statusSel.value === 'resolved';
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
    if (isResolvedReadOnly) {
      overlay.querySelector('#progress-detail').disabled = true;
      overlay.querySelectorAll('#pricing-section input, #pricing-section select, #pricing-section textarea, #pricing-section button').forEach(el => {
        el.disabled = true;
        el.style.opacity = '0.6';
        el.style.cursor = 'not-allowed';
      });
    }

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
          inquiryId: inqId || null,
          onSent: async (pdfUrl) => {
            // After share — persist breakdown so admin sees it too.
            if (!inqId) return;
            const updates = {
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
            };
            if (pdfUrl) updates.bill_pdf_url = pdfUrl;
            await supabase.from('inquiries').update(updates).eq('id', inqId);
          },
        });
      };
    }

    if (shareWaBtn) {
      shareWaBtn.onclick = () => {
        if (_payLink) window.open(`https://wa.me/?text=${encodeURIComponent('Please use this link to pay for your service: ' + _payLink)}`, '_blank');
      };
    }

    // ── Payment method toggle (Online ↔ Cash) ─────────────────────────────
    const payMethodToggle = overlay.querySelector('#pay-method-toggle');
    const cashSection = overlay.querySelector('#cash-section');
    const payLinkSection = overlay.querySelector('#emp-pay-link')?.closest('div[style*="background:var(--bg-soft)"]');
    const cashAmountDisplay = overlay.querySelector('#cash-amount-display');
    const cashBanner = overlay.querySelector('#cash-collected-banner');
    const markCashBtn = overlay.querySelector('#mark-cash-btn');
    let payMethod = inquiryRow?.payment_method === 'cash' ? 'cash' : 'online';

    const renderPayMethod = () => {
      payMethodToggle.querySelectorAll('.pay-method-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.method === payMethod);
      });
      cashSection.style.display = payMethod === 'cash' ? 'block' : 'none';
      if (payLinkSection) payLinkSection.style.display = payMethod === 'cash' ? 'none' : 'block';
      if (cashAmountDisplay) cashAmountDisplay.textContent = `₹${Math.round(bill.total).toLocaleString('en-IN')}`;
      // If cash was already marked paid, show the banner + disable button.
      const alreadyCash = inquiryRow?.payment_method === 'cash' && inquiryRow?.payment_status === 'paid';
      if (alreadyCash && cashBanner) {
        cashBanner.style.display = 'block';
        if (markCashBtn) { markCashBtn.disabled = true; markCashBtn.style.opacity = '0.55'; }
      }
    };
    payMethodToggle.querySelectorAll('.pay-method-btn').forEach(btn => {
      btn.onclick = () => { payMethod = btn.dataset.method; renderPayMethod(); };
    });
    renderPayMethod();

    // Mark Cash Collected — sets payment_status=paid + payment_method=cash +
    // cash_collected_at=NOW so it shows up in the employee's My Cash tab as
    // pending submission. Also persists the full bill breakdown.
    if (markCashBtn) {
      markCashBtn.onclick = async () => {
        if (!inqId) { toast('Cannot mark cash on a task without an inquiry record', 'error'); return; }
        if (bill.total <= 0) { toast('Add services or charges first', 'warning'); return; }
        markCashBtn.disabled = true;
        const orig = markCashBtn.innerHTML;
        markCashBtn.innerHTML = '<span>Saving…</span>';
        try {
          const nowIso = new Date().toISOString().slice(0,19).replace('T',' ');
          const updates = {
            payment_method: 'cash',
            payment_status: 'paid',
            payment_received_at: nowIso,
            cash_collected_at: nowIso,
            bill_amount: bill.servicesSubtotal + bill.extra,
            extra_cost: bill.extra,
            extra_cost_reason: overlay.querySelector('#extra-reason')?.value.trim() || null,
            transport_km: bill.km,
            transport_fee: bill.transport,
            platform_fee: bill.platform,
            discount_amount: bill.discount,
            gst_amount: bill.gst,
            bill_total: bill.total,
            bill_generated_at: nowIso,
            device_type: overlay.querySelector('#device-type')?.value.trim() || null,
            device_serial_no: overlay.querySelector('#device-serial')?.value.trim() || null,
            company_name: overlay.querySelector('#resolve-company')?.value.trim() || null,
          };
          const { error } = await supabase.from('inquiries').update(updates).eq('id', inqId);
          if (error) throw new Error(error.message);
          // Refresh local payment state so the save button unlocks.
          paymentState = { status: 'paid', received_at: nowIso };
          inquiryRow = { ...(inquiryRow || {}), ...updates };
          _paymentJustReceived = true;
          renderPayStatus();
          renderPayMethod();
          toast('✓ Cash recorded — visible in My Cash as pending submission', 'success');
        } catch (err) {
          toast(err.message || 'Could not mark cash', 'error');
          markCashBtn.disabled = false;
          markCashBtn.innerHTML = orig;
        }
      };
    }

    const closeOverlay = () => { stopPolling(); try { supabase.removeChannel(channel); } catch {} overlay.remove(); };
    overlay.querySelector('#cm').onclick = overlay.querySelector('#cm2').onclick = closeOverlay;
    overlay.querySelector('#save-update').onclick = async () => {
      // Wizard mode: on Status / Device Info tabs this button advances to the next tab instead of saving.
      if (!isLastTab()) {
        const idx = TAB_ORDER.indexOf(getActiveTab());
        goToTab(TAB_ORDER[idx + 1]);
        return;
      }
      if (isResolvedReadOnly) {
        toast('Resolved tasks are read-only', 'info');
        return;
      }
      const newStatus = statusSel.value;
      const detail = overlay.querySelector('#progress-detail').value.trim();
      
      if (!detail) { toast('Please provide details of your work', 'warning'); return; }

      const btn = overlay.querySelector('#save-update');
      btn.disabled = true; btn.textContent = 'Saving...';

      const selectedServiceIds = [];
      const resolving = newStatus === 'resolved';
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

      if (newStatus === 'resolved') {
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
