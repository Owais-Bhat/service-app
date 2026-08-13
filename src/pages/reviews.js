// Bonus Reviews — employees claim Google/Job Card review bonus points for a
// completed job; admin verifies each claim before it counts toward the
// leaderboard. SMS-type claims are auto-created by the server (see
// /api/feedback/submit) and never submitted here — they just show up in
// the admin queue alongside the employee-submitted ones.
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

const REVIEW_TYPE_LABEL = { google: 'Google Review', job_card: 'Job Card Review', sms: 'SMS Feedback Review' };
const REVIEW_TYPE_POINTS_LABEL = { google: 'up to 30 pts (5★ only)', job_card: '10 pts', sms: '10 pts' };

const statusBadge = (status) => {
  const color = status === 'approved' ? 'var(--success)' : status === 'rejected' ? 'var(--danger)' : 'var(--warning)';
  return `<span style="color:${color};font-weight:700;text-transform:capitalize;">${esc(status)}</span>`;
};

// ─── Employee side ──────────────────────────────────────────────────────

export async function renderEmployeeReviewsTab(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${ICONS.star}</span>
          <span>Bonus Reviews</span>
        </h1>
        <p>Claim leaderboard bonus points for a Google review or job card review — admin verifies before it counts.</p>
      </div>
    </div>
    <div id="rv-body"><p style="padding:20px;color:var(--text-dim);">Loading…</p></div>
  `;
  const body = container.querySelector('#rv-body');
  try {
    const [jobs, mine] = await Promise.all([
      apiGet('/review-submissions/eligible-jobs'),
      apiGet('/review-submissions/mine'),
    ]);
    renderEmployeeBody(body, jobs, mine, container);
  } catch (err) {
    body.innerHTML = `<p style="padding:20px;color:var(--danger);">${esc(err.message)}</p>`;
  }
}

function reviewTypeOptionsFor(jobCardType) {
  if (jobCardType === 'installation') return ['google', 'job_card'];
  return ['google']; // service — SMS review is automatic, not submitted here
}

function renderEmployeeBody(body, jobs, mine, container) {
  body.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><span class="card-title">New Claim</span></div>
      <div class="card-body">
        ${!jobs.length ? '<p style="color:var(--text-dim);">No completed jobs available to claim yet.</p>' : `
        <label style="display:block;margin-bottom:8px;font-weight:600;">Job</label>
        <select id="rv-job" style="width:100%;padding:8px;margin-bottom:16px;">
          ${jobs.map(j => `<option value="${esc(j.id)}" data-type="${esc(j.job_card_type)}">${esc(j.ticket_no || j.id.slice(0, 8))} — ${esc(j.full_name || 'Customer')} (${j.job_card_type})</option>`).join('')}
        </select>
        <label style="display:block;margin-bottom:8px;font-weight:600;">Review Type</label>
        <select id="rv-type" style="width:100%;padding:8px;margin-bottom:16px;"></select>
        <label style="display:block;margin-bottom:8px;font-weight:600;">Screenshot / Proof Photo</label>
        <input id="rv-photo" type="file" accept="image/*" style="margin-bottom:16px;"/>
        <label style="display:flex;align-items:flex-start;gap:8px;margin-bottom:16px;cursor:pointer;">
          <input type="checkbox" id="rv-policy" style="margin-top:3px;"/>
          <span>I confirm this proof is genuine and was submitted by the actual customer for this job. Submitting false or fabricated reviews may result in disciplinary action.</span>
        </label>
        <button class="btn btn-primary" id="rv-submit">Submit Claim</button>
        `}
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">My Submissions</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ticket</th><th>Type</th><th>Status</th><th>Points</th><th>Note</th></tr></thead>
          <tbody>
            ${mine.length ? mine.map(r => `
              <tr>
                <td>${esc(r.ticket_no || '—')}</td>
                <td>${REVIEW_TYPE_LABEL[r.review_type] || esc(r.review_type)}</td>
                <td>${statusBadge(r.status)}</td>
                <td>${r.points != null ? r.points : '—'}</td>
                <td>${esc(r.admin_note || '—')}</td>
              </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-dim);">No submissions yet</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (!jobs.length) return;

  const jobSelect = body.querySelector('#rv-job');
  const typeSelect = body.querySelector('#rv-type');
  const refreshTypeOptions = () => {
    const selected = jobSelect.selectedOptions[0];
    const jobCardType = selected?.dataset.type;
    const options = reviewTypeOptionsFor(jobCardType);
    typeSelect.innerHTML = options.map(t => `<option value="${t}">${REVIEW_TYPE_LABEL[t]} (${REVIEW_TYPE_POINTS_LABEL[t]})</option>`).join('');
  };
  jobSelect.addEventListener('change', refreshTypeOptions);
  refreshTypeOptions();

  body.querySelector('#rv-submit').addEventListener('click', async () => {
    const inquiryId = jobSelect.value;
    const reviewType = typeSelect.value;
    const photoInput = body.querySelector('#rv-photo');
    const policyChecked = body.querySelector('#rv-policy').checked;
    if (!photoInput.files[0]) return toast('Please attach a photo', 'error');
    if (!policyChecked) return toast('Please agree to the policy checkbox', 'error');

    const btn = body.querySelector('#rv-submit');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      const formData = new FormData();
      formData.append('photo', photoInput.files[0]);
      formData.append('inquiry_id', inquiryId);
      formData.append('review_type', reviewType);
      formData.append('policy_agreed', 'true');
      const res = await fetch(`${API}/review-submissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit');
      toast('Claim submitted — admin will verify it', 'success');
      renderEmployeeReviewsTab(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Claim';
    }
  });
}

// ─── Admin side ─────────────────────────────────────────────────────────

let currentStatus = 'pending';

export async function renderAdminReviewsTab(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${ICONS.star}</span>
          <span>Bonus Reviews</span>
        </h1>
        <p>Verify employee-submitted Google/Job Card review claims and the auto-collected SMS feedback reviews.</p>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
      <button class="btn btn-secondary rv-status-nav" data-status="pending">Pending</button>
      <button class="btn btn-secondary rv-status-nav" data-status="approved">Approved</button>
      <button class="btn btn-secondary rv-status-nav" data-status="rejected">Rejected</button>
    </div>
    <div id="rv-admin-body"></div>
  `;
  container.querySelectorAll('.rv-status-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      currentStatus = btn.dataset.status;
      renderAdminBody(container);
    });
  });
  renderAdminBody(container);
}

