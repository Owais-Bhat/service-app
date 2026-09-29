// Financial Reports — read straight from the books.
//
// Nothing on this page is stored. Every figure is worked out from posted
// journals, or from the invoices and bills that produced them, at the moment
// the report is opened; each report says what it covers and on what basis. The
// last tab, Health Check, sets the books against themselves and says plainly
// where they disagree.
import { toast, exportToCSV } from '../utils.js';
import { ICONS } from '../icons.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` });

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// A plain number a spreadsheet can add up — no symbol, no thousands commas.
const plain = (paise) => (Number(paise || 0) / 100).toFixed(2);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (v) => v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const TABS = [
  { key: 'summary', label: 'Owner Summary' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'pl', label: 'Profit & Loss' },
  { key: 'bs', label: 'Balance Sheet' },
  { key: 'ageing', label: 'Who Owes What' },
  { key: 'ledger', label: 'Account Ledger' },
  { key: 'statement', label: 'Party Statement' },
  { key: 'gst', label: 'GST' },
  { key: 'stock', label: 'Stock Value' },
  { key: 'jobs', label: 'Job Profit' },
  { key: 'health', label: 'Health Check' },
];
const GST_TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'sales', label: 'Sales Register' },
  { key: 'hsn', label: 'HSN Summary' },
  { key: 'purchases', label: 'Purchases & ITC' },
];

const state = {
  tab: 'summary', gstTab: 'summary', kind: 'receivable',
  from: '', to: ymd(new Date()), asOn: ymd(new Date()),
  account: '', party: '',
};
let accounts = [];
let parties = [];
let root = null;

const fyStart = (month = 4) => {
  const now = new Date();
  const year = now.getMonth() + 1 >= month ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${pad(month)}-01`;
};

export async function renderReportsTab(container) {
  root = container;
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    const [biz, accs] = await Promise.all([api('/accounting/business'), api('/accounting/accounts')]);
    accounts = accs;
    if (!state.from) state.from = fyStart(biz.business?.fy_start_month || 4);
    if (!state.account) state.account = accounts.find(a => a.code === '1000')?.code || accounts[0]?.code || '';
    paint();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
  }
}

function paint() {
  root.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1 class="at2-title">Financial Reports</h1>
          <p class="at2-sub">Worked out from the books each time you open them — nothing here is stored</p>
        </div>
        <div class="at2-headbtns" id="rp-actions"></div>
      </div>
      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>
      <div class="at2-panel"><div class="at2-body" id="rp-body"></div></div>
    </div>`;
  root.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { state.tab = b.dataset.tab; paint(); }; });
  load();
}

// ── small pieces ────────────────────────────────────────────────────────

