// Data Migration — bringing what already exists into the books.
//
// Tickets billed before the ledger started, stock already on the shelf, and the
// hand-kept service register each get the same three steps: look at what would
// happen (nothing is written), confirm, and read the books' own checks from
// before and after. The History tab keeps those readings.
import { toast } from '../utils.js';

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
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (v) => v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const when = (v) => v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const TABS = [
  { key: 'backup', label: 'Backup' },
  { key: 'vyapar', label: 'From Vyapar' },
  { key: 'tickets', label: 'Older Tickets' },
  { key: 'stock', label: 'Stock on the Shelf' },
  { key: 'log', label: 'Service Register' },
  { key: 'history', label: 'History' },
  { key: 'auto', label: 'Evening Summary' },
];

const state = { tab: 'backup', from: '' };
let root = null;

export async function renderMigrationTab(container) {
  root = container;
  if (!state.from) { const d = new Date(); d.setDate(d.getDate() - 90); state.from = ymd(d); }
  paint();
}

function paint() {
  root.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1 class="at2-title">Data Migration</h1>
          <p class="at2-sub">Bring what already exists into the books — look first, then confirm; the books check themselves before and after</p>
        </div>
      </div>
      <div class="at2-tabs">
        ${TABS.map(t => `<button class="at2-tab${state.tab === t.key ? ' on' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>
      <div class="at2-panel"><div class="at2-body" id="mg-body"></div></div>
    </div>`;
  root.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { state.tab = b.dataset.tab; paint(); }; });
  ({ backup, vyapar, tickets, stock, log, history, auto }[state.tab])(root.querySelector('#mg-body'));
}

// ── 0b. from Vyapar ─────────────────────────────────────────────────────
// Three steps, each run on its own, checked, and safe to run again: parties with what they owe today,
// items with the stock really on the shelf, and the old records to look at. The old records are never posted
// to the books — the opening balances already hold the money.

const vy = { session: null, file: '', summary: null, status: null, asOn: ymd(new Date()), results: {} };
const TYPE_NAMES = {
  sale: 'Invoices', estimate: 'Quotations', payment_in: 'Payments received', purchase: 'Purchases', payment_out: 'Payments made',
  sale_return: 'Credit notes', purchase_return: 'Purchase returns', expense: 'Expenses', delivery_challan: 'Delivery challans', other: 'Other',
};

