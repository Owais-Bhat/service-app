// Job Cards — admin tab for transcribing completed jobs, tracking the
// 3-day verification call, and awarding the monthly technician bonus.
import { toast } from '../utils.js';
import { ICONS } from '../icons.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const authHeaders = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders(false) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CATEGORIES = ['CCTV', 'Networking', 'Video Door Phone', 'Locks', 'Gate Automation', 'Access Control / Biometric', 'Fire Alarm', 'Other'];

let currentView = 'pending';

export async function renderJobCardsTab(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${ICONS.clipboard}</span>
          <span>Job Cards</span>
        </h1>
        <p>Transcribe completed jobs, track the 3-day verification call, and award the monthly technician bonus.</p>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
      <button class="btn btn-secondary jc-nav" data-view="pending">Pending Entry</button>
      <button class="btn btn-secondary jc-nav" data-view="verify">Awaiting Verification</button>
      <button class="btn btn-secondary jc-nav" data-view="entry">+ New Job Card</button>
      <button class="btn btn-secondary jc-nav" data-view="board">Leaderboard</button>
    </div>
    <div id="jc-body"></div>
  `;

  container.querySelectorAll('.jc-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      renderView(container);
    });
  });

  renderView(container);
}

async function renderView(container) {
  const body = container.querySelector('#jc-body');
  container.querySelectorAll('.jc-nav').forEach(b => b.classList.toggle('btn-primary', b.dataset.view === currentView));
  body.innerHTML = '<p style="padding:20px;color:var(--text-dim);">Loading…</p>';
  try {
    if (currentView === 'pending') return renderPending(body, container);
    if (currentView === 'verify') return renderVerify(body, container);
    if (currentView === 'entry') return renderEntryForm(body, container, null);
    if (currentView === 'board') return renderLeaderboard(body);
  } catch (err) {
    body.innerHTML = `<p style="padding:20px;color:var(--danger);">${esc(err.message)}</p>`;
  }
}

async function renderPending(body, container) {
  const rows = await apiGet('/job-cards?status=pending');
  if (!rows.length) {
    body.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim);">No jobs waiting on a job card.</div></div>';
    return;
  }
  body.innerHTML = `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ticket</th><th>Customer</th><th>Service</th><th>Technician(s)</th><th>Completed</th><th></th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${esc(r.ticket_no || '—')}</strong></td>
                <td>${esc(r.full_name || 'Client')}</td>
                <td>${esc(r.service_item || '—')}</td>
                <td>${esc(r.assigned_name || '—')}${r.secondary_name ? ', ' + esc(r.secondary_name) : ''}</td>
                <td>${new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                <td><button class="btn btn-primary btn-sm jc-enter" data-id="${r.id}">Enter →</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  body.querySelectorAll('.jc-enter').forEach(btn => {
    btn.addEventListener('click', () => renderEntryForm(body, container, btn.dataset.id));
  });
}

async function renderVerify(body, container) {
  const rows = await apiGet('/job-cards?status=awaiting-verification');
  if (!rows.length) {
    body.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim);">No verification calls due.</div></div>';
    return;
  }
  const dueLabel = (iso) => {
    const due = new Date(iso), now = new Date();
    const days = Math.ceil((due - now) / 86400000);
    if (days <= 0) return `<span style="color:var(--danger);font-weight:700;">Due now</span>`;
    return `Due in ${days} day${days === 1 ? '' : 's'}`;
  };
  body.innerHTML = `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ticket</th><th>Customer</th><th>Phone</th><th>Call due</th><th></th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${esc(r.ticket_no || '—')}</strong></td>
                <td>${esc(r.full_name || 'Client')}</td>
                <td>${esc(r.phone || '—')}</td>
                <td>${dueLabel(r.verification_due_at)}</td>
                <td><button class="btn btn-secondary btn-sm jc-log-call" data-id="${r.id}" data-name="${esc(r.full_name || '')}" data-phone="${esc(r.phone || '')}">Log call →</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  body.querySelectorAll('.jc-log-call').forEach(btn => {
    btn.addEventListener('click', () => openVerificationModal(btn.dataset.id, btn.dataset.name, btn.dataset.phone, () => renderView(container)));
  });
}

function openVerificationModal(inquiryId, name, phone, onDone) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-header">
        <span class="modal-title">Verification Call — ${esc(name)} (${esc(phone)})</span>
        <button class="modal-close" id="jc-vc-close">✕</button>
      </div>
      <div class="modal-body">
        <label style="display:block;margin-bottom:8px;font-weight:600;">Outcome</label>
        <select id="jc-vc-status" style="width:100%;padding:8px;margin-bottom:12px;">
          <option value="confirmed_ok">Confirmed OK</option>
          <option value="issue_found">Issue found</option>
          <option value="unreachable">Could not reach customer</option>
        </select>
        <label style="display:block;margin-bottom:8px;font-weight:600;">Rating (1-5)</label>
        <input id="jc-vc-rating" type="number" min="1" max="5" style="width:100%;padding:8px;margin-bottom:12px;"/>
        <label style="display:block;margin-bottom:8px;font-weight:600;">Note</label>
        <textarea id="jc-vc-note" rows="3" style="width:100%;padding:8px;"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="jc-vc-cancel">Cancel</button>
        <button class="btn btn-primary" id="jc-vc-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#jc-vc-close').onclick = close;
  modal.querySelector('#jc-vc-cancel').onclick = close;
  modal.querySelector('#jc-vc-save').onclick = async () => {
    const status = modal.querySelector('#jc-vc-status').value;
    const ratingVal = modal.querySelector('#jc-vc-rating').value;
    const note = modal.querySelector('#jc-vc-note').value.trim();
    try {
      await apiPost(`/inquiries/${inquiryId}/verification-call`, {
        status, rating: ratingVal ? Number(ratingVal) : null, note,
      });
      toast('Verification call logged', 'success');
      close();
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

async function renderEntryForm(body, container, inquiryId) {
  body.innerHTML = `
    <div class="card"><div class="card-body">
      ${!inquiryId ? `<label style="display:block;margin-bottom:8px;font-weight:600;">Inquiry ID (paste from the Pending Entry list, or use "Enter →" there instead)</label>
      <input id="jc-manual-id" style="width:100%;padding:8px;margin-bottom:16px;" placeholder="paste inquiry id"/>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <div><label>Job Type</label><select id="jc-type" style="width:100%;padding:8px;"><option value="installation">Installation</option><option value="service">Service</option></select></div>
        <div><label>Category</label><select id="jc-category" style="width:100%;padding:8px;">${CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div>
        <div><label>Secondary Technician ID (optional)</label><input id="jc-secondary" style="width:100%;padding:8px;"/></div>
        <div><label>Start Time</label><input id="jc-start" type="datetime-local" style="width:100%;padding:8px;"/></div>
        <div><label>End Time</label><input id="jc-end" type="datetime-local" style="width:100%;padding:8px;"/></div>
        <div><label>Expected Time (minutes)</label><input id="jc-expected" type="number" style="width:100%;padding:8px;"/></div>
      </div>
      <div style="margin:16px 0;"><label><input type="checkbox" id="jc-rework"/> Rework needed</label></div>
      <label style="display:block;margin-bottom:8px;font-weight:600;">Work done note</label>
      <textarea id="jc-note" rows="2" style="width:100%;padding:8px;margin-bottom:16px;"></textarea>
      <label style="display:block;margin-bottom:8px;font-weight:600;">Items Installed / Used</label>
      <div id="jc-items"></div>
      <button class="btn btn-secondary btn-sm" id="jc-add-item" type="button">+ Add Item</button>
      <div style="margin-top:20px;"><button class="btn btn-primary" id="jc-save">Save Job Card</button></div>
    </div></div>`;

  const itemsEl = body.querySelector('#jc-items');
  const addItemRow = () => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 2fr auto;gap:8px;margin-bottom:8px;';
    row.innerHTML = `
      <input class="jc-item-name" placeholder="Item name"/>
      <input class="jc-item-qty" placeholder="Qty"/>
      <input class="jc-item-notes" placeholder="Notes"/>
      <button class="btn btn-secondary btn-sm jc-item-remove" type="button">✕</button>`;
    row.querySelector('.jc-item-remove').onclick = () => row.remove();
    itemsEl.appendChild(row);
  };
  body.querySelector('#jc-add-item').onclick = addItemRow;
  addItemRow();

  body.querySelector('#jc-save').onclick = async () => {
    const id = inquiryId || body.querySelector('#jc-manual-id')?.value.trim();
    if (!id) return toast('Inquiry ID is required', 'error');
    const items = Array.from(itemsEl.querySelectorAll('div')).map(row => ({
      item_name: row.querySelector('.jc-item-name').value.trim(),
      quantity: row.querySelector('.jc-item-qty').value.trim(),
      notes: row.querySelector('.jc-item-notes').value.trim(),
    })).filter(it => it.item_name);

    const toIso = (v) => v ? v.replace('T', ' ') + ':00' : null;
    try {
      await apiPost(`/inquiries/${id}/job-card`, {
        job_card_type: body.querySelector('#jc-type').value,
        category: body.querySelector('#jc-category').value,
        secondary_employee_id: body.querySelector('#jc-secondary').value.trim() || null,
        job_start_time: toIso(body.querySelector('#jc-start').value),
        job_end_time: toIso(body.querySelector('#jc-end').value),
        expected_time_minutes: Number(body.querySelector('#jc-expected').value) || null,
        work_done_note: body.querySelector('#jc-note').value.trim(),
        rework_required: body.querySelector('#jc-rework').checked,
        items,
      });
      toast('Job card saved — verification call reminder scheduled', 'success');
      currentView = 'pending';
      renderView(container);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

async function renderLeaderboard(body) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const data = await apiGet(`/admin/leaderboard?month=${month}`);
  const rows = data.leaderboard;
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Leaderboard — ${month}</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Technician</th><th>Avg Rating</th><th>Avg Time Efficiency</th><th>Jobs Verified</th><th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((r, i) => `
              <tr>
                <td>${i === 0 ? '🥇' : i + 1}</td>
                <td>${esc(r.name)}</td>
                <td>${r.avgRating != null ? r.avgRating.toFixed(1) : '—'}</td>
                <td>${r.avgTimeEfficiency != null ? Math.round(r.avgTimeEfficiency * 100) + '%' : '—'}</td>
                <td>${r.jobsCount}</td>
                <td>${data.awarded?.employee_id === r.employeeId
                  ? `<span style="color:var(--success);font-weight:700;">Awarded ₹${data.awarded.amount}</span>`
                  : `<button class="btn btn-primary btn-sm jc-award" data-id="${r.employeeId}" ${data.awarded ? 'disabled' : ''}>Award ₹2000</button>`}</td>
              </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-dim);">No verified jobs yet this month</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  body.querySelectorAll('.jc-award').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Award ₹2000 to this technician for ' + month + '?')) return;
      try {
        await apiPost(`/admin/leaderboard/${month}/award`, { employee_id: btn.dataset.id });
        toast('Award recorded', 'success');
        renderLeaderboard(body);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}
