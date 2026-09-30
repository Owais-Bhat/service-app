// Job Costing — what each job cost, what it earned, and what is waiting for
// someone to approve.
//
// This is the screen that turns work into money: a technician's materials
// arrive here for approval, labour and travel are added, and the invoice is
// prepared from what was approved rather than from anybody's memory.
//
// Nothing on this page invents a figure. Cost is approved materials at moving
// average plus actual labour, travel and subcontractor charges; revenue is what
// was invoiced before tax. Both are stated wherever a margin is shown.
import { toast, exportToCSV } from '../utils.js';
import { ICONS } from '../icons.js';
import { openMaterialsModal } from './job-materials.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const authHeaders = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method, headers: authHeaders(!!body), body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const when = (v) => v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const ymd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const TABS = [
  { key: 'pending', label: 'Awaiting Approval' },
  { key: 'jobs', label: 'Job Profitability' },
  { key: 'unbilled', label: 'Done, Not Billed' },
  { key: 'vans', label: 'Held by Technicians' },
];

const monthsAgo = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return ymd(d);
};

const state = { tab: 'pending', from: monthsAgo(3), to: ymd(new Date()) };
let pending = [];
let report = null;
let vans = null;

export async function renderJobCostingTab(container) {
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    await loadTab();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

async function loadTab() {
  if (state.tab === 'pending') pending = await api('GET', '/jobs/materials/pending');
  if (['jobs', 'unbilled'].includes(state.tab)) {
    report = await api('GET', `/jobs/profitability?from=${state.from}&to=${state.to}`);
  }
  if (state.tab === 'vans') vans = await api('GET', '/jobs/technician-stock');
}

function paint(container) {
  container.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1>Job Costing</h1>
          <p>What each job cost, what it earned, and what is waiting to be approved</p>
        </div>
        <div class="at2-headbtns">
          <button class="btn btn-secondary" id="jc-export">${ICONS.download}<span>Export</span></button>
          <button class="btn btn-primary" id="jc-record">${ICONS.plus}<span>Record materials used</span></button>
        </div>
      </div>

      ${kpiRow()}

      <div class="at2-tabs">
        ${TABS.map(t => `
          <button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-tab="${t.key}">
            ${t.label}${t.key === 'pending' && pending.length ? ` <b>(${pending.length})</b>` : ''}
          </button>`).join('')}
      </div>

      <div class="at2-panel">
        <div class="at2-filters">
          ${['jobs', 'unbilled'].includes(state.tab) ? `
            <label class="at2-dates">From <input type="date" id="jc-from" value="${state.from}"></label>
            <label class="at2-dates">To <input type="date" id="jc-to" value="${state.to}"></label>` : ''}
          <span class="at2-scope">${esc(scopeLine())}</span>
        </div>
        <div class="at2-body" id="jc-body"></div>
      </div>
    </div>`;

  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = async () => { state.tab = btn.dataset.tab; await loadTab(); paint(container); };
  });
  const from = container.querySelector('#jc-from');
  const to = container.querySelector('#jc-to');
  const reload = async () => {
    state.from = from.value || state.from;
    state.to = to.value || state.to;
    await loadTab();
    paint(container);
  };
  if (from) from.onchange = reload;
  if (to) to.onchange = reload;
  container.querySelector('#jc-export').onclick = () => exportCurrent();
  container.querySelector('#jc-record').onclick = () => openMaterialsModal({ onDone: async () => { await loadTab(); paint(container); } });

  paintBody(container);
}

function scopeLine() {
  if (state.tab === 'pending') return 'Materials a technician has submitted — stock moves only when these are approved';
  if (state.tab === 'vans') return 'Stock issued to a van and not yet used on a job or returned';
  return report ? report.scope.basis : '';
}

function kpiRow() {
  const kpi = (icon, label, value, tone) => `
    <div class="at2-kpi">
      <span class="at2-kpi-ico tone-${tone}">${icon || ''}</span>
      <div><div class="at2-kpi-label">${esc(label)}</div><div class="at2-kpi-value tone-${tone}">${value}</div></div>
    </div>`;

  if (state.tab === 'pending') {
    return `<div class="at2-kpis">
      ${kpi(ICONS.clock, 'Waiting for approval', String(pending.length), pending.length ? 'amber' : 'green')}
      ${kpi(ICONS.user, 'Technicians', String(new Set(pending.map(p => p.employee_name)).size), 'muted')}
      ${kpi(ICONS.box, 'Lines submitted', String(pending.reduce((s, p) => s + Number(p.line_count), 0)), 'muted')}
    </div>`;
  }
  if (state.tab === 'vans' && vans) {
    return `<div class="at2-kpis">
      ${kpi(ICONS.user, 'Vans holding stock', String(vans.vans.filter(v => v.items.length).length), 'muted')}
      ${kpi(ICONS.box, 'Value out with technicians', rupees(vans.total_value_paise), vans.total_value_paise ? 'amber' : 'green')}
    </div>`;
  }
  if (report) {
    const t = report.totals;
    return `<div class="at2-kpis">
      ${kpi(ICONS.receipt, 'Invoiced (before tax)', rupees(t.revenue_paise), 'green')}
      ${kpi(ICONS.wallet || ICONS.box, 'Cost of that work', rupees(t.cost_paise), 'muted')}
      ${kpi(ICONS.chart || ICONS.check, 'Margin', rupees(t.margin_paise), t.margin_paise >= 0 ? 'green' : 'red')}
      ${kpi(ICONS.alert, 'Done, not billed', String(t.unbilled_jobs), t.unbilled_jobs ? 'amber' : 'green')}
    </div>`;
  }
  return '';
}

function paintBody(container) {
  const body = container.querySelector('#jc-body');
  if (!body) return;
  if (state.tab === 'pending') return paintPending(container, body);
  if (state.tab === 'vans') return paintVans(body);
  return paintJobs(container, body);
}

function paintPending(container, body) {
  if (!pending.length) {
    body.innerHTML = '<div class="at2-empty">Nothing waiting. Materials a technician submits will appear here before they leave stock.</div>';
    return;
  }

  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Submitted</th><th>Job</th><th>Technician</th><th>From</th><th>Lines</th><th>Customer agreed</th><th></th></tr></thead>
      <tbody>
        ${pending.map(p => `
          <tr data-issue="${esc(p.id)}" style="cursor:pointer">
            <td style="white-space:nowrap">${esc(when(p.submitted_at))}<div style="font-size:0.7rem;color:var(--text-dim)"><code>${esc(p.issue_no || '')}</code></div></td>
            <td><b>${esc(p.job?.ticket_no || p.job_id.slice(0, 8))}</b>
              <div style="font-size:0.72rem;color:var(--text-dim)">${esc(p.job?.full_name || '')}</div></td>
            <td>${esc(p.employee_name || '—')}</td>
            <td>${esc(p.location_name || '—')}</td>
            <td>${p.line_count}${p.kind === 'returned' ? ' <span class="at2-chip muted">returning</span>' : ''}</td>
            <td>${Number(p.customer_approved) ? '<span class="at2-chip ok">yes</span>' : '<span class="at2-chip warn">not recorded</span>'}</td>
            <td>${ICONS['chevron-right'] || ''}</td>
          </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="at2-note">Approving moves the stock out of the technician's van and posts the cost. Rejecting moves nothing and asks why.</p>`;

  body.querySelectorAll('[data-issue]').forEach(tr => {
    tr.onclick = () => openIssue(container, tr.dataset.issue);
  });
}

function paintJobs(container, body) {
  if (!report) return;
  const rows = state.tab === 'unbilled' ? report.jobs.filter(j => j.unbilled) : report.jobs;

  if (!rows.length) {
    body.innerHTML = `<div class="at2-empty">${state.tab === 'unbilled'
      ? 'Every job with costs on it has been invoiced.'
      : 'No job costs recorded in this range yet.'}</div>`;
    return;
  }

  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Job</th><th>Customer</th><th>Date</th><th>Invoice</th>
        <th style="text-align:right">Materials</th><th style="text-align:right">Other</th>
        <th style="text-align:right">Invoiced</th><th style="text-align:right">Margin</th></tr></thead>
      <tbody>
        ${rows.map(j => {
    const tone = j.unbilled ? 'warn' : j.margin_paise >= 0 ? 'ok' : 'danger';
    return `
          <tr data-job="${esc(j.job_type)}:${esc(j.job_id)}" style="cursor:pointer">
            <td><b>${esc(j.ticket_no || j.job_id.slice(0, 8))}</b>
              <div style="font-size:0.72rem;color:var(--text-dim)">${esc(j.job_type)}${j.job_status ? ` · ${esc(j.job_status.replace(/_/g, ' '))}` : ''}</div></td>
            <td>${esc(j.customer || '—')}</td>
            <td style="white-space:nowrap">${esc(day(j.job_date))}</td>
            <td>${j.invoice_no ? `<code style="font-size:0.72rem">${esc(j.invoice_no)}</code>` : '<span class="at2-chip warn">not billed</span>'}</td>
            <td style="text-align:right">${rupees(j.material_cost_paise)}</td>
            <td style="text-align:right">${rupees(j.other_cost_paise)}</td>
            <td style="text-align:right">${rupees(j.revenue_paise)}</td>
            <td style="text-align:right">
              <b class="at2-chip ${tone}">${rupees(j.margin_paise)}${j.margin_pct !== null ? ` · ${j.margin_pct}%` : ''}</b>
            </td>
          </tr>`;
  }).join('')}
        <tr style="border-top:2px solid var(--border)">
          <td colspan="4"><b>Total</b></td>
          <td style="text-align:right"><b>${rupees(rows.reduce((s, j) => s + j.material_cost_paise, 0))}</b></td>
          <td style="text-align:right"><b>${rupees(rows.reduce((s, j) => s + j.other_cost_paise, 0))}</b></td>
          <td style="text-align:right"><b>${rupees(rows.reduce((s, j) => s + j.revenue_paise, 0))}</b></td>
          <td style="text-align:right"><b style="color:var(--primary)">${rupees(rows.reduce((s, j) => s + j.margin_paise, 0))}</b></td>
        </tr>
      </tbody>
    </table></div>
    <p class="at2-note">${esc(report.scope.basis)} Range: ${esc(report.scope.from)} to ${esc(report.scope.to)}.</p>`;

  body.querySelectorAll('[data-job]').forEach(tr => {
    tr.onclick = () => {
      const [jobType, jobId] = tr.dataset.job.split(':');
      openJob(container, jobType, jobId);
    };
  });
}

function paintVans(body) {
  if (!vans?.vans.length) {
    body.innerHTML = '<div class="at2-empty">No technician vans set up yet. Create one in Stock → Locations.</div>';
    return;
  }

  body.innerHTML = vans.vans.map(v => `
    <div class="card" style="margin-bottom:12px">
      <div class="card-header">
        <span class="card-title">${esc(v.location_name)}${v.employee_name ? ` · ${esc(v.employee_name)}` : ''}</span>
        <span class="at2-count">${rupees(v.value_paise)}</span>
      </div>
      ${v.items.length ? `
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Item</th><th style="text-align:right">Held</th><th style="text-align:right">Value</th></tr></thead>
        <tbody>
          ${v.items.map(i => `
            <tr><td>${esc(i.name)}</td>
              <td style="text-align:right"><b>${i.held_qty}</b> <small style="color:var(--text-dim)">${esc(i.base_unit || i.unit || '')}</small></td>
              <td style="text-align:right">${rupees(i.value_paise)}</td></tr>`).join('')}
        </tbody>
      </table></div>` : '<div style="padding:14px;color:var(--text-dim);font-size:0.86rem">Holding nothing.</div>'}
    </div>`).join('')
    + `<p class="at2-note">${esc(vans.scope.basis)}. This is stock the business still owns — it is neither sold nor spent until it is used on a job.</p>`;
}

// ── approving a technician's materials ──────────────────────────────────
async function openIssue(container, id) {
  let loaded;
  try { loaded = await api('GET', `/jobs/materials/${encodeURIComponent(id)}`); } catch (err) { return toast(err.message, 'error'); }
  const { issue, lines } = loaded;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:600px">
      <div class="modal-header">
        <span class="modal-title">${esc(issue.issue_no || 'Materials')}</span>
        <button class="modal-close" id="ji-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:14px;font-size:0.86rem;color:var(--text-soft)">
          ${esc(issue.employee_name || 'A technician')} submitted this ${esc(when(issue.submitted_at))}
          ${issue.location_name ? ` from <b>${esc(issue.location_name)}</b>` : ''}
          ${issue.kind === 'returned' ? ' as material coming <b>back</b>' : ''}.
          ${issue.note ? `<div style="margin-top:6px">${esc(issue.note)}</div>` : ''}
          ${Number(issue.customer_approved)
      ? `<div style="margin-top:6px;color:var(--primary)">Customer agreed${issue.customer_approval_note ? ` — ${esc(issue.customer_approval_note)}` : ''}</div>`
      : '<div style="margin-top:6px;color:var(--warning)">No customer approval recorded for this work</div>'}
        </div>

        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Item</th><th style="text-align:right">Quantity</th><th style="text-align:right">To charge</th></tr></thead>
          <tbody>
            ${lines.map(l => `
              <tr>
                <td>${esc(l.item_name || l.description)}${!l.item_id ? ' <span class="at2-chip muted">not from stock</span>' : ''}</td>
                <td style="text-align:right">${Number(l.quantity)}${l.unit ? ` ${esc(l.unit)}` : ''}
                  ${Number(l.base_quantity) !== Number(l.quantity) ? `<div style="font-size:0.7rem;color:var(--text-dim)">= ${Number(l.base_quantity)} ${esc(l.base_unit || '')}</div>` : ''}</td>
                <td style="text-align:right">${Number(l.sell_rate_paise) ? rupees(l.sell_rate_paise) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>

        ${issue.status !== 'submitted' ? `
          <p class="at2-note">Already ${esc(issue.status)}${issue.approved_by_name ? ` by ${esc(issue.approved_by_name)}` : ''}${issue.rejected_reason ? ` — ${esc(issue.rejected_reason)}` : ''}.
          ${Number(issue.cost_paise) ? ` Cost posted: ${rupees(issue.cost_paise)}.` : ''}</p>` : `
          <p class="at2-note">Approving takes these out of the van and posts their cost against the job. Nothing has moved yet.</p>`}
      </div>
      <div class="modal-footer" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="ji-cancel">Close</button>
        ${issue.status === 'submitted' ? `
          <button class="btn btn-secondary" id="ji-reject">Reject</button>
          <button class="btn btn-primary" id="ji-approve">Approve</button>` : ''}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#ji-close').onclick = close;
  $('#ji-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  if ($('#ji-approve')) {
    $('#ji-approve').onclick = async () => {
      $('#ji-approve').disabled = true;
      try {
        const out = await api('POST', `/jobs/materials/${issue.id}/approve`);
        toast(`Approved — ${rupees(out.issue.cost_paise)} posted to the job`, 'success');
        close();
        await loadTab();
        paint(container);
      } catch (err) {
        toast(err.message, 'error');
        $('#ji-approve').disabled = false;
      }
    };
  }

  if ($('#ji-reject')) {
    $('#ji-reject').onclick = async () => {
      const reason = prompt('Why is this being rejected? The technician will see it, and it stays on record.');
      if (!reason) return;
      try {
        await api('POST', `/jobs/materials/${issue.id}/reject`, { reason });
        toast('Rejected — nothing moved', 'success');
        close();
        await loadTab();
        paint(container);
      } catch (err) { toast(err.message, 'error'); }
    };
  }
}

// ── one job, in full ────────────────────────────────────────────────────
async function openJob(container, jobType, jobId) {
  let summary;
  try {
    summary = await api('GET', `/jobs/${jobType}/${jobId}/summary`);
  } catch (err) { return toast(err.message, 'error'); }

  const { job, issues, material_lines: materials, costs, documents, totals: t } = summary;
  const invoice = documents.find(d => d.doc_type === 'invoice' && d.status !== 'cancelled');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:760px">
      <div class="modal-header">
        <span class="modal-title">${esc(job.ticket_no || 'Job')}</span>
        <button class="modal-close" id="jd-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px">
          <div>
            <div style="font-weight:800;font-size:1rem">${esc(job.customer || '—')}</div>
            <div style="font-size:0.82rem;color:var(--text-dim)">${esc(job.phone || '')} · ${esc(job.type)}${job.status ? ` · ${esc(job.status.replace(/_/g, ' '))}` : ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:1.25rem;font-weight:800;color:${t.margin_paise >= 0 ? 'var(--primary)' : 'var(--danger)'}">
              ${rupees(t.margin_paise)}${t.margin_pct !== null ? ` · ${t.margin_pct}%` : ''}
            </div>
            <div style="font-size:0.8rem;color:var(--text-dim)">margin</div>
          </div>
        </div>

        <div class="at2-kpis" style="margin-bottom:14px">
          ${[['Estimated cost', rupees(t.estimated_cost_paise), 'muted'],
      ['Materials used', rupees(t.material_cost_paise), 'muted'],
      ['Labour & travel', rupees(t.other_cost_paise), 'muted'],
      ['Invoiced', rupees(t.revenue_paise), 'green']]
      .map(([l, v, tone]) => `
        <div class="at2-kpi">
          <span class="at2-kpi-ico tone-${tone}">${ICONS.receipt}</span>
          <div><div class="at2-kpi-label">${l}</div><div class="at2-kpi-value tone-${tone}">${v}</div></div>
        </div>`).join('')}
        </div>

        <div class="card" style="margin-bottom:12px">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <span class="card-title">Materials ${t.pending_approvals ? `<span class="at2-chip warn">${t.pending_approvals} waiting</span>` : ''}</span>
            <button class="btn btn-secondary btn-sm" id="jd-addmat">Record materials</button></div>
          ${materials.length ? `<div class="table-wrap"><table class="at2-tbl">
            <thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Cost</th><th>State</th></tr></thead>
            <tbody>
              ${materials.map(m => `
                <tr>
                  <td>${esc(m.item_name || m.description)}${m.kind === 'returned' ? ' <span class="at2-chip muted">returned</span>' : ''}</td>
                  <td style="text-align:right">${Number(m.base_quantity)}</td>
                  <td style="text-align:right">${rupees(m.cost_paise)}</td>
                  <td><span class="at2-chip ${m.status === 'approved' ? 'ok' : m.status === 'rejected' ? 'danger' : 'warn'}">${esc(m.status)}</span></td>
                </tr>`).join('')}
            </tbody>
          </table></div>` : '<div style="padding:14px;color:var(--text-dim);font-size:0.84rem">No materials recorded on this job yet.</div>'}
        </div>

        ${costs.length ? `
        <div class="card" style="margin-bottom:12px">
          <div class="card-header"><span class="card-title">Labour, travel &amp; other</span></div>
          <div class="table-wrap"><table class="at2-tbl">
            <thead><tr><th>What</th><th>Basis</th><th style="text-align:right">Qty × rate</th><th style="text-align:right">Amount</th><th></th></tr></thead>
            <tbody>
              ${costs.map(c => `
                <tr>
                  <td>${esc(c.description || c.kind)}${c.billable ? '' : ' <span class="at2-chip muted">not billed on</span>'}</td>
                  <td><span class="at2-chip ${c.basis === 'estimate' ? 'muted' : 'ok'}">${esc(c.basis)}</span></td>
                  <td style="text-align:right">${Number(c.quantity)} × ${rupees(c.rate_paise)}</td>
                  <td style="text-align:right"><b>${rupees(c.amount_paise)}</b></td>
                  <td><button class="at2-photo" data-delcost="${esc(c.id)}" title="Remove">${ICONS.close}</button></td>
                </tr>`).join('')}
            </tbody>
          </table></div>
        </div>` : ''}

        <div class="card">
          <div class="card-header"><span class="card-title">Add a cost</span></div>
          <div style="padding:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end">
            <div class="form-group" style="margin:0"><label>What</label>
              <select id="jc-kind">
                <option value="labour">Labour (hours)</option>
                <option value="travel">Travel (km)</option>
                <option value="subcontract">Subcontractor</option>
                <option value="other">Other</option>
              </select></div>
            <div class="form-group" style="margin:0"><label>Note</label><input type="text" id="jc-desc" placeholder="e.g. 3 hours on site"></div>
            <div class="form-group" style="margin:0"><label>Quantity</label><input type="number" id="jc-qty" step="0.01" value="1"></div>
            <div class="form-group" style="margin:0"><label>Rate ₹</label><input type="number" id="jc-rate" step="0.01"></div>
            <label class="at2-check"><input type="checkbox" id="jc-billable" checked> Charge to the customer</label>
            <button class="btn btn-secondary" id="jc-addcost">Add</button>
          </div>
        </div>

        ${invoice ? `
          <p class="at2-note">Invoice ${esc(invoice.doc_no || 'draft')} · ${esc(invoice.status)} · ${rupees(invoice.total_paise)}</p>` : ''}
        <p class="at2-note">${esc(summary.basis)}</p>
      </div>
      <div class="modal-footer" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="jd-cancel">Close</button>
        ${invoice ? '' : '<button class="btn btn-primary" id="jd-invoice">Prepare invoice</button>'}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#jd-close').onclick = close;
  $('#jd-cancel').onclick = close;
  $('#jd-addmat').onclick = () => openMaterialsModal({
    job: {
      job_type: jobType, job_id: jobId, ticket_no: job.ticket_no, full_name: job.customer, phone: job.phone,
      what: job.type, status: job.status, assigned_employee_id: job.assigned_employee_id,
    },
    onDone: async () => { close(); await loadTab(); paint(container); openJob(container, jobType, jobId); },
  });
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  $('#jc-addcost').onclick = async () => {
    const payload = {
      job_type: jobType, job_id: jobId,
      kind: $('#jc-kind').value,
      description: $('#jc-desc').value.trim(),
      quantity: Number($('#jc-qty').value) || 1,
      rate: $('#jc-rate').value || 0,
      billable: $('#jc-billable').checked,
    };
    if (!(Number(payload.rate) > 0)) return toast('Enter the rate', 'warning');
    try {
      await api('POST', '/jobs/costs', payload);
      toast('Cost added', 'success');
      close();
      openJob(container, jobType, jobId);
    } catch (err) { toast(err.message, 'error'); }
  };

  overlay.querySelectorAll('[data-delcost]').forEach(btn => {
    btn.onclick = async () => {
      const reason = prompt('A posted cost is reversed, not deleted. Why is it coming off?');
      if (!reason) return;
      try {
        await api('DELETE', `/jobs/costs/${btn.dataset.delcost}`, { reason });
        toast('Cost reversed', 'success');
        close();
        openJob(container, jobType, jobId);
      } catch (err) { toast(err.message, 'error'); }
    };
  });

  if ($('#jd-invoice')) {
    $('#jd-invoice').onclick = async () => {
      $('#jd-invoice').disabled = true;
      try {
        const out = await api('POST', `/jobs/${jobType}/${jobId}/invoice`, {});
        toast(out.reused ? 'This job already has an invoice' : 'Invoice drafted — open Sales to issue it', 'success');
        close();
        await loadTab();
        paint(container);
      } catch (err) {
        toast(err.message, 'error');
        $('#jd-invoice').disabled = false;
      }
    };
  }
}

function exportCurrent() {
  if (state.tab === 'pending') {
    if (!pending.length) return toast('Nothing to export', 'info');
    return exportToCSV(`materials-awaiting-approval-${ymd(new Date())}.csv`, pending.map(p => ({
      Submitted: when(p.submitted_at), No: p.issue_no || '',
      Job: p.job?.ticket_no || p.job_id, Customer: p.job?.full_name || '',
      Technician: p.employee_name || '', From: p.location_name || '',
      Lines: p.line_count, Kind: p.kind, 'Customer agreed': Number(p.customer_approved) ? 'Yes' : 'No',
    })));
  }
  if (state.tab === 'vans' && vans) {
    const rows = [];
    vans.vans.forEach(v => v.items.forEach(i => rows.push({
      Van: v.location_name, Technician: v.employee_name || '',
      Item: i.name, Held: i.held_qty, Unit: i.base_unit || i.unit || '',
      'Value (₹)': (Number(i.value_paise) / 100).toFixed(2),
    })));
    if (!rows.length) return toast('Nothing to export', 'info');
    return exportToCSV(`technician-stock-${ymd(new Date())}.csv`, rows);
  }
  if (report) {
    const rows = state.tab === 'unbilled' ? report.jobs.filter(j => j.unbilled) : report.jobs;
    if (!rows.length) return toast('Nothing to export', 'info');
    return exportToCSV(`job-profitability-${state.from}-to-${state.to}.csv`, rows.map(j => ({
      Job: j.ticket_no || j.job_id, Type: j.job_type, Customer: j.customer || '',
      Date: j.job_date ? ymd(j.job_date) : '', Invoice: j.invoice_no || '',
      'Materials (₹)': (j.material_cost_paise / 100).toFixed(2),
      'Other cost (₹)': (j.other_cost_paise / 100).toFixed(2),
      'Invoiced (₹)': (j.revenue_paise / 100).toFixed(2),
      'Margin (₹)': (j.margin_paise / 100).toFixed(2),
      'Margin %': j.margin_pct ?? '',
    })));
  }
  toast('Nothing to export on this tab', 'info');
}