async function vyapar(body) {
  try { vy.status = await api('GET', '/vyapar/status'); } catch { vy.status = null; }
  const done = (step) => vy.status?.last?.[step];
  const doneLine = (step) => {
    const d = done(step);
    return d ? `<div class="at2-note" style="color:var(--primary)">✔ Done ${esc(when(d.at))}${d.as_on ? ` (as on ${esc(day(d.as_on))})` : ''} — run again any time; nothing is counted twice.</div>` : '';
  };

  body.innerHTML = `
    ${intro('Bring your Vyapar data in: customers and suppliers with what they owe today, items with the stock really on the shelf, and every old invoice, quotation, payment and purchase to look up. Do <b>Backup</b> first.')}
    ${notice('primary', `<b>How the money is handled.</b> Each party's balance as it stands in Vyapar today becomes its <i>opening balance</i>, and the stock on the shelf becomes <i>opening stock</i>. The old invoices and payments are kept as <b>Past Records</b> to read — they are not posted again, so nothing is counted twice and your GST returns are not disturbed.`)}

    <div class="at2-h">1. Choose the Vyapar backup file</div>
    <div class="at2-filters" style="gap:10px;flex-wrap:wrap">
      <input type="file" id="vy-file" accept=".vyb,.vyp,.zip">
      <span class="at2-note" id="vy-reading" style="margin:0"></span>
    </div>
    <p class="at2-note">In Vyapar: <b>Backup → Backup to device</b>. The file ends in <code>.vyb</code>. It is read here and kept only for an hour; it is not saved on the server.</p>

    <div id="vy-after"></div>`;

  const file = body.querySelector('#vy-file');
  const reading = body.querySelector('#vy-reading');
  const after = body.querySelector('#vy-after');

  const paintSummary = () => {
    if (!vy.summary) { after.innerHTML = ''; return; }
    const m = vy.summary;
    const types = Object.entries(m.documents.by_type).sort((a, b) => b[1].count - a[1].count);
    after.innerHTML = `
      <div class="at2-h">What is in <b>${esc(vy.file)}</b></div>
      ${stats(
        stat('Customers & suppliers', m.parties.count),
        stat('They owe you', rupees(m.parties.owe_us.paise)),
        stat('You owe them', rupees(m.parties.we_owe.paise)),
        stat('Items', m.items.count),
        stat('Items with stock', m.items.with_stock),
        stat('Stock value (at cost)', rupees(m.items.stock_value_paise)),
        stat('Old records', m.documents.count),
      )}
      ${m.items.negative_stock ? notice('warn', `<b>${m.items.negative_stock} items show negative stock in Vyapar</b> (${Math.abs(m.items.negative_units).toLocaleString('en-IN')} units in all) — usually purchases that were never entered. They come in with <b>0</b> stock; only the ${m.items.with_stock} items really in stock get opening stock. Count the shelf and use Stock → Stock Count to correct the rest.`) : ''}
      ${m.items.without_price ? `<p class="at2-note">${m.items.without_price} items have no selling price in Vyapar and come in with ₹0.</p>` : ''}
      ${m.parties.with_phone < m.parties.count ? `<p class="at2-note">${(m.parties.count - m.parties.with_phone).toLocaleString('en-IN')} of ${m.parties.count.toLocaleString('en-IN')} parties have no phone number in Vyapar (WhatsApp reminders and campaigns need one).</p>` : ''}
      ${m.warnings_total ? notice('warn', `<b>${m.warnings_total} thing${m.warnings_total === 1 ? '' : 's'} to check:</b><ul>${m.warnings.slice(0, 8).map(w => `<li>${esc(w)}</li>`).join('')}${m.warnings_total > 8 ? `<li>…and ${m.warnings_total - 8} more</li>` : ''}</ul>`) : ''}
      ${table(['Old records', 'Count', 'From', 'To', 'Amount'], types.map(([k, v]) => [esc(TYPE_NAMES[k] || k), v.count.toLocaleString('en-IN'), esc(day(v.from)), esc(day(v.to)), rupees(v.total_paise)]), [1, 4])}

      <div class="at2-h" style="margin-top:18px">2. Bring it in — in this order</div>
      <div class="at2-filters"><label style="font-size:0.78rem;color:var(--text-dim)">Balances and stock are as on <input type="date" id="vy-ason" value="${esc(vy.asOn)}"></label>
        <span class="at2-note" style="margin:0">Use the day the backup was taken (or the day you stop using Vyapar).</span></div>

      <div class="card" style="margin:10px 0"><div style="padding:14px">
        <b>A. Customers & suppliers, with what they owe today</b>
        <div class="at2-note">Creates ${m.parties.count.toLocaleString('en-IN')} parties. Someone already here under the same phone number or name is recognised and filled in, never duplicated. Two shops that share a phone stay two accounts.</div>
        ${doneLine('parties')}<div id="vy-r-parties">${vy.results.parties || ''}</div>
        <button class="btn btn-primary" id="vy-parties" style="margin-top:8px">Bring in the parties</button>
      </div></div>

      <div class="card" style="margin:10px 0"><div style="padding:14px">
        <b>B. Items, with the stock really on the shelf</b>
        <div class="at2-note">Creates ${m.items.count.toLocaleString('en-IN')} items and opening stock for the ${m.items.with_stock} that are in stock (${rupees(m.items.stock_value_paise)} at cost), as one entry: Inventory against Opening Balance Equity.</div>
        ${doneLine('items')}<div id="vy-r-items">${vy.results.items || ''}</div>
        <button class="btn btn-primary" id="vy-items" style="margin-top:8px">Bring in the items and stock</button>
      </div></div>

      <div class="card" style="margin:10px 0"><div style="padding:14px">
        <b>C. Old invoices, quotations, payments and purchases — to look up</b>
        <div class="at2-note">Keeps ${m.documents.count.toLocaleString('en-IN')} records with their ${m.documents.lines.toLocaleString('en-IN')} item lines under <b>Sales → Past Records (Vyapar)</b>, tied to the customer. Not posted to the books.</div>
        ${doneLine('history')}<div id="vy-r-history">${vy.results.history || ''}</div>
        <button class="btn btn-primary" id="vy-history" style="margin-top:8px">Keep the old records</button>
      </div></div>

      <div class="card" style="margin:10px 0"><div style="padding:14px">
        <b>D. Put the opening balances into the books</b>
        <div class="at2-note">After A and B: posts <i>one</i> entry for every party's opening balance (Receivable / Payable against Opening Balance Equity), dated as above. Doing it twice for the same date changes nothing. Do this once you have checked the numbers; also enter the real bank and cash balances under Accounts.</div>
        <div id="vy-r-open">${vy.results.open || ''}</div>
        <button class="btn btn-secondary" id="vy-open" style="margin-top:8px">Post the opening balances</button>
      </div></div>`;

    body.querySelector('#vy-ason').onchange = (e) => { vy.asOn = e.target.value || vy.asOn; };

    const run = (id, key, path, label, confirmText, render) => {
      const btn = body.querySelector(`#${id}`);
      btn.onclick = async () => {
        if (confirmText && !confirm(confirmText)) return;
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Working…';
        try {
          const out = await api('POST', path, { as_on: vy.asOn });
          vy.results[key] = `<div class="at2-notice" style="margin:8px 0">${render(out)}</div>`;
          body.querySelector(`#vy-r-${key}`).innerHTML = vy.results[key];
          toast(`${label} — done`, 'success');
        } catch (err) { toast(err.message, 'error'); }
        btn.disabled = false;
        btn.textContent = original;
      };
    };
    run('vy-parties', 'parties', `/vyapar/${vy.session}/parties`, 'Parties',
      `Bring in the parties, with their balances as on ${day(vy.asOn)}?`,
      (o) => `<b>${o.created.toLocaleString('en-IN')} parties added</b>${o.matched_existing ? `, ${o.matched_existing} recognised as already here` : ''}. ${o.with_opening_balance.toLocaleString('en-IN')} have an opening balance: they owe you <b>${rupees(o.owe_us_paise)}</b>, you owe <b>${rupees(o.we_owe_paise)}</b>.${o.kept_existing_balance ? ` ${o.kept_existing_balance} already had a balance here and kept it.` : ''} <i>These balances reach the books when you do step D.</i>`);
    run('vy-items', 'items', `/vyapar/${vy.session}/items`, 'Items',
      `Bring in the items and the stock as on ${day(vy.asOn)}?`,
      (o) => `<b>${o.created.toLocaleString('en-IN')} items added</b>; ${o.with_stock} with opening stock worth <b>${rupees(o.stock_value_paise)}</b>.${o.negative_stock ? ` ${o.negative_stock} had negative stock in Vyapar and start at 0 — count them.` : ''}${o.skipped.length ? ` <b>${o.skipped.length} skipped:</b> ${o.skipped.slice(0, 3).map(x => esc(`${x.name} — ${x.why}`)).join('; ')}.` : ''}`);
    run('vy-history', 'history', `/vyapar/${vy.session}/history`, 'Old records', null,
      (o) => `<b>${o.documents.toLocaleString('en-IN')} records</b> (${o.lines.toLocaleString('en-IN')} lines) kept; ${o.matched_party.toLocaleString('en-IN')} tied to a customer or supplier. See them under Sales → Past Records.`);

    const open = body.querySelector('#vy-open');
    open.onclick = async () => {
      if (!confirm(`Post the opening balances as on ${day(vy.asOn)}? Check the parties and items first. Posting the same date twice changes nothing.`)) return;
      open.disabled = true;
      try {
        const out = await api('POST', '/accounting/opening-balances', { as_on: vy.asOn });
        vy.results.open = `<div class="at2-notice" style="margin:8px 0"><b>${out.reused ? 'Already posted for this date.' : 'Posted.'}</b> ${out.lines} lines in one entry.</div>`;
        body.querySelector('#vy-r-open').innerHTML = vy.results.open;
        toast('Opening balances posted', 'success');
      } catch (err) { toast(err.message, 'error'); }
      open.disabled = false;
    };
  };

  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    reading.textContent = `Reading ${f.name} (${(f.size / 1048576).toFixed(1)} MB)…`;
    try {
      const res = await fetch(`${API}/vyapar/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`, 'Content-Type': 'application/octet-stream', 'X-File-Name': f.name },
        body: f,
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not read that file');
      Object.assign(vy, { session: out.session, file: f.name, summary: out.summary, results: {} });
      reading.textContent = '';
      paintSummary();
    } catch (err) {
      reading.textContent = '';
      toast(err.message, 'error');
    }
  };

  // Coming back to the tab after a re-paint: the file is still held on the server for an hour.
  if (vy.session && vy.summary) paintSummary();
}