const table = (heads, rows, { right = [], foot = null } = {}) => `
  <div class="table-wrap"><table class="at2-tbl">
    <thead><tr>${heads.map((h, i) => `<th${right.includes(i) ? ' style="text-align:right"' : ''}>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr>${r.map((c, i) => `<td${right.includes(i) ? ' style="text-align:right"' : ''}>${c}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${heads.length}" style="text-align:center;padding:26px;color:var(--text-dim)">Nothing to show</td></tr>`}
    ${foot ? `<tr style="border-top:2px solid var(--border);font-weight:800">${foot.map((c, i) => `<td${right.includes(i) ? ' style="text-align:right"' : ''}>${c}</td>`).join('')}</tr>` : ''}
    </tbody>
  </table></div>`;

const scopeNote = (text) => `<p class="at2-note" style="margin:0 0 12px">${esc(text)}</p>`;

const rangeBar = (extra = '') => `
  <div class="at2-filters" style="margin-bottom:12px">
    <label style="font-size:0.78rem;color:var(--text-dim)">From <input type="date" id="rp-from" value="${esc(state.from)}"></label>
    <label style="font-size:0.78rem;color:var(--text-dim)">To <input type="date" id="rp-to" value="${esc(state.to)}"></label>
    ${extra}
    <button class="btn btn-secondary btn-sm" id="rp-apply">Show</button>
  </div>`;
const asOnBar = (extra = '') => `
  <div class="at2-filters" style="margin-bottom:12px">
    <label style="font-size:0.78rem;color:var(--text-dim)">As on <input type="date" id="rp-ason" value="${esc(state.asOn)}"></label>
    ${extra}
    <button class="btn btn-secondary btn-sm" id="rp-apply">Show</button>
  </div>`;

const bind = (body) => {
  const apply = body.querySelector('#rp-apply');
  if (!apply) return;
  apply.onclick = () => {
    const f = body.querySelector('#rp-from'); const t = body.querySelector('#rp-to'); const a = body.querySelector('#rp-ason');
    if (f) state.from = f.value;
    if (t) state.to = t.value;
    if (a) state.asOn = a.value;
    const acc = body.querySelector('#rp-account'); if (acc) state.account = acc.value;
    const par = body.querySelector('#rp-party'); if (par) state.party = par.value;
    load();
  };
};

const setExport = (filename, rows) => {
  const box = root.querySelector('#rp-actions');
  if (!box) return;
  box.innerHTML = rows && rows.length
    ? `<button class="btn btn-secondary" id="rp-export">${ICONS.download}<span>Export CSV</span></button>` : '';
  const btn = box.querySelector('#rp-export');
  if (btn) btn.onclick = () => exportToCSV(filename, rows);
};

async function load() {
  const body = root.querySelector('#rp-body');
  body.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  setExport(null, null);
  try {
    await ({ summary, reminders: remindersTab, pl, bs, ageing, ledger, statement, gst, stock, jobs, health }[state.tab])(body);
  } catch (err) {
    body.innerHTML = `<div class="at2-empty" style="color:var(--danger)">${esc(err.message)}</div>`;
  }
}

// ── the reports ─────────────────────────────────────────────────────────

async function summary(body) {
  const s = await api(`/reports/owner-summary?on=${state.asOn}`);
  const card = (label, value, sub = '', tone = '') => `
    <div class="card" style="padding:12px 16px;min-width:170px;flex:1">
      <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.04em">${label}</div>
      <div style="font-size:1.3rem;font-weight:800;${tone}">${value}</div>
      ${sub ? `<div style="font-size:0.74rem;color:var(--text-dim);margin-top:2px">${sub}</div>` : ''}
    </div>`;
  const row = (...cards) => `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">${cards.join('')}</div>`;
  const heading = (t) => `<h4 style="margin:16px 0 8px;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-dim)">${t}</h4>`;
  const bad = 'color:var(--danger)';
  const attention = [
    ...s.attention.failing_checks.map(c => `Health check: ${c}`),
    ...(s.attention.unposted_tickets ? [`${s.attention.unposted_tickets} ticket(s) could not be posted to the books`] : []),
    ...(s.money.technician_cash_oldest_days >= 3 ? [`Cash with technicians for ${s.money.technician_cash_oldest_days} days — ${s.money.technician_cash_tickets} ticket(s)`] : []),
    ...(s.stock.low_items ? [`${s.stock.low_items} item(s) at or below their minimum stock`] : []),
  ];

  body.innerHTML = `${asOnBar()}
    ${attention.length ? `<div class="card" style="border-left:3px solid var(--warning);padding:12px 14px;margin-bottom:14px"><b>Needs a look</b><ul style="margin:6px 0 0 18px;font-size:0.85rem;line-height:1.7">${attention.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`
      : '<div class="card" style="border-left:3px solid var(--primary);padding:12px 14px;margin-bottom:14px"><b style="color:var(--primary)">Nothing needs attention.</b></div>'}
    ${heading(`Today, ${day(s.as_on)}`)}
    ${row(card('Sales', rupees(s.today.sales_paise), 'billed, after discounts'), card('Money collected', rupees(s.today.collected_paise), 'against bills'))}
    ${heading(`This month, from ${day(s.month.from)}`)}
    ${row(card('Sales', rupees(s.month.sales_paise)), card('Collected', rupees(s.month.collected_paise)), card('Costs', rupees(s.month.expenses_paise), 'goods sold + expenses'),
      card('Profit', rupees(s.month.profit_paise), '', s.month.profit_paise < 0 ? bad : ''))}
    ${heading('Where the money is')}
    ${row(card('Cash in hand', rupees(s.money.cash_in_hand_paise)), card('Bank', rupees(s.money.bank_paise)),
      card('With technicians', rupees(s.money.with_technicians_paise), s.money.technician_cash_tickets ? `${s.money.technician_cash_tickets} ticket(s), oldest ${s.money.technician_cash_oldest_days} day(s)` : 'nothing pending'))}
    ${heading('Owed')}
    ${row(card('Customers owe you', rupees(s.receivable.total_paise), s.receivable.overdue_paise ? `${rupees(s.receivable.overdue_paise)} older than 30 days` : 'nothing overdue', s.receivable.overdue_paise ? bad : ''),
      card('You owe suppliers', rupees(s.payable.total_paise), s.payable.overdue_paise ? `${rupees(s.payable.overdue_paise)} older than 30 days` : ''),
      card('GST payable this month', rupees(s.gst.month_payable_paise), `${rupees(s.gst.collected_paise)} collected − ${rupees(s.gst.claimable_paise)} claimable`),
      card('Stock value', rupees(s.stock.value_paise)))}
    ${s.receivable.top.length ? `${heading('Biggest amounts owed')}${table(['Customer', 'Owes', 'Oldest'], s.receivable.top.map(p => [`<b>${esc(p.party)}</b>${p.phone ? `<br><small style="color:var(--text-dim)">${esc(p.phone)}</small>` : ''}`, rupees(p.outstanding_paise), `${p.oldest_days} days`]), { right: [1, 2] })}` : ''}
    ${heading('The evening message')}
    <div class="card" style="padding:12px 14px;font-size:0.86rem;line-height:1.7;color:var(--text-soft)">${esc(s.text)}</div>`;
  bind(body);
  setExport(`owner-summary-${s.as_on}.csv`, [
    { Item: 'Sales today', Amount: plain(s.today.sales_paise) }, { Item: 'Collected today', Amount: plain(s.today.collected_paise) },
    { Item: 'Sales this month', Amount: plain(s.month.sales_paise) }, { Item: 'Costs this month', Amount: plain(s.month.expenses_paise) }, { Item: 'Profit this month', Amount: plain(s.month.profit_paise) },
    { Item: 'Cash in hand', Amount: plain(s.money.cash_in_hand_paise) }, { Item: 'Bank', Amount: plain(s.money.bank_paise) }, { Item: 'With technicians', Amount: plain(s.money.with_technicians_paise) },
    { Item: 'Customers owe', Amount: plain(s.receivable.total_paise) }, { Item: 'You owe suppliers', Amount: plain(s.payable.total_paise) },
    { Item: 'GST payable this month', Amount: plain(s.gst.month_payable_paise) }, { Item: 'Stock value', Amount: plain(s.stock.value_paise) },
  ]);
}

async function remindersTab(body) {
  const r = await api(`/reports/reminders?as_on=${state.asOn}`);
  const ago = (v) => {
    if (!v) return 'never';
    const d = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
    return d <= 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`;
  };
  body.innerHTML = `${asOnBar()}${scopeNote(r.scope.basis)}
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <div class="card" style="padding:12px 18px"><div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase">Overdue from customers</div><div style="font-size:1.3rem;font-weight:800;color:var(--danger)">${rupees(r.totals.customers_paise)}</div></div>
      <div class="card" style="padding:12px 18px"><div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase">Overdue to suppliers</div><div style="font-size:1.3rem;font-weight:800">${rupees(r.totals.suppliers_paise)}</div></div>
    </div>
    <h4 style="margin:6px 0 8px">Customers to remind</h4>
    ${table(['Customer', 'Overdue', 'Total owed', 'Oldest', 'Last reminded', ''], r.customers.map(c => [
      `<b>${esc(c.party)}</b>${c.phone ? `<br><small style="color:var(--text-dim)">${esc(c.phone)}</small>` : '<br><small style="color:var(--danger)">no phone number</small>'}`,
      `<b style="color:var(--danger)">${rupees(c.overdue_paise)}</b>`, rupees(c.outstanding_paise), `${c.oldest_days} days`,
      c.times_reminded ? `${ago(c.last_reminded_at)} <small style="color:var(--text-dim)">(${c.times_reminded}×)</small>` : 'never',
      `<div style="display:flex;gap:6px;justify-content:flex-end">
        ${c.whatsapp_url ? `<button class="btn btn-primary btn-sm" data-wa="${esc(c.party_id)}">WhatsApp</button>` : ''}
        <button class="btn btn-secondary btn-sm" data-mark="${esc(c.party_id)}" title="Note that you reminded them another way">Mark reminded</button>
      </div>`]), { right: [1, 2, 3] })}
    ${r.suppliers.length ? `<h4 style="margin:18px 0 8px">Suppliers you owe</h4>${table(['Supplier', 'Overdue', 'Total owed', 'Oldest'], r.suppliers.map(s => [`<b>${esc(s.party)}</b>`, rupees(s.overdue_paise), rupees(s.outstanding_paise), `${s.oldest_days} days`]), { right: [1, 2, 3] })}` : ''}`;
  bind(body);

  const byId = new Map(r.customers.map(c => [c.party_id, c]));
  const mark = async (id, channel) => {
    const c = byId.get(id);
    try {
      await apiPost('/reports/reminders/mark', { party_id: id, amount_paise: c.outstanding_paise, channel });
      toast('Noted', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };
  body.querySelectorAll('[data-wa]').forEach(b => {
    b.onclick = () => { window.open(byId.get(b.dataset.wa).whatsapp_url, '_blank', 'noopener'); mark(b.dataset.wa, 'whatsapp'); };
  });
  body.querySelectorAll('[data-mark]').forEach(b => { b.onclick = () => mark(b.dataset.mark, 'call'); });
  setExport(`reminders-${state.asOn}.csv`, r.customers.map(c => ({ Customer: c.party, Phone: c.phone || '', Overdue: plain(c.overdue_paise), Total: plain(c.outstanding_paise), 'Oldest days': c.oldest_days, Message: c.message })));
}

async function pl(body) {
  const r = await api(`/reports/profit-loss?from=${state.from}&to=${state.to}`);
  const section = (title, list) => list.length ? `
    <tr><td colspan="2" style="padding-top:14px;font-weight:800;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-dim)">${title}</td></tr>
    ${list.map(a => `<tr><td>${esc(a.code)} · ${esc(a.name)}</td><td style="text-align:right">${rupees(a.amount_paise)}</td></tr>`).join('')}` : '';
  const line = (label, v, strong) => `<tr style="${strong ? 'font-weight:800;border-top:2px solid var(--border)' : 'font-weight:700;border-top:1px solid var(--border)'}"><td>${label}</td><td style="text-align:right;${v < 0 ? 'color:var(--danger)' : ''}">${rupees(v)}</td></tr>`;
  const t = r.totals;
  body.innerHTML = `${rangeBar()}${scopeNote(`${day(r.scope.from)} to ${day(r.scope.to)}. ${r.scope.basis}`)}
    <div class="table-wrap"><table class="at2-tbl" style="max-width:640px"><tbody>
      ${section('Income', r.income)}${line('Total income', t.income_paise)}
      ${section('Cost of goods sold', r.cogs)}${line('Gross profit', t.gross_profit_paise)}
      ${section('Expenses', r.expenses)}${line('Total expenses', t.expenses_paise)}
      ${line('Net profit / (loss)', t.net_profit_paise, true)}
    </tbody></table></div>`;
  bind(body);
  setExport(`profit-and-loss-${state.from}-to-${state.to}.csv`, [
    ...r.income.map(a => ({ Section: 'Income', Code: a.code, Account: a.name, Amount: plain(a.amount_paise) })),
    ...r.cogs.map(a => ({ Section: 'Cost of goods sold', Code: a.code, Account: a.name, Amount: plain(a.amount_paise) })),
    ...r.expenses.map(a => ({ Section: 'Expenses', Code: a.code, Account: a.name, Amount: plain(a.amount_paise) })),
    { Section: 'Net profit', Code: '', Account: '', Amount: plain(t.net_profit_paise) },
  ]);
}

async function bs(body) {
  const r = await api(`/reports/balance-sheet?as_on=${state.asOn}`);
  const t = r.totals;
  const side = (title, list, total, extra = '') => `
    <div class="card" style="flex:1;min-width:280px">
      <div class="card-header"><span class="card-title">${title}</span></div>
      ${table(['Account', 'Amount'], [...list.map(a => [`${esc(a.code)} · ${esc(a.name)}`, rupees(a.balance_paise)]), ...(extra ? [extra] : [])], { right: [1], foot: ['Total', rupees(total)] })}
    </div>`;
  body.innerHTML = `${asOnBar()}${scopeNote(`As on ${day(r.scope.as_on)}. ${r.scope.basis}`)}
    ${r.balanced ? '' : `<div class="card" style="border-left:3px solid var(--danger);padding:12px;margin-bottom:12px"><b style="color:var(--danger)">The balance sheet is out by ${rupees(t.difference_paise)}.</b> This should not be possible — see Health Check.</div>`}
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      ${side('Assets', r.assets, t.assets_paise)}
      ${side('Liabilities & equity', [...r.liabilities, ...r.equity], t.liabilities_and_equity_paise,
        [`<i>Profit / (loss) to date</i>`, rupees(t.profit_to_date_paise)])}
    </div>`;
  bind(body);
  setExport(`balance-sheet-${state.asOn}.csv`, [
    ...r.assets.map(a => ({ Side: 'Assets', Code: a.code, Account: a.name, Amount: plain(a.balance_paise) })),
    ...r.liabilities.map(a => ({ Side: 'Liabilities', Code: a.code, Account: a.name, Amount: plain(a.balance_paise) })),
    ...r.equity.map(a => ({ Side: 'Equity', Code: a.code, Account: a.name, Amount: plain(a.balance_paise) })),
    { Side: 'Equity', Code: '', Account: 'Profit / (loss) to date', Amount: plain(t.profit_to_date_paise) },
  ]);
}

async function ageing(body) {
  const r = await api(`/reports/ageing?kind=${state.kind}&as_on=${state.asOn}`);
  const t = r.totals;
  const toggle = `<span style="display:inline-flex;gap:6px">
    ${['receivable', 'payable'].map(k => `<button class="btn btn-sm ${state.kind === k ? 'btn-primary' : 'btn-secondary'}" data-kind="${k}">${k === 'receivable' ? 'Customers owe us' : 'We owe suppliers'}</button>`).join('')}</span>`;
  body.innerHTML = `${asOnBar(toggle)}${scopeNote(`As on ${day(r.scope.as_on)}. ${r.scope.basis}`)}
    ${table(['Party', '0–30 days', '31–60', '61–90', '90+', 'Outstanding', 'Paid ahead'],
      r.parties.map(p => [`<b>${esc(p.party)}</b>${p.phone ? `<br><small style="color:var(--text-dim)">${esc(p.phone)}</small>` : ''}`,
        rupees(p.d0_30), rupees(p.d31_60), rupees(p.d61_90), p.d90_plus ? `<b style="color:var(--danger)">${rupees(p.d90_plus)}</b>` : rupees(0),
        `<b>${rupees(p.outstanding_paise)}</b>`, p.advance_paise ? rupees(p.advance_paise) : '—']),
      { right: [1, 2, 3, 4, 5, 6], foot: ['Total', rupees(t.d0_30), rupees(t.d31_60), rupees(t.d61_90), rupees(t.d90_plus), rupees(t.outstanding_paise), rupees(t.advance_paise)] })}`;
  body.querySelectorAll('[data-kind]').forEach(b => { b.onclick = () => { state.kind = b.dataset.kind; load(); }; });
  bind(body);
  setExport(`${state.kind}-ageing-${state.asOn}.csv`, r.parties.map(p => ({
    Party: p.party, Phone: p.phone || '', '0-30': plain(p.d0_30), '31-60': plain(p.d31_60), '61-90': plain(p.d61_90), '90+': plain(p.d90_plus),
    Outstanding: plain(p.outstanding_paise), 'Paid ahead': plain(p.advance_paise),
  })));
}

async function ledger(body) {
  const acc = state.account;
  const r = await api(`/reports/account-ledger?account=${encodeURIComponent(acc)}&from=${state.from}&to=${state.to}`);
  const picker = `<select id="rp-account" style="padding:7px 10px;border-radius:9px;min-width:240px">
    ${accounts.map(a => `<option value="${esc(a.code)}"${a.code === acc ? ' selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('')}</select>`;
  body.innerHTML = `${rangeBar(picker)}${scopeNote(`${r.account.code} · ${r.account.name}, ${day(r.scope.from)} to ${day(r.scope.to)}. Balance is shown the way this kind of account is normally read (${['asset', 'expense'].includes(r.account.type) ? 'debits add' : 'credits add'}).`)}
    ${table(['Date', 'Journal', 'Narration', 'Party', 'Debit', 'Credit', 'Balance'], [
      ['', '', '<i>Opening balance</i>', '', '', '', `<b>${rupees(r.opening_paise)}</b>`],
      ...r.rows.map(x => [day(x.date), `<code>${esc(x.journal_no)}</code>`, `${esc(x.narration || '')}${x.status === 'reversed' ? ' <span class="at2-chip danger">reversed</span>' : ''}`, esc(x.party || ''),
        x.debit_paise ? rupees(x.debit_paise) : '', x.credit_paise ? rupees(x.credit_paise) : '', rupees(x.balance_paise)]),
    ], { right: [4, 5, 6], foot: ['', '', '<i>Closing balance</i>', '', rupees(r.totals.debit_paise), rupees(r.totals.credit_paise), rupees(r.closing_paise)] })}`;
  bind(body);
  setExport(`ledger-${r.account.code}-${state.from}-to-${state.to}.csv`, r.rows.map(x => ({
    Date: x.date, Journal: x.journal_no, Narration: x.narration || '', Party: x.party || '', Debit: plain(x.debit_paise), Credit: plain(x.credit_paise), Balance: plain(x.balance_paise),
  })));
}

async function statement(body) {
  if (!parties.length) parties = await api('/parties?limit=1000');
  if (!state.party && parties[0]) state.party = parties[0].id;
  const picker = `<select id="rp-party" style="padding:7px 10px;border-radius:9px;min-width:240px">
    ${parties.map(p => `<option value="${esc(p.id)}"${p.id === state.party ? ' selected' : ''}>${esc(p.display_name)}</option>`).join('')}</select>`;
  if (!state.party) { body.innerHTML = '<div class="at2-empty">No customers or suppliers yet.</div>'; return; }
  const r = await api(`/reports/party-statement?party_id=${state.party}&from=${state.from}&to=${state.to}`);
  const dr = (v) => (v >= 0 ? `${rupees(v)} Dr` : `${rupees(-v)} Cr`);
  body.innerHTML = `${rangeBar(picker)}${scopeNote(`${r.party.display_name}, ${day(r.scope.from)} to ${day(r.scope.to)}. Dr means they owe us; Cr means we owe them (or they paid ahead).`)}
    ${table(['Date', 'Journal', 'Narration', 'Debit', 'Credit', 'Balance'], [
      ['', '', '<i>Opening balance</i>', '', '', `<b>${dr(r.opening_paise)}</b>`],
      ...r.rows.map(x => [day(x.date), `<code>${esc(x.journal_no)}</code>`, esc(x.narration || ''), x.debit_paise ? rupees(x.debit_paise) : '', x.credit_paise ? rupees(x.credit_paise) : '', dr(x.balance_paise)]),
    ], { right: [3, 4, 5], foot: ['', '', '<i>Closing balance</i>', rupees(r.totals.debit_paise), rupees(r.totals.credit_paise), dr(r.closing_paise)] })}`;
  bind(body);
  setExport(`statement-${r.party.display_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${state.from}-to-${state.to}.csv`, r.rows.map(x => ({
    Date: x.date, Journal: x.journal_no, Narration: x.narration || '', Debit: plain(x.debit_paise), Credit: plain(x.credit_paise), Balance: plain(x.balance_paise),
  })));
}

async function gst(body) {
  const sub = state.gstTab;
  const subs = `<div class="at2-tabs" style="margin-bottom:12px">${GST_TABS.map(t => `<button class="at2-tab${sub === t.key ? ' on' : ''}" data-gst="${t.key}">${t.label}</button>`).join('')}</div>`;
  const q = `from=${state.from}&to=${state.to}`;
  let html = ''; let csv = null; let name = `gst-${sub}-${state.from}-to-${state.to}.csv`;

  if (sub === 'summary') {
    const s = await api(`/reports/gst/summary?${q}`);
    const tax = (o) => o.cgst_paise + o.sgst_paise + o.igst_paise;
    html = `${scopeNote(s.scope.basis)}
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        ${[['Tax collected on sales', s.output.tax_paise, ''], ['Tax you can claim', s.input.tax_paise, ''], ['Net payable', s.payable.total_paise, s.payable.total_paise < 0 ? 'color:var(--primary)' : 'color:var(--danger)']]
          .map(([l, v, st]) => `<div class="card" style="padding:12px 18px"><div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase">${l}</div><div style="font-size:1.3rem;font-weight:800;${st}">${rupees(v)}</div></div>`).join('')}
      </div>
      ${table(['', 'Taxable value', 'CGST', 'SGST/UTGST', 'IGST', 'Tax'], [
        ['<b>Sales</b>', rupees(s.output.taxable_paise), rupees(s.output.cgst_paise), rupees(s.output.sgst_paise), rupees(s.output.igst_paise), rupees(tax(s.output))],
        ['<b>Purchases (claimable)</b>', rupees(s.input.taxable_paise), rupees(s.input.cgst_paise), rupees(s.input.sgst_paise), rupees(s.input.igst_paise), rupees(tax(s.input))],
        ['<b>Payable</b>', '', rupees(s.payable.cgst_paise), rupees(s.payable.sgst_paise), rupees(s.payable.igst_paise), `<b>${rupees(s.payable.total_paise)}</b>`],
      ], { right: [1, 2, 3, 4, 5] })}
      <h4 style="margin:18px 0 8px">Sales by category</h4>
      ${table(['Category', 'Documents', 'Taxable', 'CGST', 'SGST/UTGST', 'IGST', 'Total'], s.output.by_category.map(c => [c.category, c.documents, rupees(c.taxable_paise), rupees(c.cgst_paise), rupees(c.sgst_paise), rupees(c.igst_paise), rupees(c.total_paise)]), { right: [1, 2, 3, 4, 5, 6] })}
      ${s.input.ineligible_tax_paise ? `<p class="at2-note">${rupees(s.input.ineligible_tax_paise)} of purchase tax was marked not claimable and is kept in the cost.</p>` : ''}
      <h4 style="margin:18px 0 8px">Do the documents agree with the tax accounts?</h4>
      ${table(['Tax', 'Documents say', 'Ledger says', 'Difference'], Object.entries(s.against_ledger).map(([k, v]) => [
        k.replace('_', ' ').toUpperCase(), rupees(v.documents_paise), rupees(v.ledger_paise),
        v.difference_paise ? `<b style="color:var(--danger)">${rupees(v.difference_paise)}</b>` : '✓']), { right: [1, 2, 3] })}
      <p class="at2-note">A difference usually means a manual journal touched a tax account, or a bill was posted from a ticket rather than an invoice.</p>`;
    csv = [
      { Line: 'Sales taxable', CGST: plain(s.output.cgst_paise), 'SGST/UTGST': plain(s.output.sgst_paise), IGST: plain(s.output.igst_paise), Taxable: plain(s.output.taxable_paise) },
      { Line: 'Purchases claimable', CGST: plain(s.input.cgst_paise), 'SGST/UTGST': plain(s.input.sgst_paise), IGST: plain(s.input.igst_paise), Taxable: plain(s.input.taxable_paise) },
      { Line: 'Payable', CGST: plain(s.payable.cgst_paise), 'SGST/UTGST': plain(s.payable.sgst_paise), IGST: plain(s.payable.igst_paise), Taxable: '' },
    ];
  } else if (sub === 'sales') {
    const { rows } = await api(`/reports/gst/sales-register?${q}`);
    html = `${scopeNote('Every issued invoice, credit note and debit note, plus service and installation bills. Categories follow the usual return sections. Working paper — not a return.')}
      ${table(['Date', 'Document', 'Party', 'GSTIN', 'Category', 'Taxable', 'CGST', 'SGST/UTGST', 'IGST', 'Total'],
        rows.map(r => [day(r.date), `<code>${esc(r.doc_no)}</code>${r.source === 'ticket' ? ' <span class="at2-chip warn">ticket</span>' : ''}`, esc(r.party), esc(r.gstin || '—'), r.category,
          rupees(r.taxable_paise), rupees(r.cgst_paise), rupees(r.sgst_paise), rupees(r.igst_paise), rupees(r.total_paise)]),
        { right: [5, 6, 7, 8, 9], foot: ['', '', '', '', 'Total', ...['taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'total_paise'].map(k => rupees(rows.reduce((n, r) => n + r[k], 0)))] })}`;
    csv = rows.map(r => ({ Date: r.date, Document: r.doc_no, Type: r.doc_type, Party: r.party, GSTIN: r.gstin, 'Place of supply': r.place_of_supply, Category: r.category,
      Taxable: plain(r.taxable_paise), CGST: plain(r.cgst_paise), 'SGST/UTGST': plain(r.sgst_paise), IGST: plain(r.igst_paise), Total: plain(r.total_paise) }));
  } else if (sub === 'hsn') {
    const { rows, note } = await api(`/reports/gst/hsn-summary?${q}`);
    html = `${scopeNote(note)}
      ${table(['HSN / SAC', 'Unit', 'Rate', 'Quantity', 'Taxable', 'CGST', 'SGST/UTGST', 'IGST', 'Tax'],
        rows.map(r => [r.hsn_sac ? esc(r.hsn_sac) : '<span class="at2-chip warn">no HSN</span>', esc(r.unit), `${r.rate_pct}%`, r.quantity, rupees(r.taxable_paise), rupees(r.cgst_paise), rupees(r.sgst_paise), rupees(r.igst_paise), rupees(r.tax_paise)]),
        { right: [2, 3, 4, 5, 6, 7, 8] })}`;
    csv = rows.map(r => ({ 'HSN/SAC': r.hsn_sac, Unit: r.unit, 'Rate %': r.rate_pct, Quantity: r.quantity, Taxable: plain(r.taxable_paise), CGST: plain(r.cgst_paise), 'SGST/UTGST': plain(r.sgst_paise), IGST: plain(r.igst_paise) }));
  } else {
    const { rows } = await api(`/reports/gst/purchase-register?${q}`);
    html = `${scopeNote('Supplier bills and purchase returns. Tax marked "not claimable" stays in the cost of the goods.')}
      ${table(['Date', 'Document', "Supplier's bill", 'Supplier', 'GSTIN', 'Taxable', 'CGST', 'SGST/UTGST', 'IGST', 'Claim'],
        rows.map(r => [day(r.date), `<code>${esc(r.doc_no)}</code>`, esc(r.supplier_ref || '—'), esc(r.party), esc(r.gstin || '—'),
          rupees(r.taxable_paise), rupees(r.cgst_paise), rupees(r.sgst_paise), rupees(r.igst_paise), r.eligible ? 'Yes' : '<span class="at2-chip warn">no</span>']),
        { right: [5, 6, 7, 8] })}`;
    csv = rows.map(r => ({ Date: r.date, Document: r.doc_no, 'Supplier bill': r.supplier_ref, Supplier: r.party, GSTIN: r.gstin, Taxable: plain(r.taxable_paise), CGST: plain(r.cgst_paise), 'SGST/UTGST': plain(r.sgst_paise), IGST: plain(r.igst_paise), 'Input credit': r.eligible ? 'Yes' : 'No' }));
  }

  body.innerHTML = `${subs}${rangeBar()}${html}`;
  body.querySelectorAll('[data-gst]').forEach(b => { b.onclick = () => { state.gstTab = b.dataset.gst; load(); }; });
  bind(body);
  setExport(name, csv);
}

async function stock(body) {
  const v = await api('/reports/stock-valuation');
  body.innerHTML = `${scopeNote(`${v.scope.basis}. Set beside the Inventory account so a gap cannot hide.`)}
    ${v.difference_paise ? `<div class="card" style="border-left:3px solid var(--warning);padding:12px;margin-bottom:12px">
      Stock on hand is worth <b>${rupees(v.total_value_paise)}</b>; the Inventory account holds <b>${rupees(v.ledger_inventory_paise)}</b>.
      The <b>${rupees(v.difference_paise)}</b> gap is stock the books have not been told about — usually stock that was on the shelf before accounting started.
    </div>` : `<div class="card" style="border-left:3px solid var(--primary);padding:12px;margin-bottom:12px">The stock on hand and the Inventory account agree at <b>${rupees(v.total_value_paise)}</b>.</div>`}
    ${table(['Item', 'SKU', 'On hand', 'Avg cost', 'Value'], v.items.filter(i => i.quantity || i.value_paise).map(i => [
      `<b>${esc(i.name)}</b>${i.quantity_matches === false ? ' <span class="at2-chip danger">ledger mismatch</span>' : ''}`, esc(i.sku || '—'), `${i.quantity} ${esc(i.unit || '')}`, rupees(i.avg_cost_paise), rupees(i.value_paise)]),
      { right: [2, 3, 4], foot: ['Total', '', '', '', rupees(v.total_value_paise)] })}`;
  setExport('stock-valuation.csv', v.items.map(i => ({ Item: i.name, SKU: i.sku || '', Unit: i.unit, 'On hand': i.quantity, 'Avg cost': plain(i.avg_cost_paise), Value: plain(i.value_paise) })));
}

async function jobs(body) {
  const r = await api(`/jobs/profitability?from=${state.from}&to=${state.to}`);
  const t = r.totals;
  body.innerHTML = `${rangeBar()}${scopeNote(r.scope.basis)}
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      ${[['Revenue', t.revenue_paise], ['Cost', t.cost_paise], ['Margin', t.margin_paise]].map(([l, v]) => `<div class="card" style="padding:12px 18px"><div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase">${l}</div><div style="font-size:1.3rem;font-weight:800">${rupees(v)}</div></div>`).join('')}
      ${t.unbilled_jobs ? `<div class="card" style="padding:12px 18px;border-left:3px solid var(--warning)"><div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase">Not billed yet</div><div style="font-size:1.3rem;font-weight:800">${t.unbilled_jobs} job(s), ${rupees(t.unbilled_cost_paise)} cost</div></div>` : ''}
    </div>
    ${table(['Date', 'Ticket', 'Customer', 'Revenue', 'Cost', 'Margin', '%'], r.jobs.map(j => [day(j.job_date), `<code>${esc(j.ticket_no || '—')}</code>`, esc(j.customer || '—'),
      j.unbilled ? '<span class="at2-chip warn">not billed</span>' : rupees(j.revenue_paise), rupees(j.total_cost_paise),
      `<b style="${j.margin_paise < 0 ? 'color:var(--danger)' : ''}">${rupees(j.margin_paise)}</b>`, j.margin_pct === null ? '—' : `${j.margin_pct}%`]), { right: [3, 4, 5, 6] })}`;
  bind(body);
  setExport(`job-profit-${state.from}-to-${state.to}.csv`, r.jobs.map(j => ({ Date: String(j.job_date || '').slice(0, 10), Ticket: j.ticket_no, Customer: j.customer, Revenue: plain(j.revenue_paise), Cost: plain(j.total_cost_paise), Margin: plain(j.margin_paise) })));
}

async function health(body) {
  const r = await api(`/reports/reconciliation?as_on=${state.asOn}`);
  const shown = (c) => c.count ? String(c.a_paise) : rupees(c.a_paise);
  const shownB = (c) => c.count ? String(c.b_paise) : rupees(c.b_paise);
  body.innerHTML = `${asOnBar()}
    <div class="card" style="border-left:3px solid var(--${r.ok ? 'primary' : 'danger'});padding:12px 14px;margin-bottom:14px">
      <b style="color:var(--${r.ok ? 'primary' : 'danger'})">${r.ok ? 'The books agree with themselves.' : 'Something does not agree — see below.'}</b>
      <div style="font-size:0.82rem;color:var(--text-soft);margin-top:4px">Each line sets two independent sources side by side. A tick means they match to the paisa.</div>
    </div>
    ${table(['', 'Check', 'One side', 'Other side', 'Difference', ''], r.checks.map(c => [
      `<span class="at2-chip ${c.ok ? 'ok' : 'danger'}">${c.ok ? 'OK' : 'Check'}</span>`, `<b>${esc(c.label)}</b><br><small style="color:var(--text-dim)">${esc(c.note || '')}</small>`,
      shown(c), shownB(c), c.ok ? '—' : `<b style="color:var(--danger)">${c.count ? c.difference_paise : rupees(c.difference_paise)}</b>`, '']), { right: [2, 3, 4] })}`;
  bind(body);
  setExport(`health-check-${state.asOn}.csv`, r.checks.map(c => ({ Check: c.label, OK: c.ok ? 'Yes' : 'No', 'One side': c.count ? c.a_paise : plain(c.a_paise), 'Other side': c.count ? c.b_paise : plain(c.b_paise), Difference: c.count ? c.difference_paise : plain(c.difference_paise) })));
}
