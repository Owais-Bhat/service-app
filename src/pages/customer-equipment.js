// "What do we know about this caller" — for a service request's detail.
//
// A request carries a name and a phone number. The phone is matched to a
// customer record, and what comes back is what the person taking the call, and
// the technician being sent, most need: what is installed there, whether it is
// under warranty, and whether an AMC is running (with visits left).
import { toast } from '../utils.js';
import { warrantyChip, warrantyText } from './devices.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const day = (v) => v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * Fills `host` with the customer's equipment and contract. Says nothing at all
 * when the phone matches no customer, or the user may not see the register —
 * an empty panel on every ticket would be noise.
 */
export async function mountCustomerEquipment(host, { phone, ticketNo }) {
  if (!host || !phone) return;
  let found;
  try { found = await api('GET', `/devices/lookup?phone=${encodeURIComponent(phone)}`); } catch { return; }
  const parties = (found.parties || []).filter(p => p.devices.length || p.contracts.length);
  if (!parties.length) return;

  host.innerHTML = parties.map((p, idx) => {
    const running = p.contracts.find(c => c.state === 'active');
    const lapsed = !running && p.contracts.find(c => c.state === 'expired');
    const groups = new Map();
    p.devices.forEach(d => { const k = d.site_name || 'No site set'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });

    return `
      <div class="ce-card" data-idx="${idx}" style="margin-top:12px;padding:12px 14px;border-radius:14px;border:1.5px solid var(--border);background:var(--bg)">
        <div style="font-size:0.7rem;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px">
          Customer record · ${esc(p.party)}</div>
        ${running ? `
          <div style="padding:10px 12px;border-radius:10px;background:rgba(21,160,90,0.10);border:1px solid rgba(21,160,90,0.35);margin-bottom:10px">
            <div style="font-weight:800;color:var(--primary)">AMC running — ${esc(running.contract_no)}</div>
            <div style="font-size:0.82rem">${esc(running.title)} · ends ${esc(day(running.end_date))} (${running.days_left} days)
              · ${running.visits_included === null ? 'unlimited visits' : running.visits_left > 0 ? `<b>${running.visits_left}</b> free visit${running.visits_left === 1 ? '' : 's'} left` : '<b style="color:var(--danger)">free visits used up — chargeable</b>'}</div>
            ${ticketNo ? `<button type="button" class="btn btn-secondary btn-sm ce-visit" data-contract="${esc(running.id)}" style="margin-top:8px">Count this as an AMC visit</button>` : ''}
          </div>` : lapsed ? `
          <div style="padding:10px 12px;border-radius:10px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);margin-bottom:10px;font-size:0.84rem">
            <b>AMC expired</b> ${lapsed.days_overdue} days ago (${esc(lapsed.contract_no)}). Worth offering a renewal on this visit.</div>` : ''}
        ${p.devices.length ? [...groups.entries()].map(([site, list]) => `
          <div style="font-size:0.78rem;font-weight:700;margin:6px 0 4px">${esc(site)}</div>
          ${list.map(d => {
    const [tone, label] = warrantyChip(d);
    return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:0.82rem;padding:4px 0;border-bottom:1px dashed var(--border)">
              <span>${d.quantity > 1 ? `<b>${d.quantity} ×</b> ` : ''}<b>${esc([d.brand, d.model].filter(Boolean).join(' ') || d.category_label)}</b>
                <span style="color:var(--text-dim)">${esc(d.category_label)}${d.location_note ? ` · ${esc(d.location_note)}` : ''}${d.serial_no ? ` · ${esc(d.serial_no)}` : ''}</span>
                ${d.status === 'faulty' ? '<span class="at2-chip danger">Faulty</span>' : ''}</span>
              <span style="white-space:nowrap"><span class="at2-chip ${tone}">${label}</span> <small style="color:var(--text-dim)">${esc(warrantyText(d))}</small></span>
            </div>`;
  }).join('')}`).join('') : '<div style="font-size:0.82rem;color:var(--text-dim)">No equipment registered for this customer yet.</div>'}
      </div>`;
  }).join('');

  host.querySelectorAll('.ce-visit').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const out = await api('POST', `/amc/contracts/${encodeURIComponent(btn.dataset.contract)}/visits`, {
          kind: 'complaint', ticket_ref: ticketNo, note: 'Service request',
        });
        toast(out.chargeable ? 'Counted — this one is chargeable' : 'Counted as an AMC visit', 'success');
        btn.textContent = out.chargeable ? 'Counted (chargeable)' : 'Counted as an AMC visit ✓';
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    };
  });
}