// ── 0. a copy of everything, before anything is brought in ──────────────

function backup(body) {
  body.innerHTML = `${intro('Make a copy of all the data in the portal — every table as a spreadsheet (CSV) inside one ZIP file — before moving anything new in. Passwords and login tokens are never included.')}
    <div class="at2-filters" style="gap:10px;flex-wrap:wrap">
      ${button('bk-download', 'Download backup (ZIP)', 'primary')}
      ${button('bk-email', 'Email it to me', 'secondary')}
    </div>
    <p class="at2-note" id="bk-status" style="margin-top:12px"></p>
    <p class="at2-note">"Email it to me" sends the ZIP to the address you log in with. If the file is too big for email (about 20 MB), use Download. Making a backup takes up to a minute; one at a time.</p>`;
  const status = body.querySelector('#bk-status');
  const dl = body.querySelector('#bk-download');
  const mail = body.querySelector('#bk-email');

  dl.onclick = async () => {
    dl.disabled = true; mail.disabled = true;
    status.textContent = 'Making the backup — this can take up to a minute…';
    try {
      const res = await fetch(`${API}/admin/backup/download`, { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not make the backup');
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'backup.zip';
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      status.textContent = `Downloaded ${name} (${(blob.size / 1048576).toFixed(1)} MB).`;
      toast('Backup downloaded', 'success');
    } catch (err) { status.textContent = ''; toast(err.message, 'error'); }
    dl.disabled = false; mail.disabled = false;
  };

  mail.onclick = async () => {
    mail.disabled = true;
    try {
      const out = await api('POST', '/admin/backup/email', {});
      status.textContent = `Being prepared — it will arrive at ${out.to} in a minute or two. You will also get a notification here.`;
      toast('Backup is on its way to your email', 'success');
    } catch (err) { toast(err.message, 'error'); mail.disabled = false; }
    // One at a time on the server; give the button back after a minute.
    setTimeout(() => { mail.disabled = false; }, 60000);
  };
}

// ── shared pieces ───────────────────────────────────────────────────────

const table = (heads, rows, right = []) => `
  <div class="table-wrap"><table class="at2-tbl">
    <thead><tr>${heads.map((h, i) => `<th${right.includes(i) ? ' style="text-align:right"' : ''}>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${right.includes(i) ? ' style="text-align:right"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;

const stat = (label, value, tone = '') => `<div class="at2-stat ${tone ? 'danger' : ''}"><div class="k">${label}</div><div class="v${tone ? ' bad' : ''}">${value}</div></div>`;
const stats = (...s) => `<div class="at2-stats">${s.join('')}</div>`;
const notice = (kind, html) => `<div class="at2-notice ${kind === 'primary' ? '' : kind}">${html}</div>`;
const intro = (text) => `<p class="at2-note" style="margin:0 0 12px">${text}</p>`;

// What the books' checks said before and after, only where it matters.
function beforeAfter(before, after) {
  const map = new Map(before.checks.map(c => [c.key, c]));
  const rows = after.checks.map(a => {
    const b = map.get(a.key) || a;
    const changed = b.difference_paise !== a.difference_paise || b.ok !== a.ok;
    const fmt = (c) => (c.key === 'service_blocked' ? String(c.a_paise) : rupees(c.difference_paise));
    return [esc(a.label), `<span class="at2-chip ${b.ok ? 'ok' : 'danger'}">${b.ok ? 'OK' : 'gap'}</span> ${b.ok ? '' : fmt(b)}`,
      `<span class="at2-chip ${a.ok ? 'ok' : 'danger'}">${a.ok ? 'OK' : 'gap'}</span> ${a.ok ? '' : fmt(a)}${changed ? ' <small style="color:var(--primary)">changed</small>' : ''}`];
  });
  return `<div class="at2-h">The books' own checks</div>${table(['Check', 'Before', 'After'], rows)}`;
}

const button = (id, label, kind = 'primary') => `<button class="btn btn-${kind}" id="${id}">${label}</button>`;

// ── 1. tickets billed before the ledger started ─────────────────────────

async function tickets(body) {
  body.innerHTML = `${intro('Service and installation bills made before the ledger began are still on their tickets. This posts them — on the day each was billed — so customers\' old dues, old payments and cash still with technicians are in the books. Tickets invoiced through Sales are left to Sales.')}
    <div class="at2-filters">
      <label style="font-size:0.78rem;color:var(--text-dim)">Bring in tickets billed from <input type="date" id="mg-from" value="${esc(state.from)}"></label>
      ${button('mg-check', 'Look at what would happen', 'secondary')}
    </div>
    <div id="mg-result"></div>`;
  const result = body.querySelector('#mg-result');

  body.querySelector('#mg-check').onclick = async () => {
    state.from = body.querySelector('#mg-from').value;
    result.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
    try {
      const p = await api('GET', `/migration/tickets/preview?from=${state.from}`);
      const t = p.totals;
      result.innerHTML = `
        ${p.current_from ? `<p class="at2-note">Tickets billed from <b>${day(p.current_from)}</b> are already being posted. This covers ${day(p.from)} up to the day before.</p>` : ''}
        ${stats(stat('Tickets', t.tickets), stat('Customers', t.customers), stat('Billed', rupees(t.billed_paise)), stat('Already paid', rupees(t.collected_paise)),
          stat('Still owed', rupees(t.outstanding_paise), t.outstanding_paise ? 'color:var(--danger)' : ''), stat('Cash with technicians', rupees(t.with_technicians_paise)))}
        ${p.warnings.map(w => notice('warning', esc(w))).join('')}
        ${t.tickets ? `${table(['Month', 'Tickets', 'Billed', 'Paid', 'Owed'], p.months.map(m => [m.month, m.tickets, rupees(m.billed_paise), rupees(m.collected_paise), rupees(m.outstanding_paise)]), [1, 2, 3, 4])}
        ${p.skipped.length ? `<p class="at2-note">Left out: ${p.skipped.map(s => `${s.count} — ${esc(s.reason)}`).join('; ')}.</p>` : ''}
        <div style="margin-top:14px">${button('mg-apply', `Bring in ${t.tickets} ticket${t.tickets === 1 ? '' : 's'}`)}</div>
        <p class="at2-note">Nothing is deleted or changed on the tickets. Each becomes journal entries you can see and, if needed, reverse.</p>` : notice('primary', 'No billed tickets in that window — nothing to bring in.')}`;

      const apply = result.querySelector('#mg-apply');
      if (apply) apply.onclick = async () => {
        if (!confirm(`Post ${t.tickets} ticket(s) billed from ${day(p.from)}, totalling ${rupees(t.billed_paise)}, into the books?`)) return;
        apply.disabled = true; apply.textContent = 'Posting… this can take a minute';
        try {
          const out = await api('POST', '/migration/tickets/apply', { from: p.from });
          result.innerHTML = `${notice(out.blocked ? 'warning' : 'primary', `<b>${out.posted} ticket(s) posted.</b>${out.blocked ? ` ${out.blocked} could not be posted yet — see Business &amp; Tax Setup → Service Income for the reasons.` : ''}${out.status === 'partial' ? ` The rest (${out.remaining_for_sweep}) will be posted by the automatic check within minutes.` : ''}`)}
            ${beforeAfter(out.before, out.after)}`;
          toast('Older tickets brought in', 'success');
        } catch (err) { toast(err.message, 'error'); apply.disabled = false; apply.textContent = 'Try again'; }
      };
    } catch (err) {
      result.innerHTML = notice('danger', esc(err.message));
    }
  };
}

// ── 2. stock already on the shelf ───────────────────────────────────────

async function stock(body) {
  body.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    const p = await api('GET', '/migration/stock/preview');
    body.innerHTML = `${intro('Stock that was on the shelf before the books began is counted in Stock, but the Inventory account was never told about it. This tells it — once — against Opening Balance Equity, without changing any item\'s quantity or cost.')}
      ${stats(stat('Items to bring in', p.totals.items), stat('Value', rupees(p.totals.value_paise)), stat('Need a look first', p.totals.flagged, p.totals.flagged ? 'color:var(--danger)' : ''))}
      ${p.ledger_vs_movements_paise ? notice('warning', `The Inventory account (${rupees(p.ledger_inventory_paise)}) and the stock movements (${rupees(p.movements_value_paise)}) already differ by ${rupees(Math.abs(p.ledger_vs_movements_paise))}. That is a separate problem; bringing stock in will not hide it.`) : ''}
      ${p.bookable.length ? `
      ${table(['', 'Item', 'On hand', 'Not in the books', 'Cost each', 'Value'], p.bookable.map(r => [
        `<input type="checkbox" class="mg-item" value="${esc(r.item_id)}" checked>`, `<b>${esc(r.name)}</b>${r.sku ? `<br><small style="color:var(--text-dim)">${esc(r.sku)}</small>` : ''}`,
        `${r.on_hand} ${esc(r.unit || '')}`, r.unbooked_qty > 0 ? `${r.unbooked_qty} ${esc(r.unit || '')}` : '<small style="color:var(--text-dim)">value only</small>', rupees(r.avg_cost_paise), rupees(r.unbooked_value_paise)]), [2, 3, 4, 5])}
      <div class="at2-filters" style="margin-top:14px">
        <label style="font-size:0.78rem;color:var(--text-dim)">Stock counts from <input type="date" id="mg-date" value="${ymd(new Date())}"></label>
        ${button('mg-apply', 'Bring the ticked items in')}
      </div>` : notice('primary', 'Every item\'s stock is already in the books.')}
      ${p.flagged.length ? `<div class="at2-h">Need a look first — not brought in</div>${table(['Item', 'On hand', 'In history', 'Why'], p.flagged.map(r => [`<b>${esc(r.name)}</b>`, r.on_hand, r.in_movements, esc(r.reason)]), [1, 2])}` : ''}
      <div id="mg-result"></div>`;

    const apply = body.querySelector('#mg-apply');
    if (apply) apply.onclick = async () => {
      const ids = [...body.querySelectorAll('.mg-item:checked')].map(i => i.value);
      if (!ids.length) return toast('Tick at least one item', 'warning');
      const total = p.bookable.filter(r => ids.includes(r.item_id)).reduce((s, r) => s + r.unbooked_value_paise, 0);
      if (!confirm(`Bring ${ids.length} item(s) worth ${rupees(total)} into the books?`)) return;
      apply.disabled = true;
      try {
        const out = await api('POST', '/migration/stock/apply', { date: body.querySelector('#mg-date').value, item_ids: ids });
        body.querySelector('#mg-result').innerHTML = `${notice('primary', `<b>${out.items} item(s), ${rupees(out.value_paise)} brought in.</b>`)}${beforeAfter(out.before, out.after)}`;
        toast('Stock brought into the books', 'success');
        apply.remove();
      } catch (err) { toast(err.message, 'error'); apply.disabled = false; }
    };
  } catch (err) { body.innerHTML = notice('danger', esc(err.message)); }
}

// ── 3. the hand-kept service register ───────────────────────────────────

async function log(body) {
  body.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    const p = await api('GET', '/migration/service-log/preview');
    const c = p.counts;
    body.innerHTML = `${intro(esc(p.note))}
      ${stats(stat('Entries to bring in', p.totals.entries), stat('Billed', rupees(p.totals.billed_paise)), stat('Paid', rupees(p.totals.paid_paise)), stat('Not paid', rupees(p.totals.unpaid_paise)),
        stat('On a ticket already', c.on_a_ticket), stat('Already brought in', c.already_in))}
      ${p.candidates.length ? `
      <div class="at2-filters"><label style="font-size:0.78rem"><input type="checkbox" id="mg-all" checked> Select all</label>
        <label style="font-size:0.78rem;color:var(--text-dim)">Paid money went into <select id="mg-into"><option value="cash">Cash in hand</option><option value="bank">Bank</option></select></label>
        ${button('mg-apply', 'Bring the ticked entries in')}</div>
      ${table(['', 'Date', 'Customer', 'Service', 'Technician', 'Amount', 'Status'], p.candidates.map(r => [
        `<input type="checkbox" class="mg-row" value="${esc(r.id)}" checked>`, day(r.date), `<b>${esc(r.customer)}</b>${r.phone ? `<br><small style="color:var(--text-dim)">${esc(r.phone)}</small>` : ''}`,
        esc(r.service || '—'), esc(r.technician || '—'), rupees(r.amount_paise), `<span class="at2-chip ${r.status === 'paid' ? 'ok' : 'warn'}">${esc(r.status)}</span>`]), [5])}` : notice('primary', 'No register entries are waiting.')}
      <div id="mg-result"></div>`;

    const all = body.querySelector('#mg-all');
    if (all) all.onchange = () => body.querySelectorAll('.mg-row').forEach(i => { i.checked = all.checked; });
    const apply = body.querySelector('#mg-apply');
    if (apply) apply.onclick = async () => {
      const ids = [...body.querySelectorAll('.mg-row:checked')].map(i => i.value);
      if (!ids.length) return toast('Tick at least one entry', 'warning');
      if (!confirm(`Book ${ids.length} register entr${ids.length === 1 ? 'y' : 'ies'} as service income (no GST)?`)) return;
      apply.disabled = true;
      try {
        const out = await api('POST', '/migration/service-log/apply', { ids, paid_into: body.querySelector('#mg-into').value });
        const failed = out.results.filter(r => !r.ok);
        body.querySelector('#mg-result').innerHTML = `${notice(failed.length ? 'warning' : 'primary', `<b>${out.posted} of ${out.entries} booked</b> — ${rupees(out.billed_paise)} billed, ${rupees(out.collected_paise)} received.${failed.length ? `<ul style="margin:6px 0 0 18px">${failed.slice(0, 10).map(f => `<li>${esc(f.error)}</li>`).join('')}</ul>` : ''}`)}${beforeAfter(out.before, out.after)}`;
        toast(`${out.posted} entries booked`, failed.length ? 'warning' : 'success');
        apply.remove();
      } catch (err) { toast(err.message, 'error'); apply.disabled = false; }
    };
  } catch (err) { body.innerHTML = notice('danger', esc(err.message)); }
}

// ── history ─────────────────────────────────────────────────────────────

const KIND = { tickets: 'Older tickets', stock: 'Stock on the shelf', service_log: 'Service register' };

async function history(body) {
  body.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    const runs = await api('GET', '/migration/runs');
    if (!runs.length) { body.innerHTML = '<div class="at2-empty">Nothing has been brought in yet.</div>'; return; }
    const line = (r) => {
      const s = r.summary || {};
      if (r.kind === 'tickets') return `${s.posted} of ${s.expected?.tickets ?? '?'} tickets posted from ${day(s.from)}${s.blocked ? `, ${s.blocked} blocked` : ''}`;
      if (r.kind === 'stock') return `${s.items} item(s), ${rupees(s.value_paise)}`;
      return `${s.posted} of ${s.entries} entries, ${rupees(s.billed_paise)} billed`;
    };
    body.innerHTML = runs.map(r => `
      <div class="card" style="margin-bottom:12px;padding:12px 14px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <b>${KIND[r.kind] || esc(r.kind)}</b>
          <span style="color:var(--text-dim);font-size:0.8rem">${when(r.created_at)}${r.by ? ` · ${esc(r.by)}` : ''} ${r.status === 'partial' ? '<span class="at2-chip warn">partly done</span>' : ''}</span>
        </div>
        <div style="font-size:0.86rem;margin:4px 0">${esc(line(r))}</div>
        ${beforeAfter(r.before, r.after)}
      </div>`).join('');
  } catch (err) { body.innerHTML = notice('danger', esc(err.message)); }
}

