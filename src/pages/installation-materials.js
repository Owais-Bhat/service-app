// Items fitted on an installation: what the technician took from his van, and the bill the customer gets for it.
//
// One screen for two people. The technician sees his van, types how many of each item are on this job, and saves —
// he never sees a rate or a total. The office sees the same list plus the bill with its rates, can send it to the
// customer again, and can take what is left in the technician's van back to the store.
import { toast } from '../utils.js';
import { ICONS } from '../icons.js';

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
const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * @param {{ installationId: string, onDone?: Function }} opts
 */
export async function openInstallationMaterials({ installationId, onDone } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal at2-modal" style="max-width:640px"><div class="modal-body"><div class="loading-screen"><div class="spinner"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  let data;
  try {
    data = await api('GET', `/installations/${encodeURIComponent(installationId)}/materials`);
  } catch (err) {
    close();
    return toast(err.message, 'error');
  }
  paint(data);

  function paint(d) {
    // The office sees rates and totals; the technician never does.
    const office = !!d.money_visible;
    const rows = d.items;
    const noVan = !d.van;

    overlay.innerHTML = `
      <div class="modal at2-modal" style="max-width:640px">
        <div class="modal-header">
          <span class="modal-title">Items used — ${esc(d.job.full_name || 'Customer')} <small style="color:var(--text-dim)">${esc(d.job.ticket_no || '')}</small></span>
          <button class="modal-close" id="im-close">${ICONS.close}</button>
        </div>
        <div class="modal-body">
          ${noVan ? `<div class="at2-notice warn">${d.technician
    ? `No stock has been given to ${esc(d.technician.name || 'this technician')} yet. Stock → Transfers: send items to their van first.`
    : 'Give this installation to a technician first.'}</div>` : ''}
          ${d.locked ? `<div class="at2-notice warn">${esc(d.locked_reason || 'This bill cannot be changed.')}</div>` : ''}

          ${rows.length ? `
          <div class="table-wrap"><table class="at2-tbl">
            <thead><tr><th>Item</th><th style="text-align:right">With ${office ? 'technician' : 'you'}</th><th style="text-align:right;width:130px">On this job</th></tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td><b>${esc(r.name)}</b></td>
                  <td style="text-align:right;white-space:nowrap">${num(r.held_qty)} ${esc(r.unit || '')}</td>
                  <td style="text-align:right">
                    <input type="number" class="im-qty" data-item="${esc(r.item_id)}" min="0" max="${r.held_qty + r.on_job}" step="any"
                      value="${r.on_job || ''}" placeholder="0" style="width:92px;text-align:right" ${d.locked || noVan ? 'disabled' : ''}>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table></div>` : (noVan ? '' : '<div class="at2-empty">Nothing in the van to put on this job.</div>')}

          <div class="form-group" style="margin-top:14px">
            <label>Installation charge (₹)</label>
            <input type="number" id="im-charge" min="0" step="1" value="${d.installation_charge || ''}" placeholder="What you charge for the installation"
              style="max-width:220px" ${d.locked ? 'disabled' : ''}>
            <small style="color:var(--text-dim)">Added to the customer's bill.</small>
          </div>

          ${d.invoice ? `
          <div style="margin-top:16px;padding:12px 14px;border:1px solid var(--border);border-radius:12px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
              <div><b>Bill ${esc(d.invoice.doc_no || '')}</b>
                <span class="at2-chip ${d.invoice.sent ? '' : 'muted'}" style="margin-left:6px">${d.invoice.sent ? 'Sent to customer' : 'Not sent yet'}</span>
                ${d.invoice.paid ? '<span class="at2-chip" style="margin-left:6px">Paid</span>' : ''}</div>
              ${office ? `<b>${rupees(d.invoice.total_paise)}</b>` : ''}
            </div>
            ${office && d.invoice.lines?.length ? `
              <table class="at2-tbl" style="margin-top:8px"><tbody>
                ${d.invoice.lines.map(l => `<tr><td>${esc(l.description)}</td><td style="text-align:right">${num(l.quantity)} × ${rupees(l.rate_paise)}</td><td style="text-align:right">${rupees(l.amount_paise)}</td></tr>`).join('')}
              </tbody></table>` : ''}
            ${office ? `<div style="margin-top:10px"><button class="btn btn-secondary" id="im-send">Send bill to customer again</button></div><p class="at2-note">Record the payment in Sales → Receipts when it arrives.</p>` : ''}
          </div>` : (office ? '<p class="at2-note">No bill yet — it is made when items are saved.</p>' : '')}

          ${office && d.van && rows.some(r => r.held_qty > 0) ? `
          <div style="margin-top:16px">
            <button class="btn btn-secondary" id="im-takeback">Take everything left back to the store</button>
            <p class="at2-note">Use this when the technician hands unused stock back.</p>
          </div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="im-cancel">Close</button>
          ${d.locked ? '' : `<button class="btn btn-primary" id="im-save">${ICONS.check}<span>Save${office ? '' : ' & send bill'}</span></button>`}
        </div>
      </div>`;

    overlay.querySelector('#im-close').onclick = close;
    overlay.querySelector('#im-cancel').onclick = close;

    const save = overlay.querySelector('#im-save');
    if (save) {
      save.onclick = async () => {
        const lines = [...overlay.querySelectorAll('.im-qty')].map(i => ({ item_id: i.dataset.item, quantity: Number(i.value) || 0 }));
        save.disabled = true;
        try {
          const out = await api('PUT', `/installations/${encodeURIComponent(installationId)}/materials`, {
            lines, installation_charge: overlay.querySelector('#im-charge')?.value,
          });
          if (out.problem) toast(out.problem, 'warning');
          else if (!out.saved.moved && !out.saved.charge_changed) toast('Nothing changed', 'info');
          else toast(out.saved.bill_sent ? 'Saved — bill sent to the customer' : 'Saved — the bill will be sent by the office', 'success');
          if (onDone) onDone();
          paint(out);
        } catch (err) {
          toast(err.message, 'error');
          save.disabled = false;
        }
      };
    }

    const send = overlay.querySelector('#im-send');
    if (send) {
      send.onclick = async () => {
        send.disabled = true;
        try {
          const out = await api('POST', `/installations/${encodeURIComponent(installationId)}/send-invoice`, {});
          toast(out.sent ? 'Bill sent to the customer' : `Not sent: ${out.error || 'WhatsApp is not set up'}`, out.sent ? 'success' : 'warning');
          paint(await api('GET', `/installations/${encodeURIComponent(installationId)}/materials`));
        } catch (err) {
          toast(err.message, 'error');
          send.disabled = false;
        }
      };
    }

    const back = overlay.querySelector('#im-takeback');
    if (back) {
      back.onclick = async () => {
        if (!confirm('Take everything left in this technician\'s van back to the store?')) return;
        back.disabled = true;
        try {
          const locations = await api('GET', '/stock/locations');
          const store = locations.find(l => l.is_default);
          if (!store) throw new Error('No main store is set up');
          const lines = rows.filter(r => r.held_qty > 0).map(r => ({ item_id: r.item_id, quantity: r.held_qty }));
          await api('POST', '/stock/transfers', {
            from_location_id: d.van.id, to_location_id: store.id, employee_id: d.technician?.id,
            note: `Taken back from ${d.technician?.name || 'technician'}`, lines,
          });
          toast('Back in the store', 'success');
          paint(await api('GET', `/installations/${encodeURIComponent(installationId)}/materials`));
          if (onDone) onDone();
        } catch (err) {
          toast(err.message, 'error');
          back.disabled = false;
        }
      };
    }
  }
}
