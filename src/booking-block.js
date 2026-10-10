// The pop-up a customer sees when a booking is refused: a payment from before is still pending, or the place is
// outside the area we serve. Plain DOM and inline styles so it works on both the landing page and the install form.

const API_URL = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : `http://${window.location.hostname}:5000/api`;

const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Ask the server before the customer fills the form. A failed call never blocks them — the save asks again.
export async function precheckBooking({ phone, lat, lng, location } = {}) {
  try {
    const res = await fetch(`${API_URL}/booking/precheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, lat, lng, location }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data && typeof data.ok === 'boolean' ? data : { ok: true };
  } catch {
    return { ok: true };
  }
}

// result: { code, message, pending[], pending_paise, distance_km, radius_km } from the server.
export function showBookingBlocked(result, { onClose } = {}) {
  document.getElementById('booking-block-overlay')?.remove();
  const pending = result.code === 'PENDING_PAYMENT';
  const lines = pending
    ? (result.pending || []).map((p) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid rgba(128,128,128,.2);font-size:.9rem">
          <span>${esc(p.what)}${p.ref ? ` <small style="opacity:.7">· ${esc(p.ref)}</small>` : ''}</span>
          <b>${rupees(p.amount_paise)}</b>
        </div>`).join('')
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'booking-block-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div role="alertdialog" aria-modal="true" style="max-width:440px;width:100%;background:#fff;color:#1a1a1a;border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
      <div style="font-size:2rem;line-height:1">${pending ? '💳' : '📍'}</div>
      <h2 style="margin:10px 0 6px;font-size:1.2rem">${pending ? 'Please repay your previous payment first' : 'We do not serve this location'}</h2>
      <p style="margin:0 0 12px;color:#444;line-height:1.5">${esc(result.message || '')}</p>
      ${lines ? `<div style="margin-bottom:14px">${lines}</div>` : ''}
      <p style="margin:0 0 16px;color:#666;font-size:.85rem">Call or WhatsApp us on +91 88991 33144 if you think this is a mistake.</p>
      <button type="button" id="booking-block-ok" style="width:100%;padding:12px;border:0;border-radius:10px;background:#16a34a;color:#fff;font-weight:600;font-size:1rem;cursor:pointer">OK</button>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); if (onClose) onClose(); };
  overlay.querySelector('#booking-block-ok').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}
