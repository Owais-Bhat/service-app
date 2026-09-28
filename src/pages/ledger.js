// Accounts — the ledger the rest of the system will post into.
//
// Six things live here, all reading from posted journals rather than from
// stored status fields: the journal list, the trial balance, the chart of
// accounts, opening balances, period locks and the audit trail. A posted
// journal is never edited; a mistake is corrected by a reversal that points
// back at it, and both stay visible.
import { toast, exportToCSV } from '../utils.js';
import { ICONS } from '../icons.js';

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
  { key: 'journals', label: 'Journals' },
  { key: 'trial', label: 'Trial Balance' },
  { key: 'coa', label: 'Chart of Accounts' },
  { key: 'opening', label: 'Opening Balances' },
  { key: 'locks', label: 'Period Locks' },
  { key: 'audit', label: 'Audit Trail' },
];

const SOURCE_LABEL = {
  manual: 'Manual entry', opening: 'Opening balance', invoice: 'Invoice',
  credit_note: 'Credit note', payment: 'Payment', purchase: 'Purchase', stock: 'Stock',
};

// A financial year of context by default — a figure without its date range is a
// figure waiting to be misread.
const fyStart = () => {
  const now = new Date();
  const year = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
};

const state = { tab: 'journals', from: fyStart(), to: ymd(new Date()) };
let journals = [];
let accounts = [];
let trial = null;
let locks = [];
let audit = [];
let parties = [];

export async function renderLedgerTab(container) {
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    accounts = await api('GET', '/accounting/accounts');
    await loadTab();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint(container);
}

async function loadTab() {
  const range = `from=${state.from}&to=${state.to}`;
  if (state.tab === 'journals') journals = await api('GET', `/accounting/journals?${range}&limit=300`);
  if (state.tab === 'trial') trial = await api('GET', `/accounting/trial-balance?${range}`);
  if (state.tab === 'coa') accounts = await api('GET', '/accounting/accounts');
  if (state.tab === 'locks') locks = await api('GET', '/accounting/period-locks');
  if (state.tab === 'audit') audit = await api('GET', '/accounting/audit?limit=200');
  if (state.tab === 'opening') {
    accounts = await api('GET', '/accounting/accounts');
    parties = await api('GET', '/parties?kind=all&limit=1000');
  }
}