// ── the evening summary ─────────────────────────────────────────────────

async function auto(body) {
  body.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    const a = await api('GET', '/migration/automation');
    body.innerHTML = `${intro('Each evening after 8 pm the admins get one notification: the day\'s sales and collections, the month so far, what customers owe, cash still with technicians, and anything that needs a look. It is a notification inside NEST only — nothing is sent to customers.')}
      <div class="card" style="padding:14px;max-width:560px">
        <label style="display:flex;gap:10px;align-items:center;font-weight:700"><input type="checkbox" id="mg-digest" ${a.owner_digest_on ? 'checked' : ''}> Send the evening summary</label>
        <p class="at2-note" style="margin:8px 0 12px">${a.last_digest ? `Last sent for ${day(a.last_digest)}.` : 'Not sent yet.'}</p>
        ${button('mg-send', 'Send it now to see it', 'secondary')}
        <div id="mg-sent" style="margin-top:12px;font-size:0.86rem;line-height:1.7;color:var(--text-soft)"></div>
      </div>
      <p class="at2-note" style="margin-top:14px">Overdue customers are under Financial Reports → Reminders. Nothing there is sent for you — the button opens WhatsApp with the message ready and you press send.</p>`;
    body.querySelector('#mg-digest').onchange = async (e) => {
      try { await api('PUT', '/migration/automation', { owner_digest_on: e.target.checked }); toast(e.target.checked ? 'Switched on' : 'Switched off', 'success'); }
      catch (err) { toast(err.message, 'error'); e.target.checked = !e.target.checked; }
    };
    body.querySelector('#mg-send').onclick = async (e) => {
      e.target.disabled = true;
      try {
        const out = await api('POST', '/migration/automation/send-now', {});
        body.querySelector('#mg-sent').innerHTML = out.sent ? `<b>Sent:</b> ${esc(out.text)}` : `Not sent — ${esc(out.why)}.`;
      } catch (err) { toast(err.message, 'error'); }
      e.target.disabled = false;
    };
  } catch (err) { body.innerHTML = notice('danger', esc(err.message)); }
}