async function renderAdminBody(container) {
  const body = container.querySelector('#rv-admin-body');
  container.querySelectorAll('.rv-status-nav').forEach(b => b.classList.toggle('btn-primary', b.dataset.status === currentStatus));
  body.innerHTML = '<p style="padding:20px;color:var(--text-dim);">Loading…</p>';
  try {
    const rows = await apiGet(`/review-submissions?status=${currentStatus}`);
    if (!rows.length) {
      body.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim);">No ${currentStatus} submissions.</div></div>`;
      return;
    }
    body.innerHTML = `
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Ticket</th><th>Customer</th><th>Type</th><th>Photo</th><th>Rating</th><th>Status</th><th>Points</th>${currentStatus === 'pending' ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${esc(r.employee_name || '—')}</td>
                  <td>${esc(r.ticket_no || '—')}</td>
                  <td>${esc(r.customer_name || '—')}</td>
                  <td>${REVIEW_TYPE_LABEL[r.review_type] || esc(r.review_type)}</td>
                  <td>${r.photo_url ? `<a href="${esc(r.photo_url)}" target="_blank" rel="noopener"><img src="${esc(r.photo_url)}" alt="Proof" style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1px solid var(--border);"/></a>` : '<span style="color:var(--text-dim)">—</span>'}</td>
                  <td>${r.star_rating != null ? '★'.repeat(r.star_rating) : '—'}</td>
                  <td>${statusBadge(r.status)}</td>
                  <td>${r.points != null ? r.points : '—'}</td>
                  ${currentStatus === 'pending' ? `<td>
                    <div style="display:flex;gap:6px;">
                      <button class="btn btn-primary btn-sm rv-approve" data-id="${esc(r.id)}" data-type="${esc(r.review_type)}">Approve</button>
                      <button class="btn btn-danger btn-sm rv-reject" data-id="${esc(r.id)}">Reject</button>
                    </div>
                  </td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    body.querySelectorAll('.rv-approve').forEach(btn => {
      btn.addEventListener('click', () => openApproveModal(btn.dataset.id, btn.dataset.type, container));
    });
    body.querySelectorAll('.rv-reject').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Reject this submission?')) return;
        try {
          await apiPost(`/review-submissions/${btn.dataset.id}/verify`, { status: 'rejected' });
          toast('Submission rejected', 'success');
          renderAdminBody(container);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<p style="padding:20px;color:var(--danger);">${esc(err.message)}</p>`;
  }
}

function openApproveModal(id, reviewType, container) {
  const needsStarRating = reviewType === 'google';
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <span class="modal-title">Approve — ${esc(REVIEW_TYPE_LABEL[reviewType] || reviewType)}</span>
        <button class="modal-close" id="rv-approve-close">✕</button>
      </div>
      <div class="modal-body">
        ${needsStarRating ? `
        <label style="display:block;margin-bottom:8px;font-weight:600;">Star rating on the screenshot (1-5)</label>
        <input id="rv-approve-stars" type="number" min="1" max="5" style="width:100%;padding:8px;margin-bottom:12px;"/>
        <p style="color:var(--text-dim);font-size:0.85rem;margin-bottom:12px;">Only 5★ reviews earn the 30-point bonus — 1-4★ still saves as approved, with 0 points.</p>
        ` : ''}
        <label style="display:block;margin-bottom:8px;font-weight:600;">Note (optional)</label>
        <textarea id="rv-approve-note" rows="2" style="width:100%;padding:8px;"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="rv-approve-cancel">Cancel</button>
        <button class="btn btn-primary" id="rv-approve-save">Approve</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#rv-approve-close').onclick = close;
  modal.querySelector('#rv-approve-cancel').onclick = close;
  modal.querySelector('#rv-approve-save').onclick = async () => {
    const starsVal = needsStarRating ? modal.querySelector('#rv-approve-stars').value : null;
    if (needsStarRating && (!starsVal || Number(starsVal) < 1 || Number(starsVal) > 5)) {
      return toast('Enter a star rating from 1 to 5', 'error');
    }
    const note = modal.querySelector('#rv-approve-note').value.trim();
    try {
      await apiPost(`/review-submissions/${id}/verify`, {
        status: 'approved',
        star_rating: starsVal ? Number(starsVal) : null,
        admin_note: note || null,
      });
      toast('Submission approved', 'success');
      close();
      renderAdminBody(container);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}