function paint(container) {
  container.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1 class="at2-title">Accounts</h1>
          <p class="at2-sub">Double-entry ledger — every financial report in NEST reads from these journals</p>
        </div>
        <div class="at2-headbtns">
          <button class="btn btn-secondary" id="lg-export">${ICONS.download}<span>Export</span></button>
          <button class="btn btn-primary" id="lg-new">${ICONS.plus}<span>Journal Entry</span></button>
        </div>
      </div>

      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="at2-panel">
        <div class="at2-filters">
          <label class="at2-dates">From <input type="date" id="lg-from" value="${state.from}"></label>
          <label class="at2-dates">To <input type="date" id="lg-to" value="${state.to}"></label>
          <span class="at2-scope">${scopeLine()}</span>
        </div>
        <div class="at2-body" id="lg-body"></div>
      </div>
    </div>`;

  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = async () => {
      state.tab = btn.dataset.tab;
      await loadTab();
      paint(container);
    };
  });
  const reload = async () => {
    state.from = container.querySelector('#lg-from').value || state.from;
    state.to = container.querySelector('#lg-to').value || state.to;
    await loadTab();
    paint(container);
  };
  container.querySelector('#lg-from').onchange = reload;
  container.querySelector('#lg-to').onchange = reload;
  container.querySelector('#lg-new').onclick = () => openJournalModal(container);
  container.querySelector('#lg-export').onclick = () => exportCurrent();

  paintBody(container);
}

function scopeLine() {
  if (['coa', 'locks', 'audit', 'opening'].includes(state.tab)) return 'Dates apply to Journals and the Trial Balance';
  return `Posted journals dated ${day(state.from)} — ${day(state.to)}`;
}

function paintBody(container) {
  const body = container.querySelector('#lg-body');
  if (!body) return;
  if (state.tab === 'journals') return paintJournals(container, body);
  if (state.tab === 'trial') return paintTrial(body);
  if (state.tab === 'coa') return paintAccounts(container, body);
  if (state.tab === 'opening') return paintOpening(container, body);
  if (state.tab === 'locks') return paintLocks(container, body);
  if (state.tab === 'audit') return paintAudit(body);
}

function paintJournals(container, body) {
  if (!journals.length) {
    body.innerHTML = '<div class="at2-empty">No journals in this range. Invoices, payments and stock movements will post here as those modules come online.</div>';
    return;
  }

  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>No.</th><th>Date</th><th>Narration</th><th>Source</th><th>By</th><th style="text-align:right">Amount</th><th></th></tr></thead>
      <tbody>
        ${journals.map(j => `
          <tr data-open="${esc(j.id)}" style="cursor:pointer">
            <td><code style="font-size:0.72rem">${esc(j.journal_no || '—')}</code></td>
            <td style="white-space:nowrap">${esc(day(j.journal_date))}</td>
            <td>${esc(j.narration || '—')}
              ${j.status === 'reversed' ? ' <span class="at2-chip danger">Reversed</span>' : ''}
              ${j.reversal_of_id ? ' <span class="at2-chip muted">Reversal</span>' : ''}</td>
            <td><span class="at2-chip ${j.source_type === 'manual' ? 'muted' : 'green'}">${esc(SOURCE_LABEL[j.source_type] || j.source_type)}</span></td>
            <td>${esc(j.posted_by_name || '—')}</td>
            <td style="text-align:right;white-space:nowrap"><b>${rupees(j.total_paise)}</b></td>
            <td>${ICONS['chevron-right'] || ''}</td>
          </tr>`).join('')}
      </tbody>
    </table></div>`;

  body.querySelectorAll('[data-open]').forEach(tr => {
    tr.onclick = () => openJournalDetail(container, tr.dataset.open);
  });
}

function paintTrial(body) {
  if (!trial) return;
  const used = trial.accounts.filter(a => a.debit_paise || a.credit_paise);

  body.innerHTML = `
    <div class="at2-kpis" style="margin:0 0 14px">
      ${[['Debits', rupees(trial.totals.debit_paise), 'green'],
      ['Credits', rupees(trial.totals.credit_paise), 'green'],
      ['Status', trial.balanced ? 'Balanced' : 'OUT OF BALANCE', trial.balanced ? 'green' : 'red']]
      .map(([l, v, tone]) => `
        <div class="at2-kpi">
          <span class="at2-kpi-ico tone-${tone}">${ICONS.chart || ICONS.receipt}</span>
          <div><div class="at2-kpi-label">${l}</div><div class="at2-kpi-value tone-${tone}">${v}</div></div>
        </div>`).join('')}
    </div>

    ${used.length ? `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Code</th><th>Account</th><th>Type</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
      <tbody>
        ${used.map(a => `
          <tr>
            <td><code style="font-size:0.72rem">${esc(a.code)}</code></td>
            <td><b>${esc(a.name)}</b></td>
            <td><span class="at2-chip muted">${esc(a.type)}</span></td>
            <td style="text-align:right">${a.debit_paise ? rupees(a.debit_paise) : '—'}</td>
            <td style="text-align:right">${a.credit_paise ? rupees(a.credit_paise) : '—'}</td>
            <td style="text-align:right"><b>${rupees(a.balance_paise)}</b></td>
          </tr>`).join('')}
        <tr style="border-top:2px solid var(--border)">
          <td colspan="3"><b>Total</b></td>
          <td style="text-align:right"><b>${rupees(trial.totals.debit_paise)}</b></td>
          <td style="text-align:right"><b>${rupees(trial.totals.credit_paise)}</b></td>
          <td></td>
        </tr>
      </tbody>
    </table></div>
    <p class="at2-note">Scope: ${esc(trial.scope.basis)}, ${esc(trial.scope.from)} to ${esc(trial.scope.to)}. Accounts with no movement in the range are hidden.</p>`
      : '<div class="at2-empty">No postings in this range yet.</div>'}`;
}

function paintAccounts(container, body) {
  const groups = ['asset', 'liability', 'equity', 'income', 'expense'];
  body.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn btn-secondary" id="lg-new-account">${ICONS.plus}<span>Add Account</span></button>
    </div>
    ${groups.map(g => {
    const list = accounts.filter(a => a.type === g);
    if (!list.length) return '';
    return `
      <div class="card" style="margin-bottom:12px">
        <div class="card-header"><span class="card-title" style="text-transform:capitalize">${g}</span><span class="at2-count">${list.length}</span></div>
        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Code</th><th>Name</th><th>Group</th><th style="text-align:right">Opening</th><th></th></tr></thead>
          <tbody>
            ${list.map(a => `
              <tr>
                <td><code style="font-size:0.72rem">${esc(a.code)}</code></td>
                <td><b>${esc(a.name)}</b>${a.is_system ? ' <span class="at2-chip muted">system</span>' : ''}${a.active ? '' : ' <span class="at2-chip danger">off</span>'}</td>
                <td>${esc(a.subtype)}</td>
                <td style="text-align:right">${Number(a.opening_balance_paise) ? rupees(a.opening_balance_paise) : '—'}</td>
                <td><button class="at2-photo" data-acct="${esc(a.id)}" title="Edit">${ICONS.edit}</button></td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;
  }).join('')}
    <p class="at2-note">System accounts are addressed by the posting engine and cannot be switched off. Add your own for anything else.</p>`;

  body.querySelector('#lg-new-account').onclick = () => openAccountModal(container);
  body.querySelectorAll('[data-acct]').forEach(btn => {
    btn.onclick = () => {
      const account = accounts.find(a => a.id === btn.dataset.acct);
      if (account) openAccountModal(container, account);
    };
  });
}

// Opening balances are entered on the party and the account, then posted as one
// journal against Opening Balance Equity, so the books start balanced and
// nothing is invented.
function paintOpening(container, body) {
  const withOpening = parties.filter(p => Number(p.opening_balance_paise));
  const acctOpening = accounts.filter(a => Number(a.opening_balance_paise));
  const receivable = withOpening.filter(p => p.opening_balance_type !== 'payable')
    .reduce((s, p) => s + Number(p.opening_balance_paise), 0);
  const payable = withOpening.filter(p => p.opening_balance_type === 'payable')
    .reduce((s, p) => s + Number(p.opening_balance_paise), 0);

  body.innerHTML = `
    <div class="at2-kpis" style="margin:0 0 14px">
      ${[['Customers owe us', rupees(receivable), 'amber'],
      ['We owe suppliers', rupees(payable), 'amber'],
      ['Accounts with an opening', String(acctOpening.length), 'green']]
      .map(([l, v, tone]) => `
        <div class="at2-kpi">
          <span class="at2-kpi-ico tone-${tone}">${ICONS.receipt}</span>
          <div><div class="at2-kpi-label">${l}</div><div class="at2-kpi-value tone-${tone}">${v}</div></div>
        </div>`).join('')}
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Post the opening balances</span></div>
      <div style="padding:14px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div class="form-group" style="margin:0">
          <label>As on</label>
          <input type="date" id="lg-open-date" value="${fyStart()}">
        </div>
        <button class="btn btn-primary" id="lg-post-open">Post opening journal</button>
        <p class="at2-note" style="flex:1;min-width:240px;margin:0">
          Balances come from what is entered on each customer, supplier and account. Running this twice for the same
          date returns the journal already posted instead of doubling the books.
        </p>
      </div>
    </div>

    ${withOpening.length ? `
    <div class="card" style="margin-top:12px">
      <div class="card-header"><span class="card-title">Party openings</span><span class="at2-count">${withOpening.length}</span></div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Party</th><th>Side</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>
          ${withOpening.map(p => `
            <tr>
              <td><b>${esc(p.display_name)}</b></td>
              <td><span class="at2-chip ${p.opening_balance_type === 'payable' ? 'warn' : 'green'}">${p.opening_balance_type === 'payable' ? 'we owe' : 'they owe'}</span></td>
              <td style="text-align:right"><b>${rupees(p.opening_balance_paise)}</b></td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    </div>` : '<div class="at2-empty">No opening balances entered yet — put them on the customer, supplier or account first.</div>'}`;

  body.querySelector('#lg-post-open').onclick = async (e) => {
    const asOn = body.querySelector('#lg-open-date').value;
    if (!asOn) return toast('Pick the as-on date', 'warning');
    e.target.disabled = true;
    try {
      const out = await api('POST', '/accounting/opening-balances', { as_on: asOn });
      toast(out.reused ? 'Already posted for that date' : `Posted ${out.lines} lines`, 'success');
      state.tab = 'journals';
      await loadTab();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  };
}

function paintLocks(container, body) {
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Close a period</span></div>
      <div style="padding:14px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div class="form-group" style="margin:0"><label>Lock everything up to</label><input type="date" id="lg-lock-date"></div>
        <div class="form-group" style="margin:0;flex:1;min-width:200px"><label>Reason</label><input type="text" id="lg-lock-reason" placeholder="e.g. Q1 filed"></div>
        <button class="btn btn-primary" id="lg-lock">Close period</button>
      </div>
      <p class="at2-note" style="padding:0 14px 14px">Once closed, nothing can post on or before that date — including invoices and payments raised by mistake in the wrong month.</p>
    </div>

    ${locks.length ? `
    <div class="card" style="margin-top:12px">
      <div class="card-header"><span class="card-title">History</span></div>
      <div class="table-wrap"><table class="at2-tbl">
        <thead><tr><th>Locked up to</th><th>Reason</th><th>By</th><th>When</th><th></th></tr></thead>
        <tbody>
          ${locks.map(l => `
            <tr>
              <td><b>${esc(day(l.locked_upto))}</b></td>
              <td>${esc(l.reason || '—')}</td>
              <td>${esc(l.locked_by_name || '—')}</td>
              <td>${esc(when(l.created_at))}</td>
              <td><button class="at2-photo" data-unlock="${esc(l.id)}" title="Reopen">${ICONS.close}</button></td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    </div>` : ''}`;

  body.querySelector('#lg-lock').onclick = async () => {
    const date = body.querySelector('#lg-lock-date').value;
    const reason = body.querySelector('#lg-lock-reason').value.trim();
    if (!date) return toast('Pick the date to lock up to', 'warning');
    try {
      await api('POST', '/accounting/period-locks', { locked_upto: date, reason });
      toast('Period closed', 'success');
      await loadTab();
      paint(container);
    } catch (err) { toast(err.message, 'error'); }
  };

  body.querySelectorAll('[data-unlock]').forEach(btn => {
    btn.onclick = async () => {
      const reason = prompt('Reopening a closed period is recorded. Why?');
      if (!reason) return;
      try {
        await api('DELETE', `/accounting/period-locks/${btn.dataset.unlock}`, { reason });
        toast('Period reopened', 'success');
        await loadTab();
        paint(container);
      } catch (err) { toast(err.message, 'error'); }
    };
  });
}

function paintAudit(body) {
  if (!audit.length) {
    body.innerHTML = '<div class="at2-empty">Nothing recorded yet.</div>';
    return;
  }
  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>On</th><th>Reason</th><th>Changed</th></tr></thead>
      <tbody>
        ${audit.map(a => {
    let changed = '';
    try {
      const before = a.before_json ? (typeof a.before_json === 'string' ? JSON.parse(a.before_json) : a.before_json) : null;
      if (before && Object.values(before)[0] && typeof Object.values(before)[0] === 'object' && 'from' in Object.values(before)[0]) {
        changed = Object.entries(before).map(([k, v]) => `${k}: ${v.from ?? '—'} → ${v.to ?? '—'}`).join('; ');
      }
    } catch { /* an unreadable payload is still worth showing the row for */ }
    return `
          <tr>
            <td style="white-space:nowrap">${esc(when(a.created_at))}</td>
            <td>${esc(a.actor_name || a.actor_id || '—')}<div style="font-size:0.7rem;color:var(--text-dim)">${esc(a.actor_role || '')}</div></td>
            <td><span class="at2-chip ${a.action.includes('reverse') || a.action.includes('merge') ? 'warn' : 'muted'}">${esc(a.action)}</span></td>
            <td>${esc(a.entity_type)}</td>
            <td>${esc(a.reason || '—')}</td>
            <td style="max-width:280px;font-size:0.78rem;color:var(--text-dim)">${esc(changed)}</td>
          </tr>`;
  }).join('')}
      </tbody>
    </table></div>`;
}

// A manual entry still has to balance — the modal will not let you save until
// debits equal credits, because the server would refuse it anyway.
function openJournalModal(container) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const options = accounts.filter(a => a.active)
    .map(a => `<option value="${esc(a.id)}">${esc(a.code)} — ${esc(a.name)}</option>`).join('');

  const lineHtml = () => `
    <tr class="jm-line">
      <td><select class="jm-acct"><option value="">— account —</option>${options}</select></td>
      <td><input type="number" class="jm-debit" step="0.01" min="0" placeholder="0.00"></td>
      <td><input type="number" class="jm-credit" step="0.01" min="0" placeholder="0.00"></td>
      <td><input type="text" class="jm-memo" placeholder="note"></td>
      <td><button class="at2-photo jm-del" title="Remove">${ICONS.close}</button></td>
    </tr>`;

  overlay.innerHTML = `
    <div class="modal" style="max-width:720px">
      <div class="modal-header">
        <span class="modal-title">New Journal Entry</span>
        <button class="modal-close" id="jm-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
          <div class="form-group"><label>Date</label><input type="date" id="jm-date" value="${ymd(new Date())}"></div>
          <div class="form-group" style="grid-column:span 2"><label>Narration</label><input type="text" id="jm-narration" placeholder="What is this entry for?"></div>
        </div>
        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Note</th><th></th></tr></thead>
          <tbody id="jm-lines">${lineHtml()}${lineHtml()}</tbody>
        </table></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:10px">
          <button class="btn btn-secondary" id="jm-add">${ICONS.plus}<span>Add line</span></button>
          <div id="jm-totals" style="font-weight:800"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="jm-cancel">Cancel</button>
        <button class="btn btn-primary" id="jm-save" disabled>Post Entry</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#jm-close').onclick = close;
  $('#jm-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const recalc = () => {
    let debit = 0; let credit = 0;
    overlay.querySelectorAll('.jm-line').forEach(tr => {
      debit += Math.round((Number(tr.querySelector('.jm-debit').value) || 0) * 100);
      credit += Math.round((Number(tr.querySelector('.jm-credit').value) || 0) * 100);
    });
    const diff = debit - credit;
    $('#jm-totals').innerHTML = `
      Debit ${rupees(debit)} · Credit ${rupees(credit)}
      <span style="color:${diff === 0 ? 'var(--primary)' : 'var(--danger)'}">
        ${diff === 0 ? ' · balanced' : ` · out by ${rupees(Math.abs(diff))}`}
      </span>`;
    $('#jm-save').disabled = !(debit > 0 && diff === 0);
  };

  const wire = () => {
    overlay.querySelectorAll('.jm-line').forEach(tr => {
      tr.querySelector('.jm-debit').oninput = () => { if (tr.querySelector('.jm-debit').value) tr.querySelector('.jm-credit').value = ''; recalc(); };
      tr.querySelector('.jm-credit').oninput = () => { if (tr.querySelector('.jm-credit').value) tr.querySelector('.jm-debit').value = ''; recalc(); };
      tr.querySelector('.jm-del').onclick = () => {
        if (overlay.querySelectorAll('.jm-line').length <= 2) return toast('An entry needs at least two lines', 'warning');
        tr.remove();
        recalc();
      };
    });
  };
  wire();
  recalc();

  $('#jm-add').onclick = () => {
    $('#jm-lines').insertAdjacentHTML('beforeend', lineHtml());
    wire();
  };

  $('#jm-save').onclick = async () => {
    const lines = [...overlay.querySelectorAll('.jm-line')].map(tr => ({
      account_id: tr.querySelector('.jm-acct').value,
      debit: tr.querySelector('.jm-debit').value || 0,
      credit: tr.querySelector('.jm-credit').value || 0,
      memo: tr.querySelector('.jm-memo').value.trim(),
    })).filter(l => l.account_id && (Number(l.debit) || Number(l.credit)));

    if (lines.length < 2) return toast('Pick an account and an amount on at least two lines', 'warning');

    const btn = $('#jm-save');
    btn.disabled = true;
    try {
      await api('POST', '/accounting/journals', {
        date: $('#jm-date').value,
        narration: $('#jm-narration').value.trim(),
        lines,
        // The key is this form's own submission, so a double click posts once.
        idempotency_key: `manual:${$('#jm-date').value}:${Date.now()}`,
      });
      toast('Entry posted', 'success');
      close();
      await loadTab();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

async function openJournalDetail(container, id) {
  let payload;
  try {
    payload = await api('GET', `/accounting/journals/${encodeURIComponent(id)}`);
  } catch (err) { return toast(err.message, 'error'); }
  const { journal, lines } = payload;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:640px">
      <div class="modal-header">
        <span class="modal-title">${esc(journal.journal_no || 'Journal')}</span>
        <button class="modal-close" id="jd-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:14px">
          <div style="font-weight:700">${esc(journal.narration || '—')}</div>
          <div style="font-size:0.84rem;color:var(--text-dim);margin-top:4px">
            ${esc(day(journal.journal_date))} · ${esc(SOURCE_LABEL[journal.source_type] || journal.source_type)}
            ${journal.status === 'reversed' ? ' · <b style="color:var(--danger)">reversed</b>' : ''}
            ${journal.reversal_of_id ? ' · this entry is itself a reversal' : ''}
          </div>
        </div>
        <div class="table-wrap"><table class="at2-tbl">
          <thead><tr><th>Account</th><th>Party</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th></tr></thead>
          <tbody>
            ${lines.map(l => `
              <tr>
                <td><code style="font-size:0.72rem">${esc(l.account_code)}</code> ${esc(l.account_name)}
                  ${l.memo ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(l.memo)}</div>` : ''}</td>
                <td>${esc(l.party_name || '—')}</td>
                <td style="text-align:right">${Number(l.debit_paise) ? rupees(l.debit_paise) : '—'}</td>
                <td style="text-align:right">${Number(l.credit_paise) ? rupees(l.credit_paise) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="jd-cancel">Close</button>
        ${journal.status === 'posted' ? '<button class="btn btn-secondary" id="jd-reverse">Reverse this entry</button>' : ''}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#jd-close').onclick = close;
  overlay.querySelector('#jd-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const reverseBtn = overlay.querySelector('#jd-reverse');
  if (reverseBtn) {
    reverseBtn.onclick = async () => {
      const reason = prompt('A posted entry is never edited — it is reversed, and both stay on record. Why is this one wrong?');
      if (!reason) return;
      try {
        await api('POST', `/accounting/journals/${journal.id}/reverse`, { reason });
        toast('Reversal posted', 'success');
        close();
        await loadTab();
        paint(container);
      } catch (err) { toast(err.message, 'error'); }
    };
  }
}

function openAccountModal(container, existing = null) {
  const isEdit = !!existing;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? 'Edit Account' : 'New Account'}</span>
        <button class="modal-close" id="am-close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label>Code</label>
          <input type="text" id="am-code" value="${esc(existing?.code || '')}" ${isEdit ? 'disabled' : ''} placeholder="e.g. 5810"></div>
        <div class="form-group"><label>Name</label>
          <input type="text" id="am-name" value="${esc(existing?.name || '')}"></div>
        <div class="form-group"><label>Type</label>
          <select id="am-type" ${isEdit ? 'disabled' : ''}>
            ${['asset', 'liability', 'equity', 'income', 'expense'].map(t =>
    `<option value="${t}"${existing?.type === t ? ' selected' : ''}>${t}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Group</label>
          <input type="text" id="am-subtype" value="${esc(existing?.subtype || 'other')}" ${existing?.is_system ? 'disabled' : ''}></div>
        <div class="form-group"><label>Opening balance (₹)</label>
          <input type="number" id="am-open" step="0.01" value="${existing ? (Number(existing.opening_balance_paise || 0) / 100) : ''}"></div>
        ${isEdit && !existing.is_system ? `<label class="at2-check"><input type="checkbox" id="am-active" ${existing.active ? 'checked' : ''}> Active</label>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="am-cancel">Cancel</button>
        <button class="btn btn-primary" id="am-save">${isEdit ? 'Save' : 'Create'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#am-close').onclick = close;
  $('#am-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  $('#am-save').onclick = async () => {
    const body = {
      name: $('#am-name').value.trim(),
      subtype: $('#am-subtype').value.trim() || 'other',
      opening_balance: $('#am-open').value || 0,
    };
    if (!isEdit) {
      body.code = $('#am-code').value.trim();
      body.type = $('#am-type').value;
      if (!body.code || !body.name) return toast('Code and name are required', 'warning');
    } else if ($('#am-active')) {
      body.active = $('#am-active').checked;
    }
    const btn = $('#am-save');
    btn.disabled = true;
    try {
      if (isEdit) await api('PATCH', `/accounting/accounts/${existing.id}`, body);
      else await api('POST', '/accounting/accounts', body);
      toast('Saved', 'success');
      close();
      await loadTab();
      paint(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

// Exports match what is on screen, filters and all.
function exportCurrent() {
  if (state.tab === 'journals') {
    if (!journals.length) return toast('Nothing to export', 'info');
    return exportToCSV(`journals-${state.from}-to-${state.to}.csv`, journals.map(j => ({
      No: j.journal_no || '', Date: ymd(j.journal_date), Narration: j.narration || '',
      Source: SOURCE_LABEL[j.source_type] || j.source_type, Status: j.status,
      'Amount (₹)': (Number(j.total_paise) / 100).toFixed(2), 'Posted by': j.posted_by_name || '',
    })));
  }
  if (state.tab === 'trial' && trial) {
    return exportToCSV(`trial-balance-${state.from}-to-${state.to}.csv`,
      trial.accounts.filter(a => a.debit_paise || a.credit_paise).map(a => ({
        Code: a.code, Account: a.name, Type: a.type, Group: a.subtype,
        'Debit (₹)': (a.debit_paise / 100).toFixed(2),
        'Credit (₹)': (a.credit_paise / 100).toFixed(2),
        'Balance (₹)': (a.balance_paise / 100).toFixed(2),
      })));
  }
  if (state.tab === 'coa') {
    return exportToCSV('chart-of-accounts.csv', accounts.map(a => ({
      Code: a.code, Name: a.name, Type: a.type, Group: a.subtype,
      System: a.is_system ? 'Yes' : 'No', Active: a.active ? 'Yes' : 'No',
      'Opening (₹)': (Number(a.opening_balance_paise || 0) / 100).toFixed(2),
    })));
  }
  if (state.tab === 'audit') {
    return exportToCSV('audit-trail.csv', audit.map(a => ({
      When: when(a.created_at), Who: a.actor_name || '', Role: a.actor_role || '',
      Action: a.action, Entity: a.entity_type, Id: a.entity_id || '', Reason: a.reason || '',
    })));
  }
  toast('Nothing to export on this tab', 'info');
}
